#!/usr/bin/env python3
"""Export the dashboard artifact's Today tab to a small JSON file the Mac can fetch.

    python3 tools/export_today.py --artifact in.html --out sync/today.json
"""
import argparse, json, re
from datetime import datetime, timezone

TAG = re.compile(r'<script id="app-state" type="application/json">(.*?)</script>', re.S)

ap = argparse.ArgumentParser()
ap.add_argument("--artifact", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()

html = open(a.artifact, encoding="utf-8").read()
state = json.loads(TAG.search(html).group(1))
tasks = state.get("today", {}).get("tasks", [])
out = {
    "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "date": state.get("today", {}).get("date"),
    "tasks": [
        {"id": t.get("id"), "text": t.get("text", ""), "why": t.get("why", ""),
         "done": bool(t.get("done")), "info": bool(t.get("info")), "since": t.get("since")}
        for t in tasks
    ],
}
json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
openc = sum(1 for t in out["tasks"] if not t["done"] and not t["info"])
print(f"exported {len(out['tasks'])} tasks ({openc} open) to {a.out}")
