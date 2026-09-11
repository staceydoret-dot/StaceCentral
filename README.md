# StaceCentral — Apple Reminders connector

An [MCP](https://modelcontextprotocol.io) server that lets Claude (Desktop, Code, or any MCP client) read and write your Apple Reminders.

It has **two backends behind one set of tools**, and picks the best one available:

| Backend | Where it runs | What you get | What you give up |
|---|---|---|---|
| **Local (AppleScript)** — tried first | On your Mac, talking to the real Reminders app | Everything: all lists, flags, all-day vs timed, priorities, notes | Only works while the Mac is awake and unlocked |
| **iCloud CalDAV** — fallback | Anywhere with internet (a server, a cloud session, a Linux box) | Lists, titles, notes, due dates, priorities, completion | No flags, tags, subtasks or smart lists (Apple doesn't expose them over CalDAV) |

You can run with either one alone, or both (local-first, CalDAV when the Mac isn't reachable).

---

## 1. Install

```bash
git clone https://github.com/staceydoret-dot/stacecentral.git
cd stacecentral
npm install
npm run build
```

That produces `dist/index.js`, which is the server.

## 2. Pick your setup

### Option A — Local only (simplest, Mac required)

No configuration needed. The **first time** a tool runs, macOS will pop up a dialog asking to let your MCP client (Terminal, Claude, etc.) control Reminders. Click **Allow**.

If you clicked *Don't Allow* by mistake: **System Settings → Privacy & Security → Automation**, find your client app, and toggle Reminders on.

### Option B — iCloud CalDAV (works anywhere)

1. Go to <https://account.apple.com> → **Sign-In and Security** → **App-Specific Passwords** → generate one. Name it anything (e.g. "Reminders MCP").
2. Set these environment variables for the server:

| Variable | Value |
|---|---|
| `ICLOUD_USERNAME` | your Apple ID email |
| `ICLOUD_APP_PASSWORD` | the app-specific password from step 1 (format `xxxx-xxxx-xxxx-xxxx`) |
| `REMINDERS_BACKEND` | `caldav` — forces CalDAV; skip this to keep local-first behaviour |

> Never use your real Apple ID password here. App-specific passwords can be revoked individually without touching your account.

### Option C — Both (local-first, CalDAV fallback)

Set the two `ICLOUD_*` variables from Option B and leave `REMINDERS_BACKEND` unset (or set to `auto`). On a Mac you'll get the local backend; anywhere else, or if the Mac denies permission, it falls back to CalDAV automatically.

## 3. Connect it to Claude

### Claude Code

```bash
claude mcp add apple-reminders -- node /absolute/path/to/stacecentral/dist/index.js
```

With CalDAV credentials:

```bash
claude mcp add apple-reminders \
  -e ICLOUD_USERNAME=you@icloud.com \
  -e ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
  -- node /absolute/path/to/stacecentral/dist/index.js
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "node",
      "args": ["/absolute/path/to/stacecentral/dist/index.js"],
      "env": {
        "ICLOUD_USERNAME": "you@icloud.com",
        "ICLOUD_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

Drop the `env` block if you only want the local backend. Restart Claude Desktop afterwards.

## 4. Check it's working

Ask Claude: *"Run reminders_status"*. You should see something like:

```
mode: auto
active backend: applescript
caldav credentials configured: yes
  ✓ applescript
```

If `active backend: none`, the lines underneath say exactly why each backend was rejected.

---

## The tools

| Tool | What it does |
|---|---|
| `reminders_status` | Which backend is active and why. **Start here if anything is off.** |
| `reminders_lists` | All your lists, with ids. |
| `reminders_search` | Find reminders. Defaults to *open, all lists, soonest first*. Filter by `list`, `status`, `search` text, or a `due` bucket: `overdue`, `today`, `tomorrow`, `week`, `none`. |
| `reminders_get` | One reminder with full notes. |
| `reminders_create` | New reminder. Only `title` is required. |
| `reminders_update` | Change title / notes / due / priority / flag / completed on an existing reminder. |
| `reminders_complete` | Tick off one or many reminders in one call. |
| `reminders_delete` | Permanently remove a reminder. |

### Due dates you can type

Anywhere a tool takes a `due`, you can pass:

- ISO dates: `2026-09-14` (all-day) or `2026-09-14T17:00:00Z`
- Plain phrases: `today`, `tomorrow`, `tonight`, `tomorrow 5pm`, `friday`, `next monday 9am`, `in 3 days`, `+2w`, `5pm`
- `none` (on update) to clear the due date

Things like "june 5" aren't supported yet — you'll get a clear error rather than a wrong date.

### Example prompts

- *"What's overdue?"* → `reminders_search` with `due: overdue`
- *"Add 'call the dentist' to my Health list for tomorrow at 9"* → `reminders_create`
- *"Mark those three done"* → `reminders_complete` with the ids
- *"Move the car insurance one to next friday"* → `reminders_update` with `due: "next friday"`

---

## Configuration reference

| Variable | Default | Meaning |
|---|---|---|
| `REMINDERS_BACKEND` | `auto` | `auto` (local-first, CalDAV fallback), `applescript`, or `caldav` |
| `ICLOUD_USERNAME` | — | Apple ID email. Enables CalDAV. |
| `ICLOUD_APP_PASSWORD` | — | App-specific password. Enables CalDAV. |
| `CALDAV_SERVER_URL` | `https://caldav.icloud.com` | Override for a non-iCloud CalDAV server (untested beyond iCloud). |
| `REMINDERS_OSASCRIPT_TIMEOUT_MS` | `60000` | How long to wait for the Reminders app before giving up. |

## Known limits

- **CalDAV can't flag.** Setting `flagged` over CalDAV returns a clear "unsupported" error instead of silently dropping it.
- **Completed-reminder searches on the local backend read the whole archive.** Open-only searches are pushed down to the app and stay fast; `status: completed` / `all` pull every completed reminder ever, which can take a few seconds on a big account.
- **Creating lists isn't implemented yet.** Create the list in the Reminders app first.
- **TZID-qualified CalDAV timestamps are read as local time.** Correct when the reminder was created in your current timezone; off by the offset if it wasn't.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/
npm run dev         # tsc --watch
```

Layout:

```
src/
  index.ts                     MCP server + tool definitions
  config.ts                    environment → Config
  dates.ts                     "tomorrow 5pm" parsing, due buckets, shared query filter
  ics.ts                       minimal iCalendar VTODO reader/writer
  backends/
    types.ts                   shared Reminder model + RemindersBackend interface
    router.ts                  local-first selection with one-shot fallback
    applescript.ts             macOS backend (osascript host)
    applescript-script.ts      the JXA program that actually drives Reminders.app
    caldav.ts                  iCloud backend (tsdav)
```
