/**
 * iCloud CalDAV backend. Works from any machine — no Mac required — using an
 * Apple ID plus an app-specific password.
 *
 * Reminders lists are exposed as calendars whose supported components include
 * VTODO. The trade-off versus the local backend is fidelity: flags, tags,
 * subtasks and smart lists don't cross the CalDAV boundary.
 */

import { randomUUID } from "node:crypto";

import { createDAVClient, type DAVCalendar, type DAVObject } from "tsdav";

import { applyQueryFilters } from "../dates.js";
import {
  buildVTodo,
  dueLine,
  escapeText,
  formatUtc,
  getProperty,
  parseIcsDate,
  parseVTodo,
  patchVTodo,
  unescapeText,
} from "../ics.js";
import {
  BackendUnavailableError,
  NotFoundError,
  PRIORITY_TO_ICAL,
  priorityFromICal,
  UnsupportedOperationError,
  type CreateReminderInput,
  type Reminder,
  type ReminderList,
  type ReminderQuery,
  type RemindersBackend,
  type UpdateReminderInput,
} from "./types.js";

export interface CalDavBackendOptions {
  username: string;
  password: string;
  serverUrl?: string;
  /** How long to trust the cached calendar list before re-fetching it. */
  calendarCacheMs?: number;
}

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

const VTODO_FILTER = [
  {
    "comp-filter": {
      _attributes: { name: "VCALENDAR" },
      "comp-filter": { _attributes: { name: "VTODO" } },
    },
  },
];

export class CalDavBackend implements RemindersBackend {
  readonly name = "caldav" as const;

  private readonly username: string;
  private readonly password: string;
  private readonly serverUrl: string;
  private readonly calendarCacheMs: number;

  private client: DavClient | null = null;
  private calendars: DAVCalendar[] | null = null;
  private calendarsFetchedAt = 0;

  constructor(options: CalDavBackendOptions) {
    this.username = options.username;
    this.password = options.password;
    this.serverUrl = options.serverUrl ?? "https://caldav.icloud.com";
    this.calendarCacheMs = options.calendarCacheMs ?? 5 * 60_000;
  }

  async probe(): Promise<void> {
    if (!this.username || !this.password) {
      throw new BackendUnavailableError(
        "CalDAV needs ICLOUD_USERNAME and ICLOUD_APP_PASSWORD to be set.",
      );
    }
    await this.getCalendars(true);
  }

  async listLists(): Promise<ReminderList[]> {
    const calendars = await this.getCalendars();
    return calendars.map((c) => ({ id: c.url, name: displayName(c) }));
  }

  async listReminders(query: ReminderQuery): Promise<Reminder[]> {
    const client = await this.getClient();
    const calendars = await this.getCalendars();
    const wanted = query.list?.toLowerCase();

    const targets = wanted
      ? calendars.filter(
          (c) => c.url === query.list || displayName(c).toLowerCase() === wanted,
        )
      : calendars;

    const batches = await Promise.all(
      targets.map(async (calendar) => {
        const objects = await client.fetchCalendarObjects({
          calendar,
          filters: VTODO_FILTER,
        });
        return objects
          .map((o) => toReminder(o, calendar))
          .filter((r): r is Reminder => r !== null);
      }),
    );

    return applyQueryFilters(batches.flat(), query);
  }

  async getReminder(id: string): Promise<Reminder | null> {
    const found = await this.fetchObject(id);
    if (!found) return null;
    return toReminder(found.object, found.calendar);
  }

  async createReminder(input: CreateReminderInput): Promise<Reminder> {
    const client = await this.getClient();
    const calendar = await this.resolveCalendar(input.list);

    const uid = randomUUID().toUpperCase();
    const filename = `${uid}.ics`;
    const iCalString = buildVTodo({
      uid,
      summary: input.title,
      description: input.notes,
      due: input.dueAt ? dueLine(input.dueAt, input.allDay ?? false) : undefined,
      priority: PRIORITY_TO_ICAL[input.priority ?? "none"],
      completed: false,
    });

    if (input.flagged) {
      throw new UnsupportedOperationError(
        "Flagging isn't available over CalDAV. Use the local macOS backend, " +
          "or create the reminder without a flag.",
      );
    }

    const response = await client.createCalendarObject({
      calendar,
      filename,
      iCalString,
    });
    await assertOk(response, "create reminder");

    const url = joinUrl(calendar.url, filename);
    const created = await this.getReminder(url);
    if (!created) {
      throw new Error("Reminder was created but could not be read back.");
    }
    return created;
  }

  async updateReminder(id: string, patch: UpdateReminderInput): Promise<Reminder> {
    if (patch.flagged !== undefined) {
      throw new UnsupportedOperationError(
        "Flagging isn't available over CalDAV. Use the local macOS backend.",
      );
    }

    const client = await this.getClient();
    const found = await this.fetchObject(id);
    if (!found) throw new NotFoundError(`No reminder with id ${id}.`);

    const now = formatUtc(new Date());
    const changes: Record<string, string | null> = {
      "LAST-MODIFIED": `LAST-MODIFIED:${now}`,
      DTSTAMP: `DTSTAMP:${now}`,
    };

    if (patch.title !== undefined) {
      changes.SUMMARY = `SUMMARY:${escapeText(patch.title)}`;
    }
    if (patch.notes !== undefined) {
      changes.DESCRIPTION = patch.notes
        ? `DESCRIPTION:${escapeText(patch.notes)}`
        : null;
    }
    if (patch.priority !== undefined) {
      changes.PRIORITY = `PRIORITY:${PRIORITY_TO_ICAL[patch.priority]}`;
    }
    if (patch.completed !== undefined) {
      if (patch.completed) {
        changes.STATUS = "STATUS:COMPLETED";
        changes.COMPLETED = `COMPLETED:${now}`;
        changes["PERCENT-COMPLETE"] = "PERCENT-COMPLETE:100";
      } else {
        changes.STATUS = "STATUS:NEEDS-ACTION";
        changes.COMPLETED = null;
        changes["PERCENT-COMPLETE"] = null;
      }
    }
    if (patch.dueAt !== undefined) {
      if (patch.dueAt === null) {
        changes.DUE = null;
      } else {
        const existing = getProperty(parseVTodo(String(found.object.data)), "DUE");
        // Keep the reminder's current all-day-ness unless the caller says.
        const allDay =
          patch.allDay ?? (existing ? parseIcsDate(existing)?.allDay ?? false : false);
        changes.DUE = dueLine(patch.dueAt, allDay);
      }
    }

    const data = patchVTodo(String(found.object.data), changes);
    const response = await client.updateCalendarObject({
      calendarObject: { url: found.object.url, data, etag: found.object.etag },
    });
    await assertOk(response, "update reminder");

    const updated = await this.getReminder(id);
    if (!updated) throw new NotFoundError(`No reminder with id ${id}.`);
    return updated;
  }

  async deleteReminder(id: string): Promise<void> {
    const client = await this.getClient();
    const found = await this.fetchObject(id);
    if (!found) throw new NotFoundError(`No reminder with id ${id}.`);

    const response = await client.deleteCalendarObject({
      calendarObject: { url: found.object.url, etag: found.object.etag },
    });
    await assertOk(response, "delete reminder");
  }

  // --- plumbing ------------------------------------------------------------

  private async getClient(): Promise<DavClient> {
    if (this.client) return this.client;
    try {
      this.client = await createDAVClient({
        serverUrl: this.serverUrl,
        credentials: { username: this.username, password: this.password },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });
    } catch (error) {
      throw describeAuthFailure(error, this.serverUrl);
    }
    return this.client;
  }

  private async getCalendars(force = false): Promise<DAVCalendar[]> {
    const fresh = Date.now() - this.calendarsFetchedAt < this.calendarCacheMs;
    if (this.calendars && fresh && !force) return this.calendars;

    const client = await this.getClient();
    let all: DAVCalendar[];
    try {
      all = await client.fetchCalendars();
    } catch (error) {
      throw describeAuthFailure(error, this.serverUrl);
    }

    // Only calendars that accept todos are Reminders lists. iCloud advertises
    // this precisely, so a missing component list means "not a todo list".
    this.calendars = all.filter((c) =>
      (c.components ?? []).some((comp) => comp.toUpperCase() === "VTODO"),
    );
    this.calendarsFetchedAt = Date.now();
    return this.calendars;
  }

  private async resolveCalendar(wanted?: string): Promise<DAVCalendar> {
    const calendars = await this.getCalendars();
    if (!calendars.length) {
      throw new BackendUnavailableError(
        "iCloud returned no Reminders lists for this account.",
      );
    }
    if (!wanted) return calendars[0] as DAVCalendar;

    const needle = wanted.toLowerCase();
    const match = calendars.find(
      (c) => c.url === wanted || displayName(c).toLowerCase() === needle,
    );
    if (!match) throw new NotFoundError(`No Reminders list named "${wanted}".`);
    return match;
  }

  /** Finds the object and the calendar it lives in, or null if it's gone. */
  private async fetchObject(
    id: string,
  ): Promise<{ object: DAVObject; calendar: DAVCalendar } | null> {
    const client = await this.getClient();
    const calendars = await this.getCalendars();
    const calendar = calendars.find((c) => isUnder(id, c.url));
    if (!calendar) return null;

    const objects = await client.fetchCalendarObjects({
      calendar,
      objectUrls: [id],
    });
    const object = objects.find((o) => o.data);
    return object ? { object, calendar } : null;
  }
}

// --- module helpers ----------------------------------------------------------

function displayName(calendar: DAVCalendar): string {
  const name = calendar.displayName;
  if (typeof name === "string") return name;
  // tsdav occasionally hands back the raw XML node for a name; dig the text out.
  if (name && typeof name === "object" && "_text" in name) {
    return String((name as { _text: unknown })._text);
  }
  return calendar.url;
}

function joinUrl(base: string, filename: string): string {
  return base.endsWith("/") ? base + filename : `${base}/${filename}`;
}

/** True when `objectUrl` sits inside `calendarUrl`, comparing by path only. */
function isUnder(objectUrl: string, calendarUrl: string): boolean {
  const pathOf = (u: string): string => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  };
  const calendarPath = pathOf(calendarUrl);
  const objectPath = pathOf(objectUrl);
  return objectPath.startsWith(
    calendarPath.endsWith("/") ? calendarPath : `${calendarPath}/`,
  );
}

function toReminder(object: DAVObject, calendar: DAVCalendar): Reminder | null {
  if (!object.data) return null;
  const props = parseVTodo(String(object.data));
  if (!props.length) return null;

  const summary = getProperty(props, "SUMMARY");
  const description = getProperty(props, "DESCRIPTION");
  const status = getProperty(props, "STATUS")?.value.toUpperCase();
  const completedProp = getProperty(props, "COMPLETED");
  const percent = Number(getProperty(props, "PERCENT-COMPLETE")?.value ?? "0");
  const due = getProperty(props, "DUE");
  const created = getProperty(props, "CREATED");
  const modified = getProperty(props, "LAST-MODIFIED");
  const priority = Number(getProperty(props, "PRIORITY")?.value ?? "0");

  const dueParsed = due ? parseIcsDate(due) : null;
  const completedAt = completedProp ? parseIcsDate(completedProp)?.iso : undefined;

  return {
    id: object.url,
    listId: calendar.url,
    listName: displayName(calendar),
    title: summary ? unescapeText(summary.value) : "",
    notes: description ? unescapeText(description.value) : undefined,
    completed: status === "COMPLETED" || completedProp !== undefined || percent >= 100,
    completedAt,
    dueAt: dueParsed?.iso,
    allDay: dueParsed?.allDay,
    priority: priorityFromICal(priority),
    flagged: undefined,
    createdAt: created ? parseIcsDate(created)?.iso : undefined,
    modifiedAt: modified ? parseIcsDate(modified)?.iso : undefined,
  };
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    throw new BackendUnavailableError(
      `iCloud rejected the credentials while trying to ${action} (HTTP ` +
        `${response.status}). Make sure you're using an app-specific password ` +
        "from appleid.apple.com, not your main Apple ID password.",
    );
  }
  if (response.status === 404) {
    throw new NotFoundError(`Could not ${action}: the reminder no longer exists.`);
  }
  throw new Error(
    `Could not ${action}: HTTP ${response.status}${body ? ` — ${body.slice(0, 300)}` : ""}`,
  );
}

function describeAuthFailure(error: unknown, serverUrl: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthori[sz]ed|forbidden/i.test(message)) {
    return new BackendUnavailableError(
      "iCloud rejected the CalDAV login. Use an app-specific password " +
        "(generated at appleid.apple.com), and the Apple ID email as the username.",
    );
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return new BackendUnavailableError(
      `Could not reach the CalDAV server at ${serverUrl}: ${message}`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}
