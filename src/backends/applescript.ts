/**
 * Local macOS backend. Talks to the real Reminders app through JXA, so it sees
 * exactly what the user sees — every list, flags, all-day handling, and the
 * fields iCloud's CalDAV interface doesn't expose.
 *
 * Requires a Mac that is awake and unlocked, and a one-time Automation
 * permission grant.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { applyQueryFilters } from "../dates.js";
import { JXA_SCRIPT } from "./applescript-script.js";
import {
  BackendUnavailableError,
  NotFoundError,
  type CreateReminderInput,
  type Reminder,
  type ReminderList,
  type ReminderQuery,
  type RemindersBackend,
  type UpdateReminderInput,
} from "./types.js";

const execFileAsync = promisify(execFile);

/** Reminders JSON for a large account can run to several megabytes. */
const MAX_BUFFER = 64 * 1024 * 1024;

interface JxaOk<T> {
  ok: true;
  data: T;
}
interface JxaErr {
  ok: false;
  error: string;
}

export interface AppleScriptBackendOptions {
  /** Milliseconds before an osascript call is abandoned. */
  timeoutMs?: number;
}

export class AppleScriptBackend implements RemindersBackend {
  readonly name = "applescript" as const;

  private scriptPath: string | null = null;
  private readonly timeoutMs: number;

  constructor(options: AppleScriptBackendOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async probe(): Promise<void> {
    if (process.platform !== "darwin") {
      throw new BackendUnavailableError(
        "The local Reminders backend only works on macOS (this host reports " +
          `platform "${process.platform}").`,
      );
    }
    await this.run<{ lists: number }>({ op: "ping" });
  }

  async listLists(): Promise<ReminderList[]> {
    return this.run<ReminderList[]>({ op: "lists" });
  }

  async listReminders(query: ReminderQuery): Promise<Reminder[]> {
    // Pushing the list filter and the open-only narrowing into the app keeps
    // us from dragging years of completed reminders across the Apple Event
    // boundary; everything else is applied identically for both backends.
    const raw = await this.run<Reminder[]>({
      op: "query",
      list: query.list,
      openOnly: (query.status ?? "open") === "open",
    });
    return applyQueryFilters(raw, query);
  }

  async getReminder(id: string): Promise<Reminder | null> {
    try {
      return await this.run<Reminder>({ op: "get", id });
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async createReminder(input: CreateReminderInput): Promise<Reminder> {
    return this.run<Reminder>({
      op: "create",
      title: input.title,
      list: input.list,
      notes: input.notes,
      dueAt: input.dueAt,
      allDay: input.allDay ?? false,
      priority: input.priority ?? "none",
      flagged: input.flagged,
    });
  }

  async updateReminder(id: string, patch: UpdateReminderInput): Promise<Reminder> {
    return this.run<Reminder>({ op: "update", id, patch });
  }

  async deleteReminder(id: string): Promise<void> {
    await this.run<{ deleted: string }>({ op: "delete", id });
  }

  // --- plumbing ------------------------------------------------------------

  private ensureScript(): string {
    if (this.scriptPath) return this.scriptPath;
    const dir = mkdtempSync(join(tmpdir(), "apple-reminders-mcp-"));
    const path = join(dir, "reminders.jxa.js");
    writeFileSync(path, JXA_SCRIPT, "utf8");
    this.scriptPath = path;
    return path;
  }

  private async run<T>(payload: Record<string, unknown>): Promise<T> {
    const script = this.ensureScript();
    let stdout: string;

    try {
      const result = await execFileAsync(
        "osascript",
        ["-l", "JavaScript", script, JSON.stringify(payload)],
        { timeout: this.timeoutMs, maxBuffer: MAX_BUFFER },
      );
      stdout = result.stdout;
    } catch (error) {
      throw this.describeExecFailure(error);
    }

    let parsed: JxaOk<T> | JxaErr;
    try {
      parsed = JSON.parse(stdout.trim()) as JxaOk<T> | JxaErr;
    } catch {
      throw new Error(
        `Reminders returned output that wasn't JSON: ${stdout.slice(0, 400)}`,
      );
    }

    if (!parsed.ok) {
      if (/No reminder with id/i.test(parsed.error)) {
        throw new NotFoundError(parsed.error);
      }
      throw new Error(parsed.error);
    }
    return parsed.data;
  }

  /**
   * osascript failures are famously cryptic, and the two that actually happen
   * in practice — no Automation permission, and a missing binary — both have
   * concrete fixes worth spelling out.
   */
  private describeExecFailure(error: unknown): Error {
    const err = error as NodeJS.ErrnoException & {
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
    const stderr = (err.stderr ?? "").trim();

    if (err.code === "ENOENT") {
      return new BackendUnavailableError(
        "Could not find `osascript`. The local Reminders backend needs macOS.",
      );
    }
    if (err.killed || err.signal === "SIGTERM") {
      return new BackendUnavailableError(
        `Reminders did not respond within ${this.timeoutMs}ms. If this is the ` +
          "first run, macOS may be waiting on the Automation permission dialog " +
          "— approve it and try again.",
      );
    }
    if (/-1743|not authori[sz]ed|not allowed to send Apple events/i.test(stderr)) {
      return new BackendUnavailableError(
        "macOS denied permission to control Reminders. Grant it under System " +
          "Settings > Privacy & Security > Automation, then try again.",
      );
    }
    if (/-1728|Application can'?t be found|Reminders got an error/i.test(stderr)) {
      return new BackendUnavailableError(
        `The Reminders app rejected the request: ${stderr}`,
      );
    }
    return new Error(stderr || (err.message ?? "osascript failed"));
  }
}
