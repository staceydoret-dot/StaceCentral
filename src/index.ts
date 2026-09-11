#!/usr/bin/env node
/**
 * Apple Reminders MCP server.
 *
 * Exposes a small, deliberately opinionated tool surface over stdio: enough to
 * read, add, tick off and tidy reminders without making the model (or the
 * person driving it) think about backends, date maths or iCalendar.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { BackendRouter } from "./backends/router.js";
import type {
  Priority,
  Reminder,
  ReminderList,
  UpdateReminderInput,
} from "./backends/types.js";
import { loadConfig } from "./config.js";
import { parseDateInput } from "./dates.js";

const config = loadConfig();
const router = new BackendRouter(config);

const server = new McpServer({
  name: "apple-reminders",
  version: "0.1.0",
});

// --- schemas -------------------------------------------------------------------

const prioritySchema = z.enum(["none", "low", "medium", "high"]);

const dueDescription =
  'When it\'s due. Accepts ISO 8601 ("2026-09-14T17:00:00Z", "2026-09-14"), ' +
  'or plain phrases: "today", "tomorrow 5pm", "friday", "next monday 9am", ' +
  '"in 3 days", "+2w", "tonight". Date-only values become all-day reminders.';

const listDescription =
  "Reminders list to target, by name (case-insensitive) or id. " +
  "Omit for every list when searching, or the default list when creating.";

// --- rendering ------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDue(reminder: Reminder): string {
  if (!reminder.dueAt) return "no due date";
  const date = new Date(reminder.dueAt);
  const rendered = reminder.allDay
    ? dayFormatter.format(date)
    : dateFormatter.format(date);
  const overdue = !reminder.completed && date.getTime() < Date.now();
  return overdue ? `${rendered} (overdue)` : rendered;
}

function renderReminder(reminder: Reminder): string {
  const box = reminder.completed ? "[x]" : "[ ]";
  const flags: string[] = [];
  if (reminder.priority !== "none") flags.push(`${reminder.priority} priority`);
  if (reminder.flagged) flags.push("flagged");
  const extra = flags.length ? ` · ${flags.join(", ")}` : "";
  const notes = reminder.notes
    ? `\n    notes: ${reminder.notes.replace(/\s*\n\s*/g, " / ").slice(0, 200)}`
    : "";
  return (
    `${box} ${reminder.title} — ${formatDue(reminder)} · list: ${reminder.listName}` +
    `${extra}\n    id: ${reminder.id}${notes}`
  );
}

function renderReminders(reminders: Reminder[], heading: string): string {
  if (!reminders.length) return `${heading}\n(nothing found)`;
  return `${heading}\n\n${reminders.map(renderReminder).join("\n")}`;
}

function renderLists(lists: ReminderList[]): string {
  if (!lists.length) return "No Reminders lists found.";
  return lists.map((l) => `• ${l.name}\n    id: ${l.id}`).join("\n");
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Turns a user-facing due phrase into what the backend needs, or explains why not. */
function resolveDue(
  raw: string | undefined,
): { dueAt?: string; allDay?: boolean } | { error: string } {
  if (raw === undefined) return {};
  const parsed = parseDateInput(raw);
  if (!parsed) {
    return {
      error:
        `Couldn't understand the due date "${raw}". Try an ISO date like ` +
        `2026-09-14, or a phrase like "tomorrow 5pm", "friday", or "in 3 days".`,
    };
  }
  return { dueAt: parsed.iso, allDay: parsed.allDay };
}

// --- tools ----------------------------------------------------------------------

server.registerTool(
  "reminders_status",
  {
    title: "Reminders connector status",
    description:
      "Shows which backend is active (local macOS app or iCloud CalDAV), what was " +
      "tried, and why anything failed. Use this first when something isn't working.",
    inputSchema: {},
  },
  async () => {
    try {
      await router.resolve();
    } catch {
      // status() below reports the failure; nothing else to do here.
    }
    const status = router.status();
    const lines = [
      `mode: ${status.mode}`,
      `active backend: ${status.active ?? "none"}`,
      `caldav credentials configured: ${status.caldavConfigured ? "yes" : "no"}`,
    ];
    for (const attempt of status.attempts) {
      lines.push(
        `  ${attempt.ok ? "✓" : "✗"} ${attempt.backend}${attempt.error ? ` — ${attempt.error}` : ""}`,
      );
    }
    return text(lines.join("\n"));
  },
);

server.registerTool(
  "reminders_lists",
  {
    title: "List Reminders lists",
    description: "Returns every Reminders list with its id.",
    inputSchema: {},
  },
  async () => {
    try {
      const lists = await router.withBackend((b) => b.listLists());
      return text(renderLists(lists));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "reminders_search",
  {
    title: "Search reminders",
    description:
      "Finds reminders. Defaults to open (incomplete) reminders across all lists, " +
      "soonest due first. Use `due` for quick views like what's overdue or due today.",
    inputSchema: {
      list: z.string().optional().describe(listDescription),
      status: z
        .enum(["open", "completed", "all"])
        .optional()
        .describe("Which reminders to include. Default: open."),
      due: z
        .enum(["overdue", "today", "tomorrow", "week", "none", "any"])
        .optional()
        .describe(
          'Relative due-date bucket. "week" = next 7 days, "none" = no due date. Default: any.',
        ),
      dueBefore: z.string().optional().describe("ISO 8601 upper bound (exclusive)."),
      dueAfter: z.string().optional().describe("ISO 8601 lower bound (inclusive)."),
      search: z
        .string()
        .optional()
        .describe("Case-insensitive text to match in the title or notes."),
      limit: z.number().int().min(1).max(500).optional().describe("Max results. Default 50."),
    },
  },
  async (args) => {
    try {
      const reminders = await router.withBackend((b) =>
        b.listReminders({ ...args, limit: args.limit ?? 50 }),
      );
      const filters = [
        args.status ?? "open",
        args.due ? `due: ${args.due}` : null,
        args.list ? `list: ${args.list}` : null,
        args.search ? `matching "${args.search}"` : null,
      ].filter(Boolean);
      const heading = `${reminders.length} reminder${reminders.length === 1 ? "" : "s"} (${filters.join(", ")})`;
      return text(renderReminders(reminders, heading));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "reminders_get",
  {
    title: "Get one reminder",
    description: "Fetches a single reminder by id, including its full notes.",
    inputSchema: { id: z.string().describe("Reminder id from a previous search.") },
  },
  async ({ id }) => {
    try {
      const reminder = await router.withBackend((b) => b.getReminder(id));
      if (!reminder) return failure(new Error(`No reminder with id ${id}.`));
      return text(JSON.stringify(reminder, null, 2));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "reminders_create",
  {
    title: "Create a reminder",
    description: "Adds a new reminder. Only `title` is required.",
    inputSchema: {
      title: z.string().min(1).describe("What to be reminded of."),
      list: z.string().optional().describe(listDescription),
      notes: z.string().optional().describe("Longer free-text notes."),
      due: z.string().optional().describe(dueDescription),
      priority: prioritySchema.optional().describe("Default: none."),
      flagged: z
        .boolean()
        .optional()
        .describe("Flag the reminder. Local macOS backend only."),
    },
  },
  async (args) => {
    const due = resolveDue(args.due);
    if ("error" in due) return failure(new Error(due.error));
    try {
      const created = await router.withBackend((b) =>
        b.createReminder({
          title: args.title,
          list: args.list,
          notes: args.notes,
          dueAt: due.dueAt,
          allDay: due.allDay,
          priority: args.priority as Priority | undefined,
          flagged: args.flagged,
        }),
      );
      return text(`Created:\n${renderReminder(created)}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "reminders_update",
  {
    title: "Update a reminder",
    description:
      "Changes any combination of fields on an existing reminder. Fields you " +
      "leave out are untouched.",
    inputSchema: {
      id: z.string().describe("Reminder id from a previous search."),
      title: z.string().min(1).optional(),
      notes: z.string().optional().describe("New notes. Pass an empty string to clear."),
      due: z
        .string()
        .optional()
        .describe(`${dueDescription} Pass "none" to remove the due date.`),
      priority: prioritySchema.optional(),
      flagged: z.boolean().optional().describe("Local macOS backend only."),
      completed: z.boolean().optional().describe("Mark done (true) or reopen (false)."),
    },
  },
  async (args) => {
    const patch: UpdateReminderInput = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.priority !== undefined) patch.priority = args.priority as Priority;
    if (args.flagged !== undefined) patch.flagged = args.flagged;
    if (args.completed !== undefined) patch.completed = args.completed;

    if (args.due !== undefined) {
      if (/^(none|clear|remove)$/i.test(args.due.trim())) {
        patch.dueAt = null;
      } else {
        const due = resolveDue(args.due);
        if ("error" in due) return failure(new Error(due.error));
        patch.dueAt = due.dueAt;
        patch.allDay = due.allDay;
      }
    }

    if (!Object.keys(patch).length) {
      return failure(new Error("Nothing to update — pass at least one field."));
    }

    try {
      const updated = await router.withBackend((b) => b.updateReminder(args.id, patch));
      return text(`Updated:\n${renderReminder(updated)}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "reminders_complete",
  {
    title: "Complete reminders",
    description:
      "Marks one or more reminders as done in a single call. Handy for ticking " +
      "off a whole batch at once.",
    inputSchema: {
      ids: z.array(z.string()).min(1).describe("Reminder ids to mark complete."),
    },
  },
  async ({ ids }) => {
    const done: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const updated = await router.withBackend((b) =>
          b.updateReminder(id, { completed: true }),
        );
        done.push(`[x] ${updated.title}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push(`${id}: ${message}`);
      }
    }
    const lines = [`Completed ${done.length} of ${ids.length}.`, ...done];
    if (failed.length) lines.push("", "Failed:", ...failed);
    return { ...text(lines.join("\n")), isError: failed.length === ids.length };
  },
);

server.registerTool(
  "reminders_delete",
  {
    title: "Delete a reminder",
    description:
      "Permanently deletes a reminder. Prefer reminders_complete unless the " +
      "reminder was created by mistake.",
    inputSchema: { id: z.string().describe("Reminder id from a previous search.") },
  },
  async ({ id }) => {
    try {
      await router.withBackend((b) => b.deleteReminder(id));
      return text(`Deleted reminder ${id}.`);
    } catch (error) {
      return failure(error);
    }
  },
);

// --- boot ------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel; anything human-readable has to go to stderr.
  console.error(
    `apple-reminders MCP server ready (mode: ${config.mode}, caldav: ${
      config.caldav ? "configured" : "not configured"
    })`,
  );
}

main().catch((error) => {
  console.error("apple-reminders MCP server failed to start:", error);
  process.exit(1);
});
