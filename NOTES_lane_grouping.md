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

## NOT DONE — publish is blocked

`merge_state.js`, `test_path.js`, `run_gate.js` and `HANDOFF_today_tab.md` are
in Claude **Project knowledge**, which a Claude Code session cannot read. They
are not in this repo, Drive, or Notion — I checked all three.

So the 316-assertion gate was never run. `tests/` here is my own substitute
(49 assertions, all passing) covering lane grouping, filtering, the round-trip,
and non-regression of the Path tracker. **It is not the gate.**

The handoff says do not publish until the full gate passes, so I did not
publish. The artifact is unchanged as far as Stace's phone is concerned.

To finish, in a session that can reach project knowledge: run `run_gate.js`
against `artifact/stacey-doret-md.html`, then publish it to
`claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb`.

Note the snapshot in this repo was read at the start of that session. If Stace
has tapped anything since, re-read the live artifact and re-apply, or her taps
get overwritten.

## Running my tests

    node tests/test_lanes.js       # 33 assertions
    node tests/test_roundtrip.js   # 16 assertions

Both expect `artifact.html` beside them, so copy the artifact in first, or edit
the path. Sandbox notes from the handoff still apply: `fonts.googleapis.com` is
stubbed in-test, and Chromium comes from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
— do not run `playwright install`.
