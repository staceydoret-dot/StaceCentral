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
