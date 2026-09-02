# HANDOFF — the "Today" tab  (rev 15, 2026-09-02) — merge rule DONE, gate 332/332, READY TO PUBLISH FROM CLAUDE CODE

## READ THIS FIRST — where publishing works

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

## For the publish session (step 0 is now DONE — 4 steps, not 5)

```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers      # never `playwright install`
# 1. Artifact action:"read" https://claude.ai/code/artifact/b5d65276-7b55-4114-a415-3205e0c128eb
#    ALWAYS re-read immediately before publishing — the page self-saves on every tap.
# 2. node merge_state.js --live live.html --build build.html --report-only
#    Check the `app trackers` line. If it says "kept from LIVE", her taps are safe.
#    If it prints a `dropped` warning — STOP, do not publish.
#    node merge_state.js --live live.html --build build.html --out build.html
# 3. node run_gate.js build.html                       # must be 332 passed, 0 failed
# 4. publish: file_path + that url, short label. NO capabilities, NO contract, NEVER force.
# 5. On version-conflict: inspect the newer copy FIRST. Re-merge onto IT if needed.
```

## Do NOT do this

Creating a fresh artifact via `/mnt/user-data/outputs/*.html` would render, but it would
be a **new** artifact at a new URL. Her live state stays stranded on b5d65276 and she ends
up with a third page to reconcile (there is already one stray, below). Publishing must go
to the existing URL. Wait for the tool.

## Standing constraints (unchanged, still in force)

- ONE action at a time. Never a wall of tasks. Plain words — she said "I don't understand"
  once when led with jargon; the fix was to explain it like spell-check.
- Her reply IS the record. Draft and propose only. Never mark habits on inference.
- No guilt framing: no "overdue", no "carried over", no red.
- Font: settled. Do not offer font switching again.

## Still open

- **Publishing.** Three sessions now with no artifact tool. Everything else is ready.
- Morning brief `trig_01PZMkQ3Nn12cXUQPAsCCSfk` — FAILING (~12s) as of 09-01, undiagnosed.
- Degree audit not uploaded. Loans: IBR switch in progress (t2). Not enrolled at FAU this term.
- OLD artifact 669893d2-… — never publish to it; deletion still unresolved.
- Sept 13 Reminder ("Nudge Cleveland Clinic internal transfer if no reply") open and correct.
