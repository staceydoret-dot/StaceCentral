/**
 * Runtime configuration, read from environment variables so the same binary
 * can be wired into Claude Desktop, Claude Code, or a headless server without
 * a config file.
 */

export type BackendMode = "auto" | "applescript" | "caldav";

export interface Config {
  /** Which backend to use, or "auto" for local-first with CalDAV fallback. */
  mode: BackendMode;
  caldav?: {
    username: string;
    password: string;
    serverUrl?: string;
  };
  osascriptTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawMode = (env.REMINDERS_BACKEND ?? "auto").toLowerCase();
  if (rawMode !== "auto" && rawMode !== "applescript" && rawMode !== "caldav") {
    throw new Error(
      `REMINDERS_BACKEND must be "auto", "applescript" or "caldav" (got "${rawMode}").`,
    );
  }

  const username = env.ICLOUD_USERNAME?.trim();
  const password = env.ICLOUD_APP_PASSWORD?.trim();

  const timeout = Number(env.REMINDERS_OSASCRIPT_TIMEOUT_MS ?? "60000");

  return {
    mode: rawMode,
    caldav:
      username && password
        ? {
            username,
            password,
            serverUrl: env.CALDAV_SERVER_URL?.trim() || undefined,
          }
        : undefined,
    osascriptTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000,
  };
}
