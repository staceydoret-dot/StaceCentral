# -*- coding: utf-8 -*-
import io, json

P = "artifact.html"
PRE = '<script id="app-state" type="application/json">'
POST = '</script>'
DOC = "https://docs.google.com/document/d/1Zdcoc4J_JbsmknxMx5gG-cYh5ZsghmujzIre_IhRxVE/edit"

lines = io.open(P, encoding="utf-8").read().split("\n")
idx = [i for i, l in enumerate(lines) if l.startswith(PRE)]
assert len(idx) == 1, idx
i = idx[0]
st = json.loads(lines[i][len(PRE):-len(POST)])

# --- snapshot everything we must not disturb -------------------------------
UNTOUCHED = ("checked", "notes", "phases", "coursework", "programs", "jobs",
             "therapy", "visions", "fixed", "scheduled", "scheduledOnce", "log",
             "banked", "answered", "callouts", "affirmations", "adhd",
             "adhdAffirmations", "questions", "asks", "pinned", "pipeline",
             "monthlyReviews", "statusLadder", "jobFeedback", "display",
             "fonts", "view")
before = {k: json.dumps(st.get(k), sort_keys=True) for k in UNTOUCHED}
tasks_before = {t["id"]: json.dumps(t, sort_keys=True) for t in st["today"]["tasks"]}
wins_before = json.dumps(st["wins"], sort_keys=True)
date_before = st["today"]["date"]

# --- 1. the win: writing the draft is the thing she did today --------------
WIN = {
    "text": "Wrote the written appeal to HR — the FMLA timeline, both notices, "
            "the Cypress Creek date, formatted and ready to send.",
    "at": "2026-09-13",
}
assert not any(w.get("text") == WIN["text"] for w in st["wins"]), "win already present"
st["wins"].insert(0, WIN)
st["wins"] = st["wins"][:30]

# --- 2. Monday's task is the four moves, indexed by id ---------------------
t12 = next(t for t in st["today"]["tasks"] if t["id"] == "t12")
t12["text"] = "Monday 9/14 — send the appeal: download, attach, send, forward to yourself."
t12["why"] = (
    "Four moves, all small. 1) Open the Google Doc, check the font, File › Download › PDF. "
    "2) In Outlook search “FMLA” and grab the Notice of Eligibility and the Designation Notice. "
    "3) New email to Ruth, subject “Written Appeal — Corrective Action Issued September 8, 2026 "
    "— Stacey Doret, ID 1026617”, attach all three PDFs, send. "
    "4) Forward the sent copy to your Gmail — that is your proof of timely delivery. "
    "Hard deadline Tuesday 9/15, so Monday leaves a day of buffer."
)
t12["url"] = DOC
t12["urlLabel"] = "Open the appeal letter"
t12["mins"] = "15 min"

# --- verify nothing else moved ---------------------------------------------
for k, v in before.items():
    assert json.dumps(st.get(k), sort_keys=True) == v, "MUTATED: %s" % k

tasks_after = {t["id"]: json.dumps(t, sort_keys=True) for t in st["today"]["tasks"]}
assert set(tasks_after) == set(tasks_before), "task ids changed"
changed = [k for k in tasks_before if tasks_before[k] != tasks_after[k]]
assert changed == ["t12"], "unexpected task edits: %s" % changed

assert st["today"]["date"] == date_before, "today.date moved"
assert json.loads(wins_before) == st["wins"][1:] or True
assert st["wins"][0] == WIN and st["wins"][1:] == json.loads(wins_before)[:29], "wins disturbed"
assert len(st["checked"]) == 7, "checked lost entries"

order = [t["id"] for t in st["today"]["tasks"]]
assert order[0] == "t12", order

lines[i] = PRE + json.dumps(st, ensure_ascii=False, separators=(",", ":")) + POST
io.open(P, "w", encoding="utf-8").write("\n".join(lines))

print("OK — wins:", len(st["wins"]), "| tasks:", len(st["today"]["tasks"]))
print("new win :", st["wins"][0]["text"][:70])
print("t12 text:", t12["text"])
print("order   :", order)
