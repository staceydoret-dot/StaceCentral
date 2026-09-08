import json, io, sys

S = "/tmp/claude-0/-home-user-StaceCentral/a251d0f1-4c8a-560d-85c5-4a48b59404ea/scratchpad"
path = S + "/artifact.html"
lines = io.open(path, encoding="utf-8").read().split("\n")

# locate the app-state line by marker, never by hardcoded index
idx = [i for i, l in enumerate(lines) if l.startswith('<script id="app-state"')]
assert len(idx) == 1, "expected exactly one app-state line, got %r" % idx
i = idx[0]
PRE, POST = '<script id="app-state" type="application/json">', '</script>'
raw = lines[i]
assert raw.startswith(PRE) and raw.endswith(POST)
st = json.loads(raw[len(PRE):-len(POST)])

TODAY = "2026-09-08"

# --- capture the pre-merge fingerprint of everything we must NOT disturb ---
before = {k: json.dumps(st.get(k), sort_keys=True) for k in
          ("checked", "notes", "phases", "coursework", "programs", "jobs",
           "therapy", "visions", "fixed", "scheduled", "log", "banked")}

old_tasks = st["today"]["tasks"]
by_id = {t["id"]: t for t in old_tasks}          # index by id, not position
print("old queue (by id):", [t["id"] for t in old_tasks])

# --- 1. promote today's completed tasks into wins, exactly as rollToday would ---
st.setdefault("wins", [])
promoted = []
for t in old_tasks:                               # rollToday iterates in array order
    if t.get("done"):
        st["wins"].insert(0, {"text": t["text"], "at": t.get("at") or TODAY})
        promoted.append(t["id"])
st["wins"] = st["wins"][:30]
print("promoted to wins:", promoted)

# --- 2. the new queue, in the order Stacey asked for ---
st["today"]["tasks"] = [
  {"id":"t1","from":"claude","done":False,"mins":"5 min",
   "text":"Message the Senior Director at Weston — check in on where her HR conversation landed.",
   "why":"The 9/26 cohort close date is coming up. A short check-in keeps you in the running without adding a second, uncoordinated signal into the same HR thread.",
   "url":"","urlLabel":"","since":TODAY},

  {"id":"t2","from":"claude","done":False,"mins":"",
   "text":"9/14 — APRN appointment: bring the ADA accommodation form + talking points for Q2–Q5.",
   "why":"The form is only useful if it comes back completed. Walk in with it and the Q2–Q5 talking points already written so nothing depends on remembering it in the room.",
   "url":"","urlLabel":"","since":TODAY},

  {"id":"t3","from":"claude","done":False,"mins":"10 min",
   "text":"After 9/14 — Submit the completed ADA form to Absence Management.",
   "why":"Fax 216-444-7385, or email AMOforms@ccf.org. Dated paperwork going in is what starts the clock and protects you later.",
   "url":"mailto:AMOforms@ccf.org","urlLabel":"AMOforms@ccf.org","since":TODAY},

  {"id":"t4","from":"claude","done":False,"mins":"15 min",
   "text":"After submission — Call Absence Management: ask about interim schedule flexibility while the accommodation is under review.",
   "why":"Review takes time, and you need the mornings to work in the meantime. Asking for interim flexibility is a separate, smaller ask than the accommodation itself.",
   "url":"tel:2164482247","urlLabel":"216.448.2247","since":TODAY},

  {"id":"t5","from":"claude","done":False,"info":True,"mins":"",
   "text":"FMLA — no action needed. Filed and received, sitting in their queue.",
   "why":"Here so you stop re-checking it. Nothing is owed from you on this one.",
   "url":"","urlLabel":"","since":TODAY},
]
st["today"]["date"] = TODAY
st["updated"] = TODAY

# --- 3. prove the untouchable keys are byte-identical ---
for k, v in before.items():
    assert json.dumps(st.get(k), sort_keys=True) == v, "MUTATED: %s" % k
print("untouched keys verified:", ", ".join(sorted(before)))
print("checked map still:", json.dumps(st["checked"], sort_keys=True))

lines[i] = PRE + json.dumps(st, ensure_ascii=False, separators=(",", ":")) + POST
io.open(path, "w", encoding="utf-8").write("\n".join(lines))
print("state written OK")
