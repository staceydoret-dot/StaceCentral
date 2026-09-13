# -*- coding: utf-8 -*-
import io, json
P="artifact.html"; PRE='<script id="app-state" type="application/json">'; POST='</script>'
DRAFTS="https://docs.google.com/document/d/1TF-N_WkslzknBbPxcdpOvULJglAAmZBouitUgaswzoc/edit"

lines=io.open(P,encoding="utf-8").read().split("\n")
idx=[i for i,l in enumerate(lines) if l.startswith(PRE)]; assert len(idx)==1
i=idx[0]; st=json.loads(lines[i][len(PRE):-len(POST)])

UNTOUCHED=("checked","notes","phases","coursework","programs","jobs","therapy","visions",
           "fixed","scheduled","scheduledOnce","log","banked","answered","callouts",
           "affirmations","adhd","adhdAffirmations","questions","asks","pinned","pipeline",
           "monthlyReviews","statusLadder","jobFeedback","display","fonts","view")
before={k:json.dumps(st.get(k),sort_keys=True) for k in UNTOUCHED}
tb={t["id"]:json.dumps(t,sort_keys=True) for t in st["today"]["tasks"]}
wins_before=list(st["wins"])

# --- 1. a win per draft completed, kept behind the appeal so it stays the headline
NEW=[{"text":"Drafted the message to my APRN — the ADA form, both accommodations, "
              "and the questions only she can answer.","at":"2026-09-12"},
     {"text":"Drafted the follow-up to the Senior Director at Weston — leading with "
              "the FMLA approval.","at":"2026-09-12"}]
for w in NEW:
    assert not any(x.get("text")==w["text"] for x in st["wins"]), w["text"]
st["wins"][1:1]=NEW
st["wins"]=st["wins"][:30]

# --- 2. un-park the Director follow-up and put the final text on it
t1=next(t for t in st["today"]["tasks"] if t["id"]=="t1")
t1["text"]="Text the Senior Director at Weston — Monday, between 9am and 4pm."
t1["why"]=(
 "NO LONGER ON HOLD. Your application has been under review since 8/30 and she is working it "
 "with HR; it was returned 9/2 on an attendance rule, and the cohort closes 9/26. The FMLA "
 "approval on 9/9 did not exist when it was bounced — that is the new fact, and she does not "
 "have it. Your follow-up was due 9/9, so you are already late. Put her name in first: "
 "“Hi [Name] — it's Stacey. Quick update on the EEG apprentice application: my intermittent "
 "FMLA was approved 9/9, backdated to 8/26. Since it came back on attendance, I thought that "
 "might matter for the review. I've also filed a written appeal of the attendance action, so "
 "that's moving through HR too. Happy to send the paperwork over if it helps — and I really "
 "appreciate you carrying this. Anything useful I can send before the cohort closes?”"
)
t1["url"]=DRAFTS; t1["urlLabel"]="All drafts, ready to send"; t1["mins"]="2 min"

t2=next(t for t in st["today"]["tasks"] if t["id"]=="t2")
t2["url"]=DRAFTS; t2["urlLabel"]="All drafts, ready to send"

t12=next(t for t in st["today"]["tasks"] if t["id"]=="t12")
t12["why"]=t12["why"]+" Every draft — this one, the APRN message and the Weston text — is in one doc: "+DRAFTS

# --- 3. order: the appeal, then Weston (both have clocks on them)
tasks=st["today"]["tasks"]; tasks.remove(t1); tasks.insert(1,t1)

for k,v in before.items():
    assert json.dumps(st.get(k),sort_keys=True)==v, "MUTATED: %s"%k
ta={t["id"]:json.dumps(t,sort_keys=True) for t in st["today"]["tasks"]}
assert set(ta)==set(tb)
assert sorted(k for k in tb if tb[k]!=ta[k])==["t1","t12","t2"]
assert st["wins"][0]==wins_before[0] and st["wins"][3:]==wins_before[1:28]
assert len(st["checked"])==7
order=[t["id"] for t in tasks]
assert order[:2]==["t12","t1"], order

lines[i]=PRE+json.dumps(st,ensure_ascii=False,separators=(",",":"))+POST
io.open(P,"w",encoding="utf-8").write("\n".join(lines))
print("order:",order)
print("today's wins:",[w["text"][:52] for w in st["wins"] if w.get("at")=="2026-09-12"])
