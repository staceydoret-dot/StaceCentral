# HANDOFF — Today tab / path-to-psychiatry artifact

**Last updated:** 2026-09-08

This file exists because it didn't. A previous session's tooling was never committed, so
a later session had no way to find the artifact, merge into it safely, or verify a change
before publishing. Keep this file current.

---

## The artifact

- **Name:** Stacey Doret, MD
- **URL:** https://claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb
- **Size:** ~2.4 MB (a base64 vision-board JPEG is inlined in the CSS — this is expected)
- **Capabilities:** `sample`, `artifact`, `db`, `downloads`

It is a **self-publishing** page: `queueSave()` calls `artifact.publish(buildDoc())` 1.4 s
after any tap. So the live version can move without you. **Always re-read before editing**,
and expect a `conflict` if Stacey taps something mid-edit. Merge onto the newer version —
never `force`.

---

## How state is stored

All state lives in one line of the document:

```html
<script id="app-state" type="application/json">{ ...JSON.stringify(STATE)... }</script>
```

`buildDoc()` writes it as a single minified line, so a splice-by-marker edit round-trips
exactly. **Locate that line by its `<script id="app-state"` prefix, never by line number.**

`STATE.version` is a stamp only — nothing reads it. No migration logic exists.

### Keys that must never be clobbered

| Key | Shape | Why it matters |
|---|---|---|
| `checked` | `{ milestoneId: "YYYY-MM-DD" }` | **Stacey's tracker taps.** Losing this erases visible progress. |
| `notes` | `{ milestoneId: [{t, at}] }` | Her own notes, keyed the same way. |
| `phases` | `[{ id, milestones: [{id, …}] }]` | Phase/milestone tree (`p0`, `p-aid`, `p1`…`p6`). |
| `wins`, `log`, `therapy`, `jobs`, `coursework`, `programs`, `banked` | various | Accumulated history. |

**Index by `phaseId` / `milestoneId`, never by array position.** Milestone order within a
phase is not stable (e.g. `p0` is `m01,m02,m03,m04,m06,m07,m05` — note `m06` before `m05`),
so positional writes will silently corrupt the wrong row.

---

## The Today queue

`STATE.today = { date: "YYYY-MM-DD", tasks: [...] }`

Task shape:

```js
{ id, from: "claude"|"you", done, text, why, mins, url, urlLabel, since,
  at,        // date completed, only when done
  info,      // true = informational note, NOT a to-do  (see below)
  needsFile  // true = shows an "attach a file" button
}
```

### Before you replace the queue: promote the completed ones

`rollToday()` moves `done` tasks into `STATE.wins` at the next day rollover. If you replace
`today.tasks` *within the same day*, those completions are destroyed before that ever runs.
So promote them yourself first, in array order, matching `rollToday`:

```python
for t in old_tasks:
    if t.get("done"):
        st["wins"].insert(0, {"text": t["text"], "at": t.get("at") or TODAY})
st["wins"] = st["wins"][:30]
```

### `info: true` — informational rows

Added 2026-09-08 for the FMLA note ("filed and received, nothing owed from you").

Every other row renders as a tappable checkbox, and `firstOpen()` feeds the big
**"Start here — just this one"** focus card. Without a flag, a non-actionable note becomes
her single suggested next action once everything else is ticked — the exact opposite of the
intent. Five places honour the flag; change them together:

1. `firstOpen()` — skips `info`, so it never reaches the focus card
2. `renderTasks()` — renders a dashed ⓘ marker and "no action needed"; no checkbox, no
   remove button, no "carried since" nag
3. `toggleTask()` — returns early, so it cannot be ticked by tap or keyboard
4. `complete_task` tool — returns "that one is a note, not a task"
5. `todayBrief()` — labels it `FYI ONLY — not a task, never chase her on it`, so the in-page
   coach doesn't nag her about it

---

## Workflow for a change

```bash
# 1. read the live version first — it may have moved
#    Artifact action:"read" with the URL above; it saves the full HTML to a local file

# 2. merge — splice by marker, assert the untouchable keys are byte-identical
python3 tools/merge_state.py        # adapt the task list; keep the assertions

# 3. ship gate — must be 100% green before publishing
cd tools && npm install
node shipgate.js

# 4. publish, passing the URL so it updates in place rather than forking a new artifact
```

### Ship gate notes

`tools/shipgate.js` covers: clean boot (no JS errors), queue contents and order, `info`-row
behaviour, the focus card, `checked` survival (both in state and rendered on the path tab),
ticking everything without promoting an info row, and wins preservation.

**Chromium version pin.** `npm install playwright` pulls a build newer than the image's
(`/opt/pw-browsers` has 1194), so `chromium.launch()` fails looking for a missing binary.
The gate launches with an explicit path instead — update it if the image changes:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
```

Never run `npx playwright install` here.

Font requests to `fonts.googleapis.com` fail offline. That's expected — the gate filters
those out of its console-error check.

---

## Current queue (set 2026-09-08)

1. `t1` Text the Senior Director at Weston — the drafted message is in the task's `why`, so it
   renders on the "Start here" focus card ready to copy. `[Name]` is a deliberate placeholder.
2. `t2` 9/14 — APRN appointment: bring the ADA form + Q2–Q5 talking points
3. `t3` After 9/14 — submit the completed ADA form (fax 216-444-7385 / AMOforms@ccf.org)
4. `t4` After submission — call Absence Management (216-448-2247) re: interim flexibility
5. `t6` 9/17 — follow up with the Senior Director (the date she asked for in the text, so
   it is pre-agreed rather than a chase)
6. `t5` FMLA — `info: true`, no action needed

Note the ids are not in list order (`t6` sits before `t5`). That is intentional and harmless —
ids are stable handles the in-page coach refers to, and order lives in the array. Do not
renumber them to "tidy up"; the coach's `complete_task` calls reference them by id.

Promoted to `wins` on 2026-09-08: "Follow up with Ruth…" and "Ruth sent me the accomodation
request form!" (both completed that day, promoted before the queue was replaced).

`checked` at time of writing — 7 entries, unchanged:
`m06` 08-31 · `a01` `m01` `m05` `a02` `a03` `m11` all 09-05
