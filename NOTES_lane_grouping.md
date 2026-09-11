# Lane grouping — what shipped, what didn't

Worked from `HANDOFF_lane_grouping.md`. Read this before the next session.

## Heads-up: the handoff described the tracker slightly wrong

The handoff says the tap-to-advance status bar lives in the Job tab. It doesn't.
There are three separate things, and only one of them is tappable:

| | What | Where | Count | Status bar |
|---|---|---|---|---|
| A | `STATE.jobs.rows` | Jobs tab, `#jrows` | 11 | none (fit/ATS numbers) |
| B | `STATE.pipeline` | Jobs tab, `#jpipe` | 3 | display-only, not tappable |
| C | milestone `.track` | **Path** tab, milestone `m02` | 1 | tappable — this is the merge-protected one |

Stace chose **A + B** (both Jobs-tab lists). **C was not touched at all**, which is
why the merge-tool risk went away rather than needing to be managed.

## Data model

`lane` added to all 11 rows and all 3 pipeline entries. Nothing else changed.

**Deviation from the handoff, on purpose:** `lane` holds a short stable id
(`"eeg"`, `"crc"`, …), not the full display label. The 11 labels live in the
`LANES` table in `#app-code`, which owns display text and order. Storing the
label text as the key would have made every lane name a data migration and
would have keyed her data on strings containing em dashes. Ids are one lookup
away from the same result.

Lane order is exactly the handoff's order; CRC is last and renders a `backup`
badge, so it can never read as a primary lane.

### Backfill

Assigned by job title against the lane list. Eight were unambiguous. Three were
not, so per Stace they carry `laneGuess: true` and render a dashed
**lane guessed** badge for her to correct by eye:

- `pipeline[0]` Neurology Technician — Neurologic Wellness Institute → `eeg`
- `rows[3]` Quality Assurance Coordinator (Clinical Research) — CenExel → `crc`
- `rows[6]` Clinical Research Assistant / Medical Assistant — CenExel → `ra`

## UI

- Filter is a `<details>` + chip row — both patterns already in the artifact
  (`.jparked` uses `details`, `.jchip` uses chips). No new pattern introduced.
- Collapsed by default; the summary reads `Lanes — all` or the active lane.
- Lanes with zero entries render disabled, so the row stays a map rather than a
  wall of live buttons.
- Default view is all lanes, grouped by lane, in the handoff's order. Grouping
  applies inside the parked `<details>` too — otherwise it would be pointless,
  since 9 of the 11 rows are currently parked.
- The filter governs both `#jrows` and `#jpipe`.
- **Filter state is in-memory, never persisted.** Persisting it would call
  `queueSave()` → `artifact.publish()` on every chip tap, and publishing
  reloads the page.
- Job cards gained a small status badge (`Open now` / `Working on it` /
  `Needs a credential`). Necessary: lane became the top-level grouping, so the
  old open/working/gated headings were gone and that information would
  otherwise have been lost.
- `renderLaneFilter()` re-seats the filter directly above `#jrows` on each
  render, because `renderDocs()` inserts the documents block before `#jrows`
  and would otherwise strand the control.

## Safety

Verified, not assumed:

- `phaseId` / `milestoneId` untouched; no `lane` key anywhere in `phases`.
- Tap-to-advance still advances; `m02` still reads its published stage.
- **Self-publish round-trip tested.** Stubbed `window.claude.use("artifact")`,
  tapped a stage, captured what `buildDoc()` produced, and loaded that document
  as a fresh page: lanes, guess flags, and her tap data all survive. The
  "republish silently resets the tracker" failure mode does not occur on this
  edit path, because the edit is applied to the live published snapshot rather
  than to a regenerated seed.

## PUBLISHED

Live as of this commit, to
`claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb`.

Before publishing, the live artifact was re-read and compared byte-for-byte
against the snapshot this work was built on — identical, so nothing Stace had
tapped was overwritten. Capabilities (`sample`, `artifact`, `db`, `downloads`)
carried forward, so the page can still save itself.

### The 316-assertion gate still never ran

`merge_state.js`, `test_path.js`, `run_gate.js` and `HANDOFF_today_tab.md` are
in Claude **Project knowledge**, which a Claude Code session cannot read. Not in
this repo, Drive, or Notion — all three checked.

What was run instead is `tests/`, 69 assertions, all passing:

    node tests/test_lanes.js        # 33 — grouping order, filtering, guess flags
    node tests/test_roundtrip.js    # 16 — self-publish preserves lanes + tap data
    node tests/test_regression.js   # 20 — differential vs the pre-change artifact

`test_regression.js` is the one that made publishing defensible: it renders the
pre-change artifact and the modified one side by side and compares a structural
fingerprint of every view. **`#view-today`, `#view-vision`, `#view-path` and
`#view-therapy` came back identical** (206 / 251 / 1148 / 194 nodes), every new
CSS selector is namespaced `.lane*` / `.jstatus`, and the original stylesheet is
preserved verbatim with the lane rules appended.

That is narrower than the real gate — it proves *this change* altered nothing
outside the Jobs tab; it does not re-verify the artifact's own behaviour from
scratch. If the gate is ever reachable again, run it against
`artifact/stacey-doret-md.html` and treat any finding as authoritative over
these tests.

`test_regression.js` needs `original.html` (the version published before the
lane change) beside it; it exits 2 with instructions if absent.

## Running the tests

Copy the artifact beside them as `artifact.html`, then:

    node tests/test_lanes.js
    node tests/test_roundtrip.js

Sandbox notes from the handoff still apply: `fonts.googleapis.com` is stubbed
in-test, and Chromium comes from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` —
do not run `playwright install`.

## Round 2 — IONM lane and seven new roles

### A 12th lane

Stace approved adding **Intraoperative Neuromonitoring (IONM)** as a lane. It
sits directly after EEG — same neurodiagnostic family — so CRC stays last and
every other lane keeps its relative position.

It earned the slot: the IONM industry hires bachelor's graduates with *no*
experience and trains them toward CNIM. The credential comes after hire rather
than being the wall in front of it, which is the opposite of every other EEG
route on this board.

### Why the board looked empty

Seven of eleven lanes read 0. Not because those jobs do not exist locally —
because no sweep had ever searched for them. Five of the seven had real,
local, entry-appropriate openings on the first look.

Also worth knowing: **Indeed's search returned zero results for every query
this run** while its resume endpoint worked fine. Every row on the board links
to an Indeed search URL. That is a plausible cause of thin sweeps and is worth
re-checking before blaming the market.

### Scoring discipline

Seven rows added. Exactly one carries a verified requirement line:

- **EEG Technician 1, University of Miami** — "High School Diploma or
  equivalent/relevant experience... Minimum 1 year of relevant experience."
  No CAAHEP programme, no ABRET registry. Marked with the board's own
  `checked: {via:"employer"}`, which renders "Verified on the employer's own site".

The other six carry **no `fit`/`ats` at all** rather than invented numbers.
`fitHTML()` returns "" when `fit` is not a number, and `parked()` requires both
to be numbers, so an unscored row renders cleanly and stays in the main list
instead of being buried. Each carries a "Requirements not verified this run"
chip, matching the convention the DermCare and BRCR rows already used.

A useful negative result: **Memorial Healthcare's EEG Technician is gated**
(CAAHEP programme + ABRET Part I or 1-3 years EEG, weekend call) and that
posting is the Joe DiMaggio row already on the board. It was not a new door,
and it was not added.

### The conflict, and why it mattered

The first publish attempt was **refused**: a newer version had been published
at 18:37:40Z. Stace had been using the app — `today` had grown from 2.4KB to
6KB and `wins` had grown too.

Publishing over it would have destroyed that. The merge took her live version
as the base and applied only the lane and the new rows onto it, asserting
afterwards that `today`, `wins` and the tracker's tap data were byte-identical
to hers before writing anything.

This is the failure mode the handoff warned about, and it arrived for real.
The conflict check is what caught it.

### A test that was wrong, and one that was right

Re-running the differential suite after the merge flagged `#view-today` as
changed. That was a **true report of changed content but not a regression** —
her new tasks. Re-pointing the baseline at her live version isolated the actual
change: today/vision/path/therapy all identical again (266/251/1148/194 nodes).

One assertion was genuinely stale: it required the stylesheet to *grow*. This
round added no CSS at all, so "additive only" became "additive or unchanged".

72 assertions passing. Published as Version 29.

## Still open for Stace

- Six of the seven new rows still need their requirement lines read. UM's own
  career pages truncate on fetch and Baptist's posting would not open.
- The three `laneGuess` entries are flagged in the UI, not resolved.
- Neurofeedback/QEEG and Ketamine Monitor are genuinely empty locally — those
  two zeros are real, not an artifact of not looking.

## Round 3 — the pipeline, and a bug I had introduced

### The lane feature was going to break on its own

The board is not hand-maintained. Two Routines drive it:

- `trig_01KdKj7M4XyK7KWxy37qXFTw` **pass 1 — search**, 11:15 UTC daily. Writes
  `claude/next_rows.json` and `claude/job_board_state.md` (Claude *project*
  files — unreachable from Claude Code, same store as `merge_state.js`).
- `trig_01MpsMhY6VSKpPvVZShaBCDb` **pass 2 — write**, 15:15 UTC daily. Reads
  only `next_rows.json` and republishes the artifact.

Pass 2 replaces `STATE.jobs.rows` **wholesale**. Pass 1's row schema had no
`lane` field. So at the next 15:15 UTC run, every row would have lost its lane
and dropped into the "Needs a lane" bucket — the feature would have looked
broken within a day of shipping, and the cause would have been the shipping.

Adding a field the generator does not know about is the bug. Fixed by teaching
pass 1's schema the twelve lane ids, marked REQUIRED.

### What the routine already did

Pass 1 was already searching IONM (naming "Technologist 1, trainee, associate"
and "never Level 2"), psychometrist, sleep, CRC and neurology-practice roles.
The claim that "nobody ever searched these lanes" was wrong — it came from the
board's one-line display summary ("Hunts new EEG and neurodiagnostic
openings"), not from the routine. Only TMS and interpreter were genuinely
absent.

### Why the board still looked empty

Not a broken connector. Indeed works — "registered nurse" in Miami returns ten
rows. But `"EEG"` in Miami returns **two**, and neither is UM's open EEG
Technician 1, which ZipRecruiter surfaces immediately along with UM's IOM
Technologist 1. The sweep was single-sourced on Indeed, whose coverage of this
niche is thin.

### Edits made to pass 1 (surgical; zero original lines dropped, 9146 -> 11071 chars)

1. `lane` added to the STEP 5 row schema, REQUIRED, with the twelve ids.
2. STEP 3 now runs each sweep through **both** Indeed and ZipRecruiter and
   checks careers.miami.edu directly, with the evidence for why.
3. STEP 3A gains TMS / interventional psychiatry and medical interpreter
   (Haitian Creole first).
4. CANDIDATE STATUS records the verified UM EEG Technician 1 requirement line
   so it is carried until filled rather than rediscovered or lost.

A copy of the full new prompt is in `routine_pass1_search.prompt.txt`.

`STATE.jobs.searchTerms` in the artifact gained the same two lanes so the
board's standing list matches what the routine is actually told to do. Pass 2
preserves that key byte-for-byte, so it survives.

### Standing instructions I had violated

The routine records that she applied to EEG trainee postings at Memorial,
Nicklaus, HCA and Baptist with zero interviews, and says never to present
those as fresh leads. Round 2 presented Memorial and Nicklaus in conversation
as new employers. They were not added as rows, but the framing was wrong.

It also says IONM entry rungs only, "never Level 2 or CNIM-required". Round 2
added Baptist's Intraop Neurophys Tech **2**. Still to be removed.

### What happens to the seven manual rows

They have no `fit`/`ats`, so pass 2's validation would reject them anyway, and
`next_rows.json` is unreachable from here — they will be replaced at the next
15:15 UTC run. That is the right outcome: pass 1 now knows the UM roles by
requisition number and the new search terms, so it regenerates them **with**
honest scores, which is what the pipeline wants and better than unscored rows.

Published as Version 30. 72 assertions passing.

## Round 4 — the Level 2 row removed

`Intraop Neurophysiology Tech 2` (Baptist Health, ionm, gated) is gone. Pass
1's standing instruction is IONM "entry rungs only ('Technologist 1', trainee,
associate), **never Level 2 or CNIM-required**". It was added in round 2 on the
reasoning that showing the ladder was useful. The standing rule disagrees, and
it has been right longer.

17 rows now; the IONM lane holds UM's `IOM Technologist 1` alone, which is the
entry rung the rule actually wants.

Two rows still match a naive "Tech 2 / CNIM" grep and are deliberately kept:

- `IOM Technologist 1` — matches only because its `why` text explains the lane
  trains toward CNIM. It is an entry rung.
- `Polysomnographic Tech 2` — a pre-existing board row in the sleep lane, not
  one of mine. The "never Level 2" rule sits inside pass 1's IONM clause and
  does not reach sleep roles, and the row is parked on its own numbers
  (fit 20 / ats 30). Left alone rather than quietly widening the rule.

Published as Version 31. 72 assertions passing.

## Round 5 — the first two-source run did not publish; time-budgeted and re-run

### What happened on 2026-09-10

Both routines reported SUCCEEDED, but `jobs.updated` on the board stayed at
2026-09-09 and the note was still round 2's. Pass 1 ran **29 minutes**
(11:17 → 11:46 UTC) against ~6 the day before; pass 2 ran 2 minutes, which is
what its own STEP 1 looks like when it *deliberately* stops because
`next_rows.json` is missing or not dated today. Reporting that cleanly is
success, not a crash.

Most likely cause: doubling the sources (Indeed + ZipRecruiter) with no bound
pushed pass 1 long enough that STEP 5 — writing the hand-off file — either did
not happen or carried the wrong date. The file itself is a Claude project
file and cannot be read from here, so this is the best-supported reading, not
a confirmed one.

The lane fix itself held: all 17 rows on the board carried a valid lane, and
`searchTerms`, `docs`, the tracker and her `today`/`wins` were intact.

### The fix (pass 1 prompt v3, surgical, zero lines dropped, 11071 → 11788 chars)

1. **HARD TIME BUDGET** paragraph after the opener: 20 minutes of searching,
   then stop and go straight to STEP 4/5 with what you have, carrying forward
   unchanged rows. A partial sweep that writes the file beats a thorough one
   that never does; `generated` must be today.
2. STEP 3 bounds the second source: one ZipRecruiter call per sweep, radius
   45, first page only, never paginate.
3. STEP 5 says explicitly to write the file even on a cut-short run and to say
   so in `note`.

Applied at 2026-09-11T00:18:21Z. Full text in `routine_pass1_search.prompt.txt`.

### Manual run

Stacey asked for it to be run now. Pass 1 was fired manually at
2026-09-11T00:18:37Z — 11 hours before its cron, so no collision. A check-in
at 00:55 UTC confirms pass 1 finished, fires pass 2 manually (its own date
guard still applies), and verifies the publish ~10 minutes later.

## Round 6 — the real root cause, and a correction

### Round 5's diagnosis was wrong

The "20-minute time budget" theory, and the structural three-routine split
proposed on its back, were both wrong. `get_session` on the stuck run
(`cse_01Ugco4zQaacJX3F61YLsk5A`) showed:

- `session_status: SESSION_STATUS_REQUIRES_ACTION`, bucket `BLOCKED`
- `pending_action: mcp__ZipRecruiter__search_jobs` ("EEG Technician",
  33021, 45 mi)
- `updated_at` 28 seconds after start; `used_tokens: 0`

The run was never slow. It was **frozen at a permission prompt** for a
connector the routine has no standing grant for. Its `mcp_connections` are
Google Drive, Spotify, Gmail and Claude Code Remote — not ZipRecruiter.
Round 3 told an unattended routine to call a tool it cannot call unattended.

Yesterday's "29-minute SUCCEEDED" run was almost certainly the same freeze,
reaped and reported as success. So the cause of both non-publishes was the
round-3 edit, not the connectors' coverage and not run length.

### The fix (pass 1 prompt v4; surgical, zero lines dropped)

1. The time-budget paragraph is replaced by a **CONNECTOR RULE**: use only
   Indeed, WebFetch/WebSearch and project files; never call ZipRecruiter; if
   any tool prompts for permission, skip it and keep going.
2. STEP 3 goes back to Indeed, plus a direct `careers.miami.edu` fetch and a
   web search per sweep term — both need no connector grant, and the direct
   UM check is how the two best local roles were found in the first place.
3. STEP 5's cut-short clause now names the true cause (skipped step / tool
   unavailable) rather than a budget.

A second source through ZipRecruiter is still worth having. It has to be
granted at the routine level (Routines UI → connectors), which cannot be done
from here; `update_trigger` does not take `mcp_connections`, and this
session's own ZipRecruiter connector was down (503) at the time anyway.

### The run

The frozen session was interrupted. Pass 1 v4 fired at 2026-09-11T01:37:35Z
(`cse_016BSQ4nCaERZ4wDe9m6x8sR`). A check-in at 01:56 inspects that session
for any *new* blocked tool call first, then hands off to pass 2 and verifies.

## Round 7 — WebFetch prompts too; back to the original's tool surface

### v4 blocked as well

The second manual run (`cse_016BSQ4nCaERZ4wDe9m6x8sR`) froze `BLOCKED` with
three queued **WebFetch** calls (an Indeed search page, the UM IOM posting,
the UM search results). WebFetch is permission-gated in this routine's
environment too. Round 6 called it a "no grant needed" second source — true
that it is not a connector, false that it runs unattended.

Two of the round 5/6 instructions were hollow for the same reason: "stop at
20 minutes" and "if a tool prompts for permission, skip it". The model has no
clock, and the harness blocks a gated call *before* the model sees anything.
Neither could ever have done anything. Instructions need a mechanism behind
them; those had none.

### v5 (surgical; zero original lines lost)

- STEP 3 opener reverted to the original's exact wording ("Four Indeed
  sweeps, not seven.") — no WebFetch/WebSearch second source.
- CONNECTOR RULE narrowed to "the Indeed connector and the project files";
  the unenforceable "skip permission prompts" clause removed; the real
  constraint (never call ZipRecruiter) kept.
- The only `WebFetch` mention left is the original's own STEP 2 line, untouched.
- All pure-data edits stay: the `lane` field, TMS and interpreter search
  terms, the verified UM requirement line.

So v5's tool surface **equals** the original's. The original completed and
published under cron on 2026-09-09.

### The open question this run answers

If v5 *still* blocks on the original's STEP 2 WebFetch when fired by hand,
the manual `fire_trigger` path carries a stricter permission mode than cron,
and the fix is to stop firing by hand and let the 11:15 UTC cron run — for
which v5 is already live. The 02:06 check inspects the session first for
exactly this.

Third manual fire: 2026-09-11T01:59:37Z, `cse_01Vaxsh9DFECAUxxN8PkVcVk`.

## Round 8 — pass 1 v5 completed; pass 2 refused; the page had lost its stylesheet

### The manual run

- Pass 1 v5 (`cse_01Vaxsh9DFECAUxxN8PkVcVk`) fired 01:59:37 UTC and finished
  **IDLE / REVIEW_READY at 02:05:07 — 5.5 minutes**, 108k tokens, no
  permission block. So the freezes on attempts 1 and 2 were entirely the
  extra tools (ZipRecruiter, then WebFetch to new URLs); the manual-fire
  path itself is fine. v5 is the right prompt.
- Pass 2 (`cse_01Vunivb95D2yU1UitH6jMh2`) fired 02:06:54, finished 02:08:33,
  1.6 min — and **did not publish**: `jobs.updated` stayed 2026-09-09 and
  the rows are still round 2's 17. Its STEP 1 date guard fired, meaning
  pass 1 either did not write `claude/next_rows.json` or wrote it without
  `generated=2026-09-11`. The file is a project file and cannot be read
  from here; pass 2's own one-line report (visible to Stace) says which.
  Not re-fired tonight: firing again without knowing why would be a guess.

### The page was unstyled — and it was not the routines

The 02:16 read showed the body starting at `<div class="wrap">` with no
`<title>`, no font `<link>`, no `<style id="sheet">`. Every CSS rule
(`.todaywin{`, `.switch{`, `.job{`, `--display:`) was absent outside the
JS template literal. Playwright confirmed `.switch` had no `position:sticky`
/ `display:flex` — the dashboard was rendering unstyled.

Pass 2 never published, so it was not the cause. The `today` diff showed
task `t9` marked done at 2026-09-10 — a tap that triggers the page's own
`buildDoc()` → `artifact.publish()`. `buildDoc()` emitted the title, link and
sheet inside an author `<head>`; the platform keeps body content verbatim
but appears to drop an author-supplied `<head>`, so that self-save shipped a
page with no styles. (Version count went 31 → 43 between the last styled
read and this one, so the page had been self-saving freely.)

### The repair (published as Version 43)

- Base: the current live file, so her `t9` tap and everything else she did
  is kept.
- The real `<title>`, `<link>` and `<style id="sheet">` block re-inserted
  before `.wrap`, lifted from the last styled version — verified
  **byte-identical** (144,373 chars).
- `buildDoc()` patched to emit those three inside `<body>` (right after the
  `<body>` tag, before `SKELETON`) instead of in `<head>`, so a self-save
  can no longer drop them. Browsers accept them there, and every version
  published from this session already had them in the body.

Verified before publishing: all five views structurally identical to her
current live state (267/589/251/1148/194 nodes); repaired page styled;
the live-before-repair page confirmed unstyled; `#sheet` present with the
lane rules; `test_lanes` 34/34 and `test_roundtrip` 18/18 (the round-trip
suite reloads `buildDoc()`'s output and checks the sheet survives — that is
the direct proof of the fix). `test_regression`'s "jobs tab must differ"
assertion is stale for a CSS-only repair and was not relied on.

### Still open

- Why pass 1 v5 did not leave a file pass 2 would accept. Pass 2's report
  line says; the next cron cycle (11:15 / 15:15 UTC) is the cheapest test.
- Pass 1 still lacks the ZipRecruiter grant that pass 2 has (a per-routine
  connector setting, Routines UI). Adding it is what would make a real
  second source possible without touching the prompt.

## Round 9 — health check, routine panel, reflection (2026-09-11)

### What was checked (11:39 UTC)

- Morning brief ran 11:04 and self-published Version 44 (styled, sheet
  intact, `buildDoc` body patch in place — the round-8 fix held through a
  real self-save).
- Link check ran 06:21 clean. Weekly and monthly routines armed. One-shot
  reminders armed: Neurologic Wellness follow-up (09-11 13:00 UTC), IBR
  (09-18), Mom's rehab (09-25).
- Job search pass 1 (v5 prompt) ran under cron 11:16:33–11:24:06, 7.5 min,
  ended IDLE with no pending permission prompt. Pass 2 due 15:15 UTC.
- Eight of this session's own fired one-shot check-in routines deleted.
  One kept: "Verify cron run + stylesheet" at 16:00 UTC.

### Routine panel (published as Version 45)

`STATE.scheduled[].lastRun` now carries the real last-run times from
`list_triggers` instead of "Nothing since". The sweep entry's `what` and
`lands` text now describe the two-pass shape (7:15am hunt across twelve
lanes, 11:15am rewrite of the Jobs tab, and what happens when the morning
pass does not finish). First publish was refused because the morning brief
had published Version 44 in the meantime; the panel edits were merged onto
Version 44 and re-verified (lanes 34/34, round-trip 18/18, other views
structurally identical) before publishing. Never forced.

### Reflection — what to do differently

1. **Inspect the failing session before editing the prompt.** Three prompt
   rewrites for pass 1 (time budget, structural split, WebFetch) were all
   wrong; one `get_session` call showed the real cause was an ungranted
   connector holding a permission prompt. Diagnose first, edit second.
2. **Find the generator before adding a field.** The lane feature would have
   silently produced unlaned rows because pass 1's schema did not know the
   field existed. Any new field on `jobs.rows` needs the routine prompt's
   schema updated in the same change.
3. **Instructions need mechanisms.** "Spend at most 20 minutes" does nothing
   for a model with no clock. Constrain by tool surface and step count
   instead.
4. **Earlier sessions' fired one-shots still clutter her Routines list**
   (about twenty). Not deleted — they are not this session's to remove
   without asking.

### Still open

- Pass 2's refusal on 09-10 is undiagnosed; its one-line report (or
  `sweep_log.md`) says why. Today's 15:15 run is the test.
- Pass 1 still lacks the ZipRecruiter grant (Routines UI, per-routine
  connectors). Stace can add it without a prompt change.

## Round 10 — the real reason pass 2 kept refusing (2026-09-11, 16:00 UTC check)

### Verified at 16:00

- Stylesheet: the live page (Version 45) still has the real `<style id="sheet">`
  before `app-code`, with `.todaywin` and `.lanechip` rules present. The
  body-emitted sheet survived another morning-brief self-save.
- Board: `jobs.updated` still 2026-09-09, 17 rows, every row carries a valid
  lane (eeg 4, crc 6, tms 2, ionm/psychometrist/interpreter/ra/sleep 1 each).
  Pass 2 refused again.
- Pass 1 (cron, 11:16–11:24, 7.5 min) and pass 2 (cron, 15:15–15:17, 2 min)
  both ended IDLE with no pending action. Two clean completions, no accepted
  file — so the problem is between them, not in either.

### Root cause

`get_session` on the two routine sessions shows different
`chat_project_id` values: pass 1 runs in project `01a0429e-…`, pass 2 in
`01a04a78-…`. Project files are per project. Pass 1 has been writing
`claude/next_rows.json` into a project pass 2 cannot see, every day. The
date guard in pass 2 then correctly refuses. Pass 1's session title is
still "Daily job board refresh" — it was created 08-29 from the original
combined routine; pass 2 was created 09-07 from a different chat.

### Fix (both prompts updated 16:05 UTC, committed as `routine_pass*.prompt.txt`)

Google Drive is granted to both routines, so the handoff now goes through
Drive: pass 1 STEP 5B creates a Google Doc titled
`StaceCentral next_rows YYYY-MM-DD` with the raw JSON, confirms it is
indexed via `search_files`, and only then trashes older copies (upload,
confirm, then delete — never the other way round). Pass 2 STEP 1 searches
Drive for today's title, parses the body from the first `{` to the last
`}`, and falls back to the project file under the same date rule. Drive's
`update_file` only edits metadata, hence one dated doc per day.

Pass 1 v6 fired manually at 16:06 UTC (session `cse_01Xi1RVubMmtrCHSXuRpaCb9`)
as the end-to-end test; a 16:17 check-in verifies the Drive file from this
session, then fires pass 2.

### Lesson

Three prompt rewrites earlier this week targeted the wrong pass. The
one-line question that would have found this on day one: "are the two
routines even looking at the same place?" Check the sessions' project ids
before assuming a routine did not do its job.

### 16:17 UTC — the v6 test run blocked on WebFetch

The manual pass 1 v6 run (session `cse_01Xi1RVubMmtrCHSXuRpaCb9`) stalled at
16:17 with two pending WebFetch calls (aset.org programme list, a UM
Workday page). Same failure as the v4 run on 09-10: built-in web tools have
no standing approval in a routine, so one call stops the run for good.
Whether a run trips it is luck — the v5 cron run at 11:16 happened not to.
Session interrupted; nothing reached Drive.

Pass 1 v7 removes every line that invited a fetch: STEP 2 quotes
requirement lines from Indeed get_job_details only; 3B/3C/3D/3E no longer
point at apprenticeship.gov, aset.org, or "find the manager's name"; the
connector rule names WebFetch and WebSearch as forbidden and says why.
Re-fired at ~16:20 UTC.

### 16:38 UTC — Drive handoff also blocks; one routine now does both halves

Pass 1 v7 ran clean through the search (no web fetch this time) and then
stalled at 16:34 on `mcp__Google_Drive__create_file` — a granted connector,
but a *writing* tool, and writing MCP tools need a human approval inside a
routine. Read tools do not. So no cross-project handoff through Drive is
possible unattended either. Session interrupted.

The stalled call carried the JSON it was about to write: 8 rows, all
"carried forward, not re-checked", note "could not reach the project's
board file or the Indeed connector". Publishing that would have replaced
the 17 rows on the page (including the TMS, interpreter, psychometrist and
sleep rows added 09-09) with 8, so it was not published.

Fix: pass 1 is now the whole pipeline (`routine_daily_job_search.prompt.txt`):
search with Indeed and project files as before, then read the page, edit
only jobs.updated/note/rows, verify by script, publish, log. No handoff.
Pass 2 disabled and renamed "retired". Two new rules: the page's current
rows are part of the system of record and carry forward unless proven
gone; the row cap is 20, dropping parked rows first, never an open one.
