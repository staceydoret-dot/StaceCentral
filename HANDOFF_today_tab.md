# HANDOFF — Today tab / path-to-psychiatry artifact

**Last updated:** 2026-09-13 (late)

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

## Current queue (rebuilt 2026-09-13 — appeal drafted, Monday is the send)

The written appeal to HR is **drafted and staged three ways**: a Google Doc (the master,
Times New Roman 12pt / 1.5), a PDF, and a Gmail draft with the PDF attached. Drafting it is
recorded in `wins`; `t12` is now only the act of sending.

Appeal letter (master): https://docs.google.com/document/d/1Zdcoc4J_JbsmknxMx5gG-cYh5ZsghmujzIre_IhRxVE/edit

1. `t12` **Monday 9/14 — send the appeal**: download the PDF, attach both FMLA notices,
   email Ruth, forward the sent copy to Gmail. Hard deadline **Tue 9/15** (7 calendar days
   from 9/8). She sends from her *work* Outlook — she cannot reach it off-site.
2. `t10` Email HR for the dates behind the 9/8 corrective action — no longer blocking
3. `t11` Workday timecard corrections for covered late arrivals (ILL-1 going forward)
4. `t2` 9/14 APRN appointment · 5. `t3` submit ADA form · 6. `t4` Absence Management call
7. `t7` FAU financial aid · 8. `t1` Senior Director text (**parked**, position 8)
9. `t6` 9/17 Director follow-up · 10. `t5` FMLA — `info: true`
11. `t13` Parent PLUS payment plan · 12. `t8` Lori / Grow Therapy

Ids are not in list order. Intentional — they are stable handles the in-page coach uses via
`complete_task`; order lives in the array. Do not renumber.

### The appeal's argument (worth keeping)
FMLA period begins **8/26/2026** → employer notified **9/2** → corrective action issued
**9/8** → approved **9/9**. Any occurrence on or after 8/26 falls inside an approved FMLA
period, so she does not need the occurrence dates: state the rule, let HR match. Certified
frequency is *"2 time per week lasting 9 hours per episode"* — a 15-minute late arrival is a
fraction of one episode, so her 9 hours of PTO covers ~36 of them.

One occurrence has an external cause, now sourced: a fatality on the Tri-Rail tracks in the
6200 block of N. Andrews Ave, Fort Lauderdale at ~6:15 a.m. **Thursday 9/3/2026**, covered by
WSVN 7News, NBC6 and Local 10. The coverage confirms the incident and the police response —
it does **not** mention a service suspension, so the letter claims only the delay as her own
account. Do not overstate that.

### Corrections worth remembering
- FMLA was first assessed as a **weak** lever ("late is not absent"). The 9/9 intermittent
  approval plus the documented retroactive correction path reversed that. It is now the
  strongest ground.
- Her manager moved the start time 8:15 → 8:30 informally. It does not close the gap (arrival
  is 8:40–8:45) and further change must go through HR, not the manager.
- The real commute bottleneck is the **last mile** from station to site, not the timetable.
- **Ruth** is her HR contact — Ruth sent her the accommodation request form on 9/8, and the
  appeal goes to Ruth.

### Tooling added 2026-09-13
- `tools/appeal/build_letter.py` — the PDF (reportlab, base-14 `Times-Roman`, 18pt leading =
  1.5 spacing at 12pt, 1in margins). `pip install reportlab` first.
- `tools/appeal/build_docx.py` — a Word version (python-docx). LibreOffice cannot convert in
  this image ("source file could not be loaded"), so do not rely on it to preview.
- `tools/appeal/letter.html` — what was uploaded to Drive. Google converts `text/html` to a
  native Doc and honours inline `font-family` / `font-size` / `line-height`.
- `tools/merge_appeal_win.py` — the merge that banked the win and rewrote `t12`.

### Ship gate note
The gate's queue assertions are **order-sensitive and go stale every time the queue changes**.
When rows move, update `want[]`, the focus-card expectation and the Director position — do not
delete assertions to get green. The info row is now located by its `info` flag rather than by
index, which is the pattern to follow.

`checked` — 7 entries, unchanged throughout:
`m06` 08-31 · `a01` `m01` `m05` `a02` `a03` `m11` all 09-05

---

## The ADA accommodation request (added 2026-09-13)

The employer form is **"Medical Statement in Support of an Accommodation Request"** (fax
216-444-7385 / AMOforms@ccf.org). Structure matters: **Q1–Q9 are the provider's**, Stacey only
signs the page-3 release. That release **excludes psychotherapy notes** — worth repeating to
her, she was worried about it.

- Her **PCP** certified the FMLA. Her **Grow Therapy psychiatric APRN** is the one *actively
  treating* the condition, which is what this form asks for — so the APRN signs it. Different
  practices, different charts, so consistency is **not** automatic: she sends the FMLA
  Designation Notice along with the form.
- Treatment history: ongoing **medication adjustments targeting attention and focus for work**.
  That supports Q3 *Concentrating / Thinking / Working*.
- **The ask is two accommodations, deliberately separated:** noise-reducing headphones, and a
  **flexible arrival window 8:30–8:50** (not counted as tardiness). They must be described as
  addressing *distinct* limitations — otherwise the employer grants the headphones and closes
  the request. She genuinely wants both.
- **A fixed 9:00 start was ruled out**: her shift end cannot move, so a later start is a pay
  cut (~2.5 hrs/week). The window keeps her whole; make-up time via a shorter unpaid meal
  period, or another day inside the same workweek (FLSA: same week only).
- **Feasibility facts, for the HR conversation and not the medical form:** her role is covered
  from **8:00** and she starts at **8:30** — she is not the opener — and her manager already
  moved her 8:15→8:30 without disruption.
- **Do not coach the clinical basis.** Three candidates were offered to her APRN — medication
  onset, morning functional capacity, time perception — for the provider to pick. Time
  blindness alone is the weakest (the "she'd be late at 9:00 too" rebuttal); it only holds
  with the bounded-margin argument, since her miss is a consistent 10–15 minutes.

## Why the appeal is worth more than it looks

The **EEG Technologist Apprentice** at Cleveland Clinic scores **62**, her highest fit. Its
internal window opens **12 Nov**, cohort starts **16 Nov** — and the corrective action locks
her out of internal applications until **12/8**. The lockout outlasts the cohort, so the 9/8
write-up costs her that apprenticeship outright. That is the concrete stake in the appeal.

Locally, **Joe DiMaggio EEG Technician** (2 miles, no experience required) accepts *enrolment*
in a CAAHEP programme rather than graduation. Enrolment is the single highest-leverage
unticked box on her whole jobs board.

## Publishing while she is using the page

She taps the page while we work, and `queueSave()` republishes 1.4 s later — a publish built
on a stale read is **refused**, not merged. Re-read immediately before every publish, keep
`jobs`, `jobFeedback`, `log` and `view` in the untouched-assertion list, and merge onto her
version. Never `force`. Her `log` entries are hers — on 9/12 she wrote *"We drafted the Appeal
form! Woohoo!"* and the in-page coach answered it.

## The in-page coach edits the queue too (learned 2026-09-13)

It is not only Stacey tapping. When she logs something in the "talk to me" box, the
**in-page coach rewrites task text and reorders the queue** on its own. Overnight on 13 Sep it
rewrote `t12` (dropping the "Monday 9/14 —" prefix) and moved `t2` above `t1`.

So **positional assertions in the ship gate are inherently brittle** — they were rewritten to
check that every expected row is *present*, plus only the few positions that genuinely matter:
the appeal stays the first open row (so it stays the focus card), and the two clock-bound rows
stay above the financial-aid call. Do not re-pin exact indexes; the gate will just go red again
the next time she talks to the page.

Same reason the queue text should be matched loosely (`/send the appeal/i`, not the full
sentence). The coach owns the wording once it has spoken.

## 2026-09-14 — the appeal was filed

Sent to **Ruth Owens** at 11:59 AM Monday 9/14, inside the seven-day window (deadline was
9/15). `t12` is ticked. The ADA form also went to the Grow Therapy APRN ahead of the 12:30
appointment, banked as a win.

**Still open that day:** the Weston text (`t1`), window 9am–4pm, cohort closes 9/26.

### Ship gate lessons from this round
Three assertions encoded a single moment rather than an invariant, and all three went red the
moment she actually used the page:

- the APRN row's text — the coach rewrote it to "Today 12:30 — …". Match loosely.
- "the appeal is the focus card" — false as soon as she ticked it. The real contract is
  **the focus card shows the first row that is neither done nor an info note**; that is what
  is asserted now.
- "tick all 11 tasks" — a fixed count breaks once any row is already done. The loop now
  **drains** `li[data-done="false"]` until empty, capped at 40 to fail loudly on a render bug
  rather than hang.

Rule of thumb for this gate: assert what must always be true, never what happened to be true
on the day it was written.

## Do not "fix" the ADA form — it is already fillable (2026-09-14)

The Cleveland Clinic *Medical Statement in Support of an Accommodation Request* ships as a
**working AcroForm: 68 fields**, including a `/Sig` digital-signature field for the provider.
Text fields, checkboxes and radio groups all behave correctly.

I wrongly concluded it was flat and rebuilt a fillable version on top of it. The bad check was
`strings file.pdf | grep -c /Widget` returning 0 — **this PDF stores its objects in compressed
object streams, so `strings` cannot see them.** Never diagnose PDF structure that way. Use a
real parser:

```python
from pypdf import PdfReader
r = PdfReader(path); print(len(r.get_fields() or {}))
```

Note the system `pypdf` is unusable here — importing it panics via a broken
`cryptography` build (`pyo3_runtime.PanicException`). Create a venv and `pip install pypdf`.

If she reports the form "isn't editable" again, it is the **viewer**, not the file: Gmail's
inline preview and Google Drive's preview render forms flat. Adobe Acrobat Reader, macOS
Preview, Chrome and Edge all fill it fine.
