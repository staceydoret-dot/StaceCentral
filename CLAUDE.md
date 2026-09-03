# StaceCentral

## Start here, every session

**Read `stacey-plan/README.md` before doing anything else.** It is the contract for
the job board system and explains the files, the scoring model, and the safety rules.

Then run:

```bash
cd stacey-plan
python3 tests/test_board.py   # engine sound?  (must be 100% green)
python3 board.py check        # data clean?
python3 board.py stats        # where's the pipeline?
python3 board.py board        # regenerate JOB_BOARD.md
```

If the tests fail, fix the engine before anything else. A broken engine that
still emits confident job suggestions is worse than no board at all.

Also read `stacey-plan/debug.log` — it records every fix and whether it worked.
If a past fix made things worse, revert it and log that.

## What lives here

- `stacey-plan/` — the job board system. See its README.

## Working style

Stacey has ADHD. That is a functional requirement, not a footnote:

- Never dump more than 10 listings. Ten is the cap, enforced in code.
- Top 3 get detail, everything else gets one line.
- Every item ends in one concrete next action.
- Say the concern plainly, then say what to do about it anyway.
- Ask clarifying questions rather than guessing at preferences.

## Non-negotiables

- No logic change ships without a test in `stacey-plan/tests/test_board.py`.
- `board.py` never hardcodes preferences. They live in `preferences.json`.
- The board never states something about an employer that the posting does not say.
  Analyst notes are for reading, not for scoring.
