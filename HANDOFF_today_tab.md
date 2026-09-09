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

## Current queue (rebuilt 2026-09-09, appeal-first)

Intermittent FMLA was **approved 9/9/2026** (Notice of Eligibility + Designation Notice). The
Absence Management email documents a route for **closed/historical pay periods** — a timecard
correction request in Workday — which is why the appeal now leads the queue.

1. `t9` Open the FMLA Designation Notice, read the certified frequency and duration — gates everything
2. `t10` Email HR for the dates behind the 9/8 corrective action
3. `t11` Workday timecard corrections for covered late arrivals (ILL-1 for current/future)
4. `t12` Submit the written appeal to HR — target Fri 9/11, hard deadline **Tue 9/15**
   (7 calendar days from 9/8, weekend included)
5. `t2` 9/14 APRN appointment · 6. `t3` submit ADA form · 7. `t4` Absence Management call
8. `t7` FAU financial aid · 9. `t8` Parent PLUS rehab agreement
10. `t1` Text the Senior Director — **demoted to position 10 and marked ON HOLD** until the appeal
    resolves; the drafted message is preserved intact in its `why`
11. `t6` 9/17 Director follow-up — conditional on the appeal resolving
12. `t5` FMLA — `info: true`, rewritten from "sitting in their queue" to "approved 9/9"

Ids are not in list order. Intentional — they are stable handles the in-page coach uses via
`complete_task`; order lives in the array. Do not renumber.

### Corrections worth remembering
- FMLA was first assessed as a **weak** lever ("late is not absent", pattern looked chronic rather
  than episodic). The 9/9 intermittent approval plus the documented retroactive correction path
  reversed that. It is now the strongest ground.
- One occurrence has an external, verifiable cause: a homicide investigation closed the train
  tracks at Cypress Creek on a Thursday. Evidence decays — transit alerts and news coverage should
  be captured early.
- Her manager moved the start time 8:15 → 8:30 informally. It does not close the gap (arrival is
  8:40–8:45) and further change must go through HR, not the manager.
- The real commute bottleneck is the **last mile** from station to site, not the timetable.

**Open discrepancy on `t8`:** `scheduledOnce.rehab-check` records $5/month; the offered agreement
is $119/month — about $1,026 more across nine payments. Unresolved.

`checked` — 7 entries, unchanged throughout:
`m06` 08-31 · `a01` `m01` `m05` `a02` `a03` `m11` all 09-05
