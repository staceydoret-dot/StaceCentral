#!/usr/bin/env python3
"""Two-way sync between the dashboard artifact's Today tab and Apple Reminders.

Runs anywhere the apple-reminders MCP server can run (iCloud CalDAV needs
ICLOUD_USERNAME and ICLOUD_APP_PASSWORD in the environment).

    python3 tools/today_sync_cloud.py --artifact in.html --out new.html

Talks to the connector over stdio JSON-RPC, so nothing has to be registered.
Writes --out only when the artifact actually changed, and prints a JSON
report on the last line. Exit 2 means the Reminders backend is unavailable.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date

TAG = re.compile(r'(<script id="app-state" type="application/json">)(.*?)(</script>)', re.S)
HEAD = re.compile(r"^\[( |x)\] (.*) — (.*?) · list: (.*?)(?: · (.*))?$")
ARTIFACT_ID = re.compile(r"artifact-id:\s*(t\d+)")


# ----------------------------------------------------------------- MCP client
class Mcp:
    def __init__(self, server):
        self.p = subprocess.Popen(
            ["node", server], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        self.n = 0
        self._send({"jsonrpc": "2.0", "id": self._id(), "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "today-sync", "version": "1"}}})
        self._recv()
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _id(self):
        self.n += 1
        return self.n

    def _send(self, msg):
        self.p.stdin.write(json.dumps(msg) + "\n")
        self.p.stdin.flush()

    def _recv(self):
        while True:
            line = self.p.stdout.readline()
            if not line:
                err = self.p.stderr.read()
                raise RuntimeError("MCP server exited: " + err.strip())
            line = line.strip()
            if line.startswith("{"):
                msg = json.loads(line)
                if "id" in msg:
                    return msg

    def call(self, tool, args=None):
        self._send({"jsonrpc": "2.0", "id": self._id(), "method": "tools/call",
                    "params": {"name": tool, "arguments": args or {}}})
        msg = self._recv()
        if "error" in msg:
            raise RuntimeError(f"{tool}: {msg['error'].get('message')}")
        res = msg["result"]
        text = "\n".join(c.get("text", "") for c in res.get("content", []))
        if res.get("isError"):
            raise RuntimeError(f"{tool}: {text.strip()}")
        return text

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(timeout=5)
        except Exception:
            self.p.kill()


# ------------------------------------------------------------------- parsing
def parse_reminders(text):
    out, cur = [], None
    for raw in text.splitlines():
        m = HEAD.match(raw)
        if m:
            cur = {"done": m.group(1) == "x", "title": m.group(2).strip(),
                   "due": m.group(3), "list": m.group(4), "id": None, "notes": "",
                   "aid": None}
            out.append(cur)
            continue
        if cur is None:
            continue
        s = raw.strip()
        if s.startswith("id: "):
            cur["id"] = s[4:].strip()
        elif s.startswith("notes: "):
            cur["notes"] = s[7:]
            a = ARTIFACT_ID.search(cur["notes"])
            cur["aid"] = a.group(1) if a else None
    return out


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def next_id(tasks):
    used = {t.get("id") for t in tasks}
    n = 1
    while f"t{n}" in used:
        n += 1
    return f"t{n}"


# ---------------------------------------------------------------------- sync
def run(args):
    html = open(args.artifact, encoding="utf-8").read()
    m = TAG.search(html)
    if not m:
        sys.exit("no app-state block in artifact")
    state = json.loads(m.group(2))
    tasks = state.setdefault("today", {}).setdefault("tasks", [])
    stamp = date.today().isoformat()

    mcp = Mcp(args.server)
    try:
        status = mcp.call("reminders_status")
        if "active backend: none" in status:
            print(status)
            print(json.dumps({"ok": False, "reason": "no reminders backend"}))
            sys.exit(2)

        rems = parse_reminders(mcp.call("reminders_search", {
            "list": args.list, "status": "all", "limit": 200}))
        by_aid = {r["aid"]: r for r in rems if r["aid"]}
        by_title = {}
        for r in rems:
            by_title.setdefault(norm(r["title"]), r)

        def match(t):
            return by_aid.get(t.get("id")) or by_title.get(norm(t.get("text")))

        # 1. Reminders -> artifact: ticked-off reminders close their task
        marked = []
        for t in tasks:
            r = match(t)
            if r and r["done"] and not t.get("done"):
                t["done"] = True
                t["at"] = stamp
                marked.append(t["id"])

        # 2. Reminders -> artifact: reminders typed by hand become tasks
        added = []
        texts = {norm(t.get("text")) for t in tasks}
        for r in rems:
            if r["done"] or r["aid"] or norm(r["title"]) in texts:
                continue
            tid = next_id(tasks)
            tasks.append({"id": tid, "from": "you", "done": False, "text": r["title"],
                          "why": "", "url": "", "urlLabel": "", "mins": "", "since": stamp})
            texts.add(norm(r["title"]))
            added.append({"id": tid, "text": r["title"]})

        # 3. Artifact -> Reminders: open tasks with no reminder get one
        created, create_failed = [], []
        for t in tasks:
            if t.get("done") or t.get("info") or match(t):
                continue
            notes = f"artifact-id: {t['id']}"
            if t.get("why"):
                notes += "\n" + t["why"]
            payload = {"title": t["text"], "list": args.list, "notes": notes, "due": "today"}
            if args.dry_run:
                created.append(t["id"])
                continue
            try:
                mcp.call("reminders_create", payload)
                created.append(t["id"])
            except RuntimeError as e:
                create_failed.append(f"{t['id']}: {e}")

        # 4. Artifact -> Reminders: tasks finished on the tab tick their reminder
        completed = []
        ids = [match(t)["id"] for t in tasks
               if t.get("done") and match(t) and not match(t)["done"] and match(t)["id"]]
        if ids and not args.dry_run:
            mcp.call("reminders_complete", {"ids": ids})
        completed = ids
    finally:
        mcp.close()

    changed = bool(marked or added)
    if changed and not args.dry_run:
        state["updated"] = stamp
        body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        out = html[: m.start(2)] + body + html[m.end(2):]
        json.loads(TAG.search(out).group(2))  # must still parse
        open(args.out, "w", encoding="utf-8").write(out)

    open_after = sum(1 for t in tasks if not t.get("done") and not t.get("info"))
    print(f"ticked off from Reminders into the tab: {len(marked)}")
    print(f"reminders of yours pulled onto the tab: {len(added)}")
    print(f"reminders created from the tab: {len(created)}")
    print(f"reminders completed because the tab said done: {len(completed)}")
    if create_failed:
        print("failed to create: " + "; ".join(create_failed))
    print(f"open tasks now: {open_after}")
    print(json.dumps({"ok": True, "changed": changed, "marked_done": marked, "added": added,
                      "created": created, "completed": completed,
                      "create_failed": create_failed, "open_after": open_after,
                      "dry_run": args.dry_run}, ensure_ascii=False))


def selftest():
    sample = (
        "3 reminders (all, list: Claude)\n\n"
        "[x] Call FAU Financial Aid — 561-297-3530. — Fri, Sep 12 · list: Claude\n"
        "    id: ABC-1\n"
        "    notes: artifact-id: t7 / Mon–Thu 8am–6pm, Fri 8am–5pm ET.\n"
        "[ ] 9/14 — APRN appointment: bring the ADA form — Fri, Sep 12 (overdue) · list: Claude · high priority\n"
        "    id: ABC-2\n"
        "    notes: artifact-id: t2 / The form is only useful if it comes back completed.\n"
        "[ ] Buy stamps — no due date · list: Claude\n"
        "    id: ABC-3\n"
    )
    r = parse_reminders(sample)
    assert len(r) == 3, r
    assert r[0]["done"] and r[0]["aid"] == "t7" and r[0]["id"] == "ABC-1"
    assert r[1]["title"] == "9/14 — APRN appointment: bring the ADA form", r[1]["title"]
    assert r[1]["aid"] == "t2" and not r[1]["done"]
    assert r[2]["aid"] is None and r[2]["title"] == "Buy stamps"
    print("selftest OK: parser handles em-dashes in titles, flags, and missing notes")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact")
    ap.add_argument("--out")
    ap.add_argument("--server", default=os.path.join(os.path.dirname(__file__), "..", "dist", "index.js"))
    ap.add_argument("--list", default="Claude")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
    elif not (a.artifact and a.out):
        ap.error("--artifact and --out are required")
    else:
        run(a)
