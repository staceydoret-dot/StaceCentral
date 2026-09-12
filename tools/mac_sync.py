#!/usr/bin/env python3
"""Runs on the Mac. Syncs sync/today.json (exported from the dashboard) with the
"Claude" list in Apple Reminders through the local connector, then sends a
report to a cloud Claude session so the dashboard gets updated.

    python3 tools/mac_sync.py --today-url URL --server dist/index.js --inbox SESSION_ID
    python3 tools/mac_sync.py --today-file sync/today.json --server dist/index.js --dry-run
"""
import argparse, json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

HEAD = re.compile(r"^\[( |x)\] (.*) — (.*?) · list: (.*?)(?: · (.*))?$")
AID = re.compile(r"artifact-id:\s*(t\d+)")

class Mcp:
    def __init__(self, server):
        self.p = subprocess.Popen(["node", server], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, bufsize=1)
        self.n = 0
        self._send({"jsonrpc": "2.0", "id": self._id(), "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "mac-sync", "version": "1"}}})
        self._recv(); self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
    def _id(self): self.n += 1; return self.n
    def _send(self, m): self.p.stdin.write(json.dumps(m) + "\n"); self.p.stdin.flush()
    def _recv(self):
        while True:
            line = self.p.stdout.readline()
            if not line: raise RuntimeError("connector exited: " + self.p.stderr.read().strip())
            line = line.strip()
            if line.startswith("{"):
                msg = json.loads(line)
                if "id" in msg: return msg
    def call(self, tool, args=None):
        self._send({"jsonrpc": "2.0", "id": self._id(), "method": "tools/call",
                    "params": {"name": tool, "arguments": args or {}}})
        msg = self._recv()
        if "error" in msg: raise RuntimeError(f"{tool}: {msg['error'].get('message')}")
        res = msg["result"]; text = "\n".join(c.get("text", "") for c in res.get("content", []))
        if res.get("isError"): raise RuntimeError(f"{tool}: {text.strip()}")
        return text
    def close(self):
        try: self.p.stdin.close(); self.p.wait(timeout=5)
        except Exception: self.p.kill()

def parse_reminders(text):
    out, cur = [], None
    for raw in text.splitlines():
        m = HEAD.match(raw)
        if m:
            cur = {"done": m.group(1) == "x", "title": m.group(2).strip(), "id": None, "aid": None}
            out.append(cur); continue
        if cur is None: continue
        s = raw.strip()
        if s.startswith("id: "): cur["id"] = s[4:].strip()
        elif s.startswith("notes: "):
            a = AID.search(s); cur["aid"] = a.group(1) if a else None
    return out

def norm(s): return re.sub(r"\s+", " ", (s or "").strip().lower())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today-url"); ap.add_argument("--today-file")
    ap.add_argument("--server", required=True); ap.add_argument("--list", default="Claude")
    ap.add_argument("--inbox", help="cloud session id to send the report to")
    ap.add_argument("--report-out", help="also write the report JSON here")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if a.today_file:
        today = json.load(open(a.today_file, encoding="utf-8"))
    elif a.today_url:
        req = urllib.request.Request(a.today_url, headers={"Cache-Control": "no-cache"})
        today = json.load(urllib.request.urlopen(req, timeout=30))
    else:
        sys.exit("need --today-url or --today-file")
    tasks = today.get("tasks", [])

    mcp = Mcp(a.server)
    try:
        status = mcp.call("reminders_status")
        if "active backend: none" in status:
            print(status); sys.exit(2)
        rems = parse_reminders(mcp.call("reminders_search", {"list": a.list, "status": "all", "limit": 200}))
        by_aid = {r["aid"]: r for r in rems if r["aid"]}
        by_title = {}
        for r in rems: by_title.setdefault(norm(r["title"]), r)
        def match(t): return by_aid.get(t.get("id")) or by_title.get(norm(t.get("text")))

        # Reminders -> dashboard
        done_ids = [t["id"] for t in tasks if not t["done"] and match(t) and match(t)["done"]]
        known = {norm(t["text"]) for t in tasks}
        add = [{"text": r["title"]} for r in rems if not r["done"] and not r["aid"] and norm(r["title"]) not in known]

        # dashboard -> Reminders
        created, failed = [], []
        for t in tasks:
            if t["done"] or t["info"] or match(t): continue
            notes = f"artifact-id: {t['id']}" + (("\n" + t["why"]) if t.get("why") else "")
            if a.dry_run: created.append(t["id"]); continue
            try:
                mcp.call("reminders_create", {"title": t["text"], "list": a.list, "notes": notes, "due": "today"})
                created.append(t["id"])
            except RuntimeError as e: failed.append(f"{t['id']}: {e}")
        to_complete = [match(t)["id"] for t in tasks if t["done"] and match(t) and not match(t)["done"] and match(t)["id"]]
        if to_complete and not a.dry_run: mcp.call("reminders_complete", {"ids": to_complete})
    finally:
        mcp.close()

    report = {"at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "source_export": today.get("exported_at"), "done": done_ids, "add": add,
              "created": created, "completed": to_complete, "create_failed": failed, "dry_run": a.dry_run}
    print(f"ticked off on the phone, to mark done on the tab: {len(done_ids)}")
    print(f"typed into Reminders, to add to the tab: {len(add)}")
    print(f"reminders created from the tab: {len(created)}")
    print(f"reminders completed because the tab said done: {len(to_complete)}")
    if failed: print("failed: " + "; ".join(failed))
    print(json.dumps(report, ensure_ascii=False))
    if a.report_out:
        json.dump(report, open(a.report_out, "w", encoding="utf-8"), ensure_ascii=False)

    if a.inbox and not a.dry_run and (done_ids or add):
        msg = ("MAC SYNC REPORT — apply this to the dashboard Today tab, then reply in one line.\n"
               + json.dumps({"done": done_ids, "add": add}, ensure_ascii=False))
        r = subprocess.run(["claude", "-p", "--cloud", a.inbox], input=msg, text=True,
                           capture_output=True, timeout=120)
        print("sent to cloud inbox:", "ok" if r.returncode == 0 else f"FAILED {r.stderr.strip()[:200]}")
    elif a.inbox and not a.dry_run:
        print("nothing to send to the cloud inbox")

if __name__ == "__main__":
    main()
