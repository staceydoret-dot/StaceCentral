# stacey-plan — the job board system

**Read this file first, every session.** It is the contract for how this system works.

---

## What this is

A job board for one person, Stacey Doret, hunting one specific thing:

> **Paid EEG / neurodiagnostic training that credibly builds toward psychiatry.**

Not "a job." A job that *trains her into a credential she doesn't have yet*, in a
clinical setting that will still make sense on a psychiatry application in three years.

Everything in this folder exists to serve that one sentence.

---

## The files, and which one is the boss

| File | What it is | Who edits it |
|---|---|---|
| `preferences.json` | **The boss.** Every keyword, weight, filter, and threshold. | Stacey, or Claude at her request |
| `profile.json` | Her factual background, extracted from her CV. What she can honestly claim. | Update when the CV changes |
| `listings.json` | Every listing ever seen, with status. The memory. | Claude, on each search run |
| `board.py` | The engine. Scores and ranks. Contains **no** job data and **no** preferences. | Claude, tested first |
| `JOB_BOARD.md` | Generated output. The thing Stacey actually reads. | **Never by hand** — regenerate it |
| `tests/test_board.py` | 48 tests. The safe environment. | Claude, alongside any logic change |
| `debug.log` | Append-only record of runs, fixes, and whether they worked. | Claude |

The separation is the point: **`board.py` never hardcodes what Stacey wants.**
If the board is surfacing the wrong things, the fix is almost always in
`preferences.json`, not in the code.

---

## Start-of-session checklist

Run this, in this order, every time:

```bash
cd stacey-plan
python3 tests/test_board.py     # 1. is the engine sound?
python3 board.py check          # 2. is the data clean?
python3 board.py stats          # 3. where does the pipeline stand?
python3 board.py board          # 4. regenerate JOB_BOARD.md
```

If step 1 fails, **stop and fix the engine before touching anything else.**
A broken engine producing confident job suggestions is worse than no board.

---

## How scoring works

Every listing gets 0–100. Eight weighted components, then penalties subtracted.

| Component | Weight | What it asks |
|---|---:|---|
| `role_fit` | 40 | Is this the actual target role, clinical-adjacent, or just a bridge job? |
| `training` | 30 | **Will they train someone with no EEG credential?** The decisive question. |
| `location` | 15 | Broward/Miami-Dade commutable, or fully remote? Both count equally. |
| `freshness` | 12 | Is it still live, or already filled? |
| `differentiators` | 12 | Does it ask for something she genuinely has an edge in? |
| `schedule` | 10 | Full-time, part-time, contract, or paid internship? |
| `compensation` | 8 | Soft. Never kills a Tier 1 training role. |
| `employer` | 5 | Is it a South Florida system she has a line into? |

Then penalties: credential required with no training (−25), wants 2+ years (−15),
travel assignment (−10), staffing agency (−5), no pay published (−3).

**Bands:** APPLY NOW (75+) · STRONG (60+) · WORTH A LOOK (45+) · BACKUP (30+) · SKIP.

### Why training is weighted so heavily

Stacey has a BS in Neuroscience and Psychology, a psychiatry rotation at Jackson
Behavioral, and 70 documented shadowing hours. What she does **not** have is an
ABRET registration or a single logged EEG hour. Every posting that says
"R. EEG T. required" screens her out on a technicality. Every posting that says
"we will train" is a door that is actually open.

So a $15/hr apprenticeship that certifies her outranks a $24/hr dead-end job.
That is deliberate, and `test_low_pay_tier1_survives` enforces it.

---

## Hard filters (never shown, ever)

- **Unpaid.** Non-negotiable. She has done unpaid research already; she needs income.
- **Scam markers** — pay-to-train, commission-only, "purchase your own equipment."
- **Excluded titles in the title field** — driver, cashier, sales rep, warehouse.
  Note: title only. A posting that mentions "no driver's license required" in the
  body is not a driving job, and `test_hard_filters` guards against that mistake.

---

## The ADHD rules (these are functional requirements, not decoration)

1. **Never show more than 10 listings.** A wall of 60 is the same as zero.
   Enforced by `max_suggestions_per_run` and `test_render_caps_output`.
2. **Top 3 get full detail. Everything else is one table row.** Depth where the
   decision actually gets made.
3. **Every listing states one next action.** "Apply today" beats "consider applying."
4. **Filtered-out listings stay visible in a collapsed section** — so the same
   dead end doesn't get re-evaluated from scratch next week.
5. **Concerns are stated plainly, not buried.** If a job wants 3 years of
   experience, the board says so and then says apply anyway if it's Tier 1.

---

## Adding listings

Append to the `listings` array in `listings.json`:

```json
{
  "id": "indeed-JOBSEARCH_38",
  "title": "Neurology Technician",
  "company": "The Neurologic Wellness Institute PLLC",
  "location": "Boca Raton, FL",
  "remote": "onsite",
  "salary_text": "",
  "job_type": "fulltime",
  "posted_days_ago": 17,
  "url": "https://to.indeed.com/aacm7sdxw2vl",
  "description": "full posting text — this is what scoring reads",
  "source": "indeed",
  "status": "new",
  "added": "2026-09-03",
  "notes": ""
}
```

`description` matters most. An empty description means the engine is scoring on
a title alone and will get it wrong. Pull the real posting text.

Then: `python3 board.py check && python3 board.py board`.

**Statuses:** `new` → `saved` → `applied` → `interviewing` → `offer`, or
`rejected` / `closed` / `not_interested`. The last three drop off the board but
stay in the file so they don't resurface.

---

## Changing the logic (the safety rule)

The project constraint is explicit: **nothing ships untested.**

1. Write or update a test in `tests/test_board.py` that fails on the current behavior.
2. Change `board.py`.
3. `python3 tests/test_board.py` — all tests must pass, not just the new one.
4. `python3 board.py check` — live data must still validate.
5. Log the change in `debug.log` with what it was meant to fix.
6. Next session, re-read `debug.log`. **If a fix didn't help, revert it.**

A fix that breaks an existing test is a wrong fix, not a test that needs updating.

---

## Known gaps in Stacey's profile (the board accounts for these)

- **No ABRET / R. EEG T. registration, no EEG hours.** The thing the whole board is trying to solve.
- **No current BLS/CPR card.** One day, roughly $60–90 in Broward. This is the
  single cheapest thing she can do to unlock more postings. It should probably
  happen before the next application round.
- **Clinical exposure is shadowing and summer programs, not paid hospital work.**
  Framing matters: lead with the 70 documented hours and the Jackson Behavioral
  psychiatry rotation, not with "recent graduate."
- **Graduated December 2024.** Postings asking 2+ years are a stretch, but
  neurodiagnostic postings routinely overstate. Apply to Tier 1 anyway.

## Real advantages the board scores up

- **Advanced Haitian Creole**, plus intermediate Spanish and French. In Broward
  and Miami-Dade hospitals this is a hiring edge, not a nice-to-have.
- **BS Neuroscience + Psychology.** Most EEG trainee postings ask for an
  associate's degree or "science coursework." She is over the bar on paper.
- **Psychiatry rotation at Jackson Behavioral Hospital** — neuropsych assessments,
  therapeutic interviewing, shadowed psychiatrists in outpatient clinics.
- **PCR, ELISA, cell culture, RStudio.** Strong for clinical research coordinator roles.
- **Two years serving elderly residents** at FiveStar Premier. Real patient-facing
  hours that most new grads don't have.
