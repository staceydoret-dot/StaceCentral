/**
 * Picks a backend and hands calls to it.
 *
 * In "auto" mode the local macOS backend is tried first because it's more
 * capable; if it isn't usable (wrong OS, permission denied, app not
 * responding) and CalDAV credentials exist, CalDAV takes over. The choice is
 * cached, but a mid-session unavailability error triggers one re-selection so
 * a Mac that goes to sleep doesn't strand the user for the rest of the session.
 */

import type { Config } from "../config.js";
import { AppleScriptBackend } from "./applescript.js";
import { CalDavBackend } from "./caldav.js";
import {
  BackendUnavailableError,
  type BackendName,
  type RemindersBackend,
} from "./types.js";

export interface BackendAttempt {
  backend: BackendName;
  ok: boolean;
  error?: string;
}

export interface RouterStatus {
  mode: Config["mode"];
  active: BackendName | null;
  attempts: BackendAttempt[];
  caldavConfigured: boolean;
}

export class BackendRouter {
  private readonly config: Config;
  private readonly candidates: RemindersBackend[];
  private active: RemindersBackend | null = null;
  private attempts: BackendAttempt[] = [];
  private resolving: Promise<RemindersBackend> | null = null;

  constructor(config: Config) {
    this.config = config;
    this.candidates = buildCandidates(config);
  }

  /** The backend currently serving requests, selecting one if needed. */
  async resolve(): Promise<RemindersBackend> {
    if (this.active) return this.active;
    // Coalesce concurrent first-calls so we don't probe twice in parallel.
    if (!this.resolving) {
      this.resolving = this.select().finally(() => {
        this.resolving = null;
      });
    }
    return this.resolving;
  }

  /**
   * Runs `fn` against the active backend. If the backend reports itself
   * unavailable, falls through to the next candidate exactly once.
   */
  async withBackend<T>(fn: (backend: RemindersBackend) => Promise<T>): Promise<T> {
    const backend = await this.resolve();
    try {
      return await fn(backend);
    } catch (error) {
      if (!(error instanceof BackendUnavailableError) || this.config.mode !== "auto") {
        throw error;
      }
      const remaining = this.candidates.filter((c) => c !== backend);
      if (!remaining.length) throw error;

      this.attempts.push({ backend: backend.name, ok: false, error: error.message });
      this.active = null;
      const next = await this.select(remaining);
      return fn(next);
    }
  }

  status(): RouterStatus {
    return {
      mode: this.config.mode,
      active: this.active?.name ?? null,
      attempts: [...this.attempts],
      caldavConfigured: Boolean(this.config.caldav),
    };
  }

  private async select(
    candidates: RemindersBackend[] = this.candidates,
  ): Promise<RemindersBackend> {
    const attempts: BackendAttempt[] = [];

    for (const candidate of candidates) {
      try {
        await candidate.probe();
        attempts.push({ backend: candidate.name, ok: true });
        this.attempts = attempts;
        this.active = candidate;
        return candidate;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ backend: candidate.name, ok: false, error: message });
        // Only unavailability justifies moving on; anything else is a real bug
        // in the backend we'd rather surface than paper over.
        if (!(error instanceof BackendUnavailableError)) {
          this.attempts = attempts;
          throw error;
        }
      }
    }

    this.attempts = attempts;
    throw new BackendUnavailableError(summariseFailure(this.config, attempts));
  }
}

function buildCandidates(config: Config): RemindersBackend[] {
  const local = new AppleScriptBackend({ timeoutMs: config.osascriptTimeoutMs });
  const remote = config.caldav ? new CalDavBackend(config.caldav) : null;

  switch (config.mode) {
    case "applescript":
      return [local];
    case "caldav":
      return remote ? [remote] : [];
    case "auto":
      return remote ? [local, remote] : [local];
  }
}

function summariseFailure(config: Config, attempts: BackendAttempt[]): string {
  const lines = ["No Reminders backend is usable right now."];
  for (const attempt of attempts) {
    lines.push(`  • ${attempt.backend}: ${attempt.error ?? "failed"}`);
  }
  if (config.mode === "caldav" && !config.caldav) {
    lines.push(
      "  • caldav: REMINDERS_BACKEND=caldav but ICLOUD_USERNAME / " +
        "ICLOUD_APP_PASSWORD are not set.",
    );
  }
  if (config.mode === "auto" && !config.caldav) {
    lines.push(
      "Tip: set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD to enable the CalDAV " +
        "fallback when a Mac isn't available.",
    );
  }
  return lines.join("\n");
}
