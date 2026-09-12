#!/usr/bin/env python3
"""Apply a Mac sync report to the dashboard artifact's Today tab.

    python3 tools/apply_report.py --artifact in.html --report report.json --out new.html

report.json: {"done": ["t13"], "add": [{"text": "..."}]}
Writes --out only if something changed. Prints a JSON summary.
"""
import argparse, json, re
from datetime import date

TAG = re.compile(r'(<script id="app-state" type="application/json">)(.*?)(</script>)', re.S)

def norm(s): return re.sub(r"\s+", " ", (s or "").strip().lower())

def next_id(tasks):
    used = {t.get("id") for t in tasks}; n = 1
    while f"t{n}" in used: n += 1
    return f"t{n}"

ap = argparse.ArgumentParser()
ap.add_argument("--artifact", required=True); ap.add_argument("--report", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()

html = open(a.artifact, encoding="utf-8").read()
m = TAG.search(html)
state = json.loads(m.group(2))
tasks = state.setdefault("today", {}).setdefault("tasks", [])
rep = json.load(open(a.report, encoding="utf-8"))
stamp = date.today().isoformat()

marked = []
for t in tasks:
    if t.get("id") in set(rep.get("done", [])) and not t.get("done"):
        t["done"] = True; t["at"] = stamp; marked.append(t["id"])

added = []
texts = {norm(t.get("text")) for t in tasks}
for item in rep.get("add", []):
    text = (item.get("text") or "").strip()
    if not text or norm(text) in texts: continue
    tid = next_id(tasks)
    tasks.append({"id": tid, "from": "you", "done": False, "text": text, "why": item.get("why", ""),
                  "url": "", "urlLabel": "", "mins": "", "since": stamp})
    texts.add(norm(text)); added.append({"id": tid, "text": text})

changed = bool(marked or added)
if changed:
    state["updated"] = stamp
    body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    out = html[: m.start(2)] + body + html[m.end(2):]
    json.loads(TAG.search(out).group(2))
    open(a.out, "w", encoding="utf-8").write(out)
print(json.dumps({"changed": changed, "marked_done": marked, "added": added}, ensure_ascii=False))
