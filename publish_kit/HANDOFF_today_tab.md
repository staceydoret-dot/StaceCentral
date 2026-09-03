# HANDOFF — the plan page  (rev 18, 2026-09-03) — one surface. 335/335 + 29 + 20.

## Rev 18 — the three surfaces became one

She said it plainly: "it's all connected." There were three places (plan page,
a separate job-board artifact, the morning brief) and she only ever wanted one.

- **The job board artifact `ac5f82a4-…` is RETIRED.** Do not publish to it, do
  not rebuild it, do not create a replacement. The daily sweep
  (`trig_01KdKj7M4XyK7KWxy37qXFTw`) now edits `STATE.jobs` on the plan page
  instead, and its prompt carries the row schema plus a pre-publish check that
  every top-level key other than `jobs`/`updated` is byte-identical to what it
  read. It no longer builds HTML, so its old Playwright suite is gone with it.
- **The morning brief (`trig_01PZMkQ3Nn12cXUQPAsCCSfk`) is daily, not weekdays**
  — `0 11 * * *`. It carries a dated situation block and an agreed queue, and
  hands her the top undone item only. It is told not to touch `jobs` or
  `pipeline`. Verified end to end by a forced run at 2026-09-03 00:00Z: it wrote
  the Senior Director email as the first task and left jobs, pipeline and the
  tracker untouched.
- **Jobs group renamed `blocked` -> `working`, heading "Working on it".** She
  objected that "Yours in November" made it read as though she were sitting
  still until the 12th. She is not — a review is open with the Senior Director
  of Ambulatory Operations at Weston. Two assertions hold this: the row must
  lead with the review, and the heading must say she is working on it. November
  is the backstop, never the plan. Do not reword this back.
- **`CLAUDE.md` now carries her working rules** — one thing, short, plain words,
  no guilt, no emoji, her reply is the record. This session drifted badly
  without them. Read it first.
- A one-shot Routine on 2026-11-01 shifts all three crons for the end of DST and
  chains the reverse for 2027-03-14. Crons are UTC and were set during EDT.

### Her situation, as of 2026-09-03

Rejected from the Cleveland Clinic EEG Apprentice 9/28 cohort — auto-rejected on
a Corrective Action, Step 2 dated 8/12/2026, which bars internal applications
until **2026-11-12**. Seventeen months in post, so no transfer waiver is needed;
that corrective action is the only bar. Eight of eleven attendance events are
late arrivals caused by the Hollywood-to-West-Palm-Beach train. Intermittent
FMLA filed, certified 9/1/2026-9/1/2027, which does not reach the earlier
occurrences. An accommodation request (8:30 shift, flexible arrival to 9:00) is
the structural fix and is next in her queue. She holds BLS as of 8/31/2026,
which was the missing requirement on the live Nicklaus trainee posting.

## Rev 17 — the job board moved in

There were three surfaces (plan page, separate job board artifact ac5f82a4,
morning brief). She asked for one. The plan page now has a fifth view, **Jobs**,
between Today and Board.

- `inject_jobs.js` adds the nav button, `#view-jobs`, the styles (page tokens
  only, no new palette), `renderJobs()`, and wires `setView` + `renderAll`.
- `seed_jobs.js` writes two new state keys.
  - `jobs` — content. `{updated, note, rows[]}`, rows grouped by `s`:
    `open` / `blocked` / `gated`. The daily sweep owns this.
  - `pipeline` — **hers**. Added to `FROM_LIVE` in `merge_state.js`, so a
    republish can never wipe what she is tracking. If you add another
    user-editable key, do the same or it will be silently destroyed.
- `t_jobs.js` — 27 assertions, takes the file as argv[2] (unlike `t_track.js`).
- `test_path.js` moved 4 -> 5 switches and gained two Jobs assertions: 332 -> 335.

Two guards worth keeping: the suite rejects guilt wording anywhere in the view
(it caught "gated **behind** a credential" in my own copy), and it rejects a
pipeline ladder lit end to end for an unresolved application, because a full bar
reads as a win when it was a bounce.

## Rev 17 — the tracker ladder changed

Old: Watching / Applied / Followed up / Nudged / Interview / Decision, seeded at
"Followed up". That ends a rejection at a dead end. She was rejected on 2 Sep and
is actively working it, so the ladder is now:

  Watching / Applied / Not eligible yet / Under review / Interview / Decision

seeded at **Under review**, lastFollow 2026-09-02, nextFollow 2026-09-09,
gaps `{Applied:2, "Not eligible yet":7, "Under review":7}`.

**The last two rungs are terminal** — the page deliberately stops offering a
follow-up date once you reach index 4. Do not put a date-shaped stage there;
that was tried and the nudge line vanished. Stages are states, not dates.

`retrack.js` applies the ladder to `build.html` AND the published file. It has to
be both: `stages`/`gaps` are `TRACK_BUILD_FIELDS`, so BUILD wins and a
build-only-in-the-published-file change gets reverted by the next merge.



## READ THIS FIRST — IT IS PUBLISHED

Rev 16 closes the blocker. The `Artifact` tool WAS available in a Claude Code
session and `merged.html` is live at b5d65276 (label "EEG tracker").

What ran, in order:
- `Artifact action:"read"` on b5d65276 -> `live.html`
- `node merge_state.js --live live.html --build build.html --out merged.html`
  -> `0 kept from LIVE | 1 seeded from BUILD [p0/m02 -> Followed up]`, no `dropped`.
  LIVE carried no `track` at all, so this was the first-ship case: nothing of
  hers was at risk. Her `display`, `checked`, `notes`, `today`, `wins` all carried.
- `run_gate.js` on the shipped file -> 335 passed, 0 failed (332 before rev 17)
- `t_track.js build.html`   -> 20 passed, 0 failed
- published `merged.html` to the existing URL. No conflict.

Next republish: the tracker now EXISTS on the live page, so the first-ship case
is spent. From here `app trackers` must say **kept from LIVE**. If a future run
says "seeded from BUILD" again, her taps are about to be erased — stop.

### Sandbox note (cost 20 min this session)

`playwright` the npm package is not installed in the web sandbox, and the
chromium it wants (build 1234) is not the one the image ships (1194 at
`/opt/pw-browsers/chromium`). Never run `playwright install`. Instead:

```bash
npm install --no-save playwright          # library only, no browsers
node gate_local.js gate  merged.html      # 332 assertions
cd publish_kit && node ../gate_local.js track build.html   # 20; needs this cwd
```

`gate_local.js` (repo root) pins `executablePath` and then hands off to the
kit's own runners. It modifies nothing in `publish_kit/`. `t_track.js` ignores
argv and reads `cwd/build.html`, hence the `cd`.

## Where publishing works

The artifact URL is `claude.ai/code/artifact/b5d65276-…`. That is a **Claude Code**
artifact. The `Artifact` read/publish tool exists **only in Claude Code sessions**
(desktop app → Code tab, or the CLI). It does not exist in the claude.ai chat app, on
any plan, with any setting. Three sessions were blocked because they were chat sessions.
Do not try to publish from a chat session again — it cannot work.

Requirements (from code.claude.com/docs/en/artifacts): Pro/Max/Team/Enterprise plan;
signed in with `/login` (not an API key); Claude Code CLI ≥ 2.1.183 or desktop app
≥ 1.13576.0. If Claude Code says it cannot publish, check `/config` → Artifacts row is on.

Kickoff prompt to paste into Claude Code, from inside the unzipped folder:

    Read HANDOFF_today_tab.md in this folder and follow the publish recipe exactly.
    The artifact is https://claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb


Rev 15 supersedes rev 14. This session (2026-09-02, **artifact tool again NOT available**)
closed the one remaining non-tool blocker: `merge_state.js` now protects the EEG tracker.

## What changed this session

**`merge_state.js` — the `track` rule from rev 14 is now implemented and tested.**
Previously `phases` fell through to the "content" branch, so BUILD won outright. That
meant a republish would have silently reset her tracker to the seeded `Followed up`.
If she had tapped `Interview` on the live page, that tap would have been destroyed.

New in `merge_state.js`:
- `TRACK_USER_FIELDS = ['stage','applied','lastFollow','nextFollow']` — hers, LIVE wins.
- `TRACK_BUILD_FIELDS = ['stages','gaps']` — the ladder is content, BUILD wins.
- A `k === 'phases'` branch in `merge()`. Trackers are indexed by `phaseId/milestoneId`,
  **never by array position**, so reordering phases or milestones cannot cross-wire them.
- Falls back to BUILD's value per-field if LIVE's is missing/null (handles an older LIVE
  shape that predates `gaps`).
- Reports a `dropped` list if LIVE holds a tracker that has no matching milestone in
  BUILD — that would be silent data loss, so it prints loudly.
- New report line: `app trackers : N kept from LIVE [...] | M seeded from BUILD [...]`.
- Generic: any future milestone that grows a `track` is covered automatically.

## Verification done this session

- Synthetic fixture, LIVE tapped to `Interview` + shifted dates, `gaps` deleted:
  15/15 hand-written assertions pass. Stage/dates carried from LIVE; `stages`/`gaps`
  restored from BUILD; **every non-m02 milestone byte-identical to BUILD**; m02 differs
  only in `track`.
- Fixture with no `track` in LIVE (first-ship case): seed adopted whole from BUILD.
- `node run_gate.js build.html` → **332 passed, 0 failed**.
- `node t_track.js` on build → **20 passed, 0 failed**.
- `node run_gate.js` on the **merged output** → **332 passed, 0 failed**.
- Note for the next session: running `t_track.js` against a merged file whose LIVE stage
  is not `Followed up` fails 3 assertions (`seeded at "Followed up"`, `two stages show as
  past`, `next nudge shown (Sep 13)`). That is **correct** — those assert the seed.
  Gate `build.html` with `t_track.js`; gate the merged file with `run_gate.js` only.

## The recipe (as actually run in rev 16 — reuse verbatim)

```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers      # never `playwright install`
npm install --no-save playwright                      # library only; see sandbox note

# 1. Artifact action:"read" https://claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb
#    Save the returned file as live.html. ALWAYS re-read immediately before
#    publishing and `cmp` it against the copy you merged from — the page
#    self-saves on every tap.
# 2. node publish_kit/merge_state.js --live live.html --build publish_kit/build.html --report-only
#    Check the `app trackers` line. It must say "kept from LIVE" from now on.
#    If it prints a `dropped` warning — STOP, do not publish.
#    node publish_kit/merge_state.js --live live.html --build publish_kit/build.html --out merged.html
#    Write to merged.html, NOT over build.html — the pristine build is what
#    t_track.js asserts against, and clobbering it loses the seed baseline.
# 3. node gate_local.js gate merged.html               # must be 332 passed, 0 failed
#    cd publish_kit && node ../gate_local.js track build.html   # must be 20 passed, 0 failed
# 4. publish: file_path=merged.html + that url, short label.
#    NO capabilities, NO contract, NEVER force.
# 5. On version-conflict: inspect the newer copy FIRST. Re-merge onto IT if needed.
```

## Do NOT do this

Creating a fresh artifact via `/mnt/user-data/outputs/*.html` would render, but it would
be a **new** artifact at a new URL. Her live state stays stranded on b5d65276 and she ends
up with a third page to reconcile (there is already one stray, below). Publishing must go
to the existing URL, by passing `url` to the Artifact tool.

## Standing constraints (unchanged, still in force)

- ONE action at a time. Never a wall of tasks. Plain words — she said "I don't understand"
  once when led with jargon; the fix was to explain it like spell-check.
- Her reply IS the record. Draft and propose only. Never mark habits on inference.
- No guilt framing: no "overdue", no "carried over", no red.
- Font: settled. Do not offer font switching again.

## Still open

- ~~Publishing.~~ DONE rev 16 — live at b5d65276.
- ~~Morning brief `trig_01PZMkQ3Nn12cXUQPAsCCSfk` FAILING.~~ Checked 09-02: the
  09-02 11:06Z run SUCCEEDED (93s, model claude-fable-5) and wrote t2-t5 onto the
  Today tab, rolling t1 into `wins`. The ~12s failures were 09-01 only. Enabled,
  push on, next fire 09-03 11:00Z. Do not carry the FAILING note forward again.
- **Latent, dated:** all three crons are UTC and were set during EDT, so they
  drift an hour when ET goes back to EST on **Sun 2026-11-01**. Morning brief
  `0 11 * * 1-5` becomes 6am ET; weekly tune-up `0 14 * * 0` becomes 9am;
  job board `15 11 * * *` becomes 6:15am. Shift each +1h that weekend, and
  -1h again when EDT resumes 2027-03-14.
- Degree audit not uploaded. Loans: IBR switch in progress (t2). Not enrolled at FAU this term.
- OLD artifact 669893d2-… — never publish to it; deletion still unresolved.
- Sept 13 Reminder ("Nudge Cleveland Clinic internal transfer if no reply") open and correct.
- Artifact wake subscriptions are refused in the web sandbox (403,
  "subscribing requires a session credential"). A session here cannot be
  notified of a republish; re-read before every publish instead.
