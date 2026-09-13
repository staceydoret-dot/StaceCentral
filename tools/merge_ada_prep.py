# -*- coding: utf-8 -*-
"""Put the ADA appointment prep onto t2, indexed by id.

Run AFTER a fresh `Artifact action:"read"` — Stacey is actively tapping the page,
so the live version moves between reads and a stale base gets the publish refused.
"""
import io, json

P = "artifact.html"
PRE = '<script id="app-state" type="application/json">'
POST = '</script>'

lines = io.open(P, encoding="utf-8").read().split("\n")
idx = [i for i, l in enumerate(lines) if l.startswith(PRE)]
assert len(idx) == 1, idx
i = idx[0]
st = json.loads(lines[i][len(PRE):-len(POST)])

# everything that is hers, not ours — jobs/jobFeedback/log/view change while we work
UNTOUCHED = ("checked", "notes", "phases", "coursework", "programs", "jobs", "therapy",
             "visions", "fixed", "scheduled", "scheduledOnce", "log", "banked", "wins",
             "answered", "callouts", "affirmations", "adhd", "adhdAffirmations",
             "questions", "asks", "pinned", "pipeline", "monthlyReviews", "statusLadder",
             "jobFeedback", "display", "fonts", "view")
before = {k: json.dumps(st.get(k), sort_keys=True) for k in UNTOUCHED}
tb = {t["id"]: json.dumps(t, sort_keys=True) for t in st["today"]["tasks"]}

t2 = next(t for t in st["today"]["tasks"] if t["id"] == "t2")
t2["text"] = ("9/14 — APRN appointment: the ADA form. Send it to her tonight so she "
              "isn't reading it cold.")
t2["why"] = (
    "Q1–Q9 are HERS to answer, not yours — you only sign the release on page 3. "
    "SEND TONIGHT through Grow Therapy: the ADA form + your FMLA Designation Notice, so the "
    "two documents don't contradict each other. "
    "THE ASK: (1) noise-reducing headphones for non-patient-facing work, (2) a flexible "
    "arrival window of 8:30–8:50 with arrival in that window not counted as tardiness. Say "
    "they address different limitations and are not interchangeable — otherwise they grant "
    "the headphones and call it done. "
    "THE ONE THING ONLY SHE CAN ANSWER: which is clinically true — (a) morning medication "
    "needs time to reach effect, (b) sleep onset / morning symptom burden, (c) time "
    "perception. Don't steer her; a rationale that doesn't match your chart is what gets "
    "denied. "
    "OPEN WITH: “I sent the form ahead so you'd have it. The main thing I need is your "
    "read on what's actually going on clinically — I gave a couple of guesses but I'd rather "
    "have your version than mine.” "
    "ALSO: Q7 and Q8 overlap and must match (ongoing vs temporary); Q9 re-evaluation date — "
    "12 months lines up with your FMLA period; ask whether there's a fee for employer "
    "paperwork. "
    "YOUR FACTS if feasibility comes up later: your role is covered from 8:00 and you start "
    "at 8:30, and your manager already moved you 8:15→8:30 without a problem."
)
t2["mins"] = "10 min tonight"

for k, v in before.items():
    assert json.dumps(st.get(k), sort_keys=True) == v, "MUTATED: %s" % k
ta = {t["id"]: json.dumps(t, sort_keys=True) for t in st["today"]["tasks"]}
assert [k for k in tb if tb[k] != ta[k]] == ["t2"], "unexpected task edits"

lines[i] = PRE + json.dumps(st, ensure_ascii=False, separators=(",", ":")) + POST
io.open(P, "w", encoding="utf-8").write("\n".join(lines))
print("t2 updated")
