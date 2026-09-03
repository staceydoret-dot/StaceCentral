#!/usr/bin/env python3
"""
Stacey's job board engine.

Reads preferences.json + profile.json + listings.json, scores every listing,
and renders a short prioritized board. Standard library only, so it runs
anywhere with Python 3.8+ and never breaks on a missing dependency.

Usage:
    python3 board.py board          # render JOB_BOARD.md from listings.json
    python3 board.py score <id>     # explain one listing's score in detail
    python3 board.py check          # validate data files, report problems
    python3 board.py stats          # pipeline counts by status and band

Design rule: this file contains no job data and no hardcoded preferences.
Everything that decides what Stacey wants lives in preferences.json.
"""

import json
import os
import re
import sys
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PREFS_PATH = os.path.join(HERE, "preferences.json")
PROFILE_PATH = os.path.join(HERE, "profile.json")
LISTINGS_PATH = os.path.join(HERE, "listings.json")
BOARD_PATH = os.path.join(HERE, "JOB_BOARD.md")
DEBUG_LOG = os.path.join(HERE, "debug.log")

# Below this many characters of description, we treat a listing as unread:
# scored on title and metadata alone, and labelled as such on the board.
MIN_DESCRIPTION_CHARS = 200


# --------------------------------------------------------------------------
# text helpers
# --------------------------------------------------------------------------

def normalize(text):
    """Lowercase and collapse punctuation to spaces so phrase matching is stable.

    Keeps '+' because '2+ years' is a meaningful token, and keeps '.' out so
    'R. EEG T.' and 'reegt' both reduce to comparable forms.
    """
    if not text:
        return ""
    t = text.lower()
    t = t.replace("&", " and ")
    t = re.sub(r"[^a-z0-9+/ ]+", " ", t)
    t = re.sub(r"\s+", " ", t)
    return " " + t.strip() + " "


def contains_phrase(haystack_norm, phrase):
    """Whole-token phrase match.

    Substring matching produced false positives in testing: 'pct' matched
    inside 'expected', 'cna' inside 'cnaught'. Padding both sides with spaces
    and normalizing the needle the same way fixes it without a real tokenizer.
    """
    p = normalize(phrase).strip()
    if not p:
        return False
    return (" " + p + " ") in haystack_norm


def any_phrase(haystack_norm, phrases):
    return [p for p in phrases if contains_phrase(haystack_norm, p)]


def listing_text(listing):
    """The employer's own words, as one blob, for keyword matching.

    Deliberately EXCLUDES `notes`. Notes are analyst commentary written by
    whoever curated the listing, and on 2026-09-03 they were silently inflating
    scores: a note speculating "they probably offer ABRET support" made the
    engine report "Trains you: abret" as though the posting had said it, and
    promoted the job to APPLY NOW. Only evidence from the posting may move
    the number. See test_notes_do_not_influence_score.
    """
    parts = [
        listing.get("title", ""),
        listing.get("company", ""),
        listing.get("location", ""),
        listing.get("salary_text", ""),
        listing.get("job_type", ""),
        listing.get("description", ""),
    ]
    return normalize(" ".join(str(p) for p in parts if p))


def years_required(text_norm):
    """Highest 'N years experience' figure the posting demands, or None.

    Only counts a number when 'experience' appears within ~40 characters,
    so '3 years of college' and '401k after 2 years' do not read as a
    requirement.
    """
    best = None
    for m in re.finditer(r"(\d+)\s*\+?\s*(?:to\s*\d+\s*)?years?", text_norm):
        window = text_norm[m.start():m.end() + 40]
        if "experience" in window or "exp " in window:
            n = int(m.group(1))
            if n <= 30 and (best is None or n > best):
                best = n
    return best


def parse_hourly(listing):
    """Best-effort hourly rate floor from structured fields or salary text.

    Returns (hourly_float_or_None, was_explicit_bool).
    """
    if listing.get("hourly_min") is not None:
        try:
            return float(listing["hourly_min"]), True
        except (TypeError, ValueError):
            pass

    text = str(listing.get("salary_text") or "")
    if not text:
        return None, False

    low = text.lower()
    nums = [float(n.replace(",", "")) for n in re.findall(r"\$?\s*([\d,]+(?:\.\d+)?)", text)]
    nums = [n for n in nums if n > 0]
    if not nums:
        return None, False

    lo = min(nums)
    if "hour" in low or "/hr" in low or " hr" in low:
        return lo, True
    if "year" in low or "annual" in low or "/yr" in low:
        return round(lo / 2080.0, 2), True
    # Bare numbers: guess by magnitude rather than refusing to answer.
    if lo > 1000:
        return round(lo / 2080.0, 2), True
    return lo, True


# --------------------------------------------------------------------------
# scoring
# --------------------------------------------------------------------------

def score_listing(listing, prefs, profile=None):
    """Return a detailed score dict for one listing.

    Structure:
        {score, band, band_action, disqualified, disqualify_reason,
         components: {name: {raw, weight, points, why}},
         penalties: [{name, points, why}],
         highlights: [str], concerns: [str]}
    """
    text = listing_text(listing)
    components = {}
    penalties = []
    highlights = []
    concerns = []

    # How much of the employer's own text do we actually have? A listing whose
    # description was never fetched cannot support a claim about what the
    # employer does or does not offer. Keep the two cases distinguishable so
    # the board never reports our own data gap as a finding about the job.
    desc_len = len(str(listing.get("description") or "").strip())
    data_quality = "full" if desc_len >= MIN_DESCRIPTION_CHARS else "thin"

    # ---- hard filters: these end the evaluation ----
    hf = prefs.get("hard_filters", {})

    if hf.get("must_be_paid", True):
        hit = any_phrase(text, hf.get("unpaid_markers", []))
        if hit:
            return _disqualified(listing, "Unpaid role (matched: %s). Stacey only takes paid work." % ", ".join(hit))

    hit = any_phrase(text, hf.get("scam_markers", []))
    if hit:
        return _disqualified(listing, "Scam / pay-to-work signals (matched: %s)." % ", ".join(hit))

    hit = any_phrase(text, hf.get("excluded_titles", []))
    title_norm = normalize(listing.get("title", ""))
    title_hit = [h for h in hit if contains_phrase(title_norm, h)]
    if title_hit:
        return _disqualified(listing, "Excluded role type in title (matched: %s)." % ", ".join(title_hit))

    # ---- registration gate ----
    # Stacey holds no ABRET registration, so a posting that demands one is a closed
    # door rather than a long shot. She asked for these to be excluded outright.
    # A posting that demands registration *and* offers training is still open, so
    # the training signals are checked before the door is shut.
    cred_cfg_early = hf.get("requires_credential_she_lacks", {})
    if hf.get("exclude_registration_required", False):
        cred_early = any_phrase(text, cred_cfg_early.get("credentials", []))
        if cred_early:
            ts_early = prefs.get("training_signals", {})
            if not any_phrase(text, ts_early.get("strong", [])):
                return _disqualified(
                    listing,
                    "Requires a registration/licence she does not hold (%s) and offers no "
                    "training. Excluded at her request." % cred_early[0])

    # ---- role tier (the biggest single factor) ----
    tiers = prefs.get("role_tiers", {})
    tier_order = ["tier_1_core", "tier_2_clinical_adjacent", "tier_3_bridge"]
    max_tier_weight = max((tiers.get(t, {}).get("weight", 0) for t in tier_order), default=1) or 1

    role_raw, role_why, matched_tier = 0.0, "No role-tier keywords matched.", None
    for tname in tier_order:
        tier = tiers.get(tname, {})
        matches = any_phrase(text, tier.get("keywords", []))
        if matches:
            matched_tier = tname
            role_raw = tier.get("weight", 0) / float(max_tier_weight)
            role_why = "%s (matched: %s)" % (tname, ", ".join(matches[:4]))
            break
    components["role_fit"] = _comp(role_raw, max_tier_weight, role_why)
    if matched_tier == "tier_1_core":
        highlights.append("Core neurodiagnostic role — this is the target, not a substitute for it.")
    elif matched_tier is None:
        concerns.append("Does not match any role tier. Probably noise.")

    # ---- training signals (the whole point: she needs to be trained) ----
    ts = prefs.get("training_signals", {})
    strong = any_phrase(text, ts.get("strong", []))
    moderate = any_phrase(text, ts.get("moderate", []))
    if strong:
        train_raw, train_why = 1.0, "Explicit training/entry signals: %s" % ", ".join(strong[:4])
        highlights.append("Trains you: \"%s\"." % strong[0])
    elif moderate:
        train_raw, train_why = 0.5, "Soft growth signals: %s" % ", ".join(moderate[:3])
    elif data_quality == "thin":
        train_raw = 0.15
        train_why = "Unknown — the full posting has not been pulled."
        concerns.append("Full posting text has not been pulled, so we do not yet know whether "
                        "they train. Open the link and check before ruling it out.")
    else:
        train_raw, train_why = 0.15, "No training or entry-level language found."
        concerns.append("Nothing in the posting says they will train an unlicensed hire.")
    components["training"] = _comp(train_raw, ts.get("weight", 30), train_why)

    # ---- location ----
    loc = prefs.get("location", {})
    mode = str(listing.get("remote") or "").lower().strip()
    loc_text = normalize("%s %s" % (listing.get("location", ""), mode))
    metros = any_phrase(loc_text, loc.get("preferred_metros", []))
    is_remote = mode == "remote" or contains_phrase(loc_text, "remote")
    is_hybrid = mode == "hybrid" or contains_phrase(loc_text, "hybrid")

    if is_remote and "remote" in loc.get("accepted_modes", []):
        loc_raw, loc_why = 1.0, "Remote — counts equal to local."
    elif metros:
        loc_raw = 1.0
        loc_why = "In her metro: %s%s" % (metros[0], " (hybrid)" if is_hybrid else "")
    elif contains_phrase(loc_text, loc.get("state", "fl").lower()) or contains_phrase(loc_text, "florida"):
        loc_raw, loc_why = 0.5, "In Florida but outside the Broward/Miami-Dade commute band."
        concerns.append("Location is in-state but likely a long commute.")
    else:
        loc_raw, loc_why = 0.0, "Outside her area and not remote."
        concerns.append("Not commutable and not remote.")
    components["location"] = _comp(loc_raw, loc.get("weight", 15), loc_why)

    # ---- freshness ----
    fr = prefs.get("freshness", {})
    days = listing.get("posted_days_ago")
    if days is None:
        fresh_raw, fresh_why = 0.5, "Posting age unknown."
    elif days <= fr.get("fresh_days", 7):
        fresh_raw, fresh_why = 1.0, "Posted %d day(s) ago." % days
    elif days <= fr.get("ok_days", 14):
        fresh_raw, fresh_why = 0.7, "Posted %d days ago — still live, apply soon." % days
    elif days <= fr.get("stale_days", 30):
        fresh_raw, fresh_why = 0.35, "Posted %d days ago — may already be filled." % days
        concerns.append("Over two weeks old.")
    else:
        fresh_raw, fresh_why = 0.1, "Posted %d days ago — probably stale." % days
        concerns.append("Stale posting (%d days)." % days)
    components["freshness"] = _comp(fresh_raw, fr.get("weight", 12), fresh_why)

    # ---- her actual differentiators ----
    diff = prefs.get("differentiators", {})
    assets = diff.get("assets", {})
    got, possible, names = 0.0, 0.0, []
    for key, cfg in assets.items():
        bonus = float(cfg.get("bonus", 0))
        possible += bonus
        if any_phrase(text, cfg.get("matches", [])):
            got += bonus
            names.append(key)
    diff_raw = (got / possible) if possible else 0.0
    components["differentiators"] = _comp(
        diff_raw, diff.get("weight", 12),
        ("Plays to: %s" % ", ".join(names)) if names else "None of her standout assets are asked for.")
    if "haitian_creole_advanced" in names:
        highlights.append("Posting values language skills — lead with advanced Haitian Creole.")
    if "psychiatric_exposure" in names:
        highlights.append("Psych/behavioral angle — lead with the Jackson Behavioral psychiatry rotation.")

    # ---- schedule ----
    sched = prefs.get("schedule", {})
    jt = str(listing.get("job_type") or "").lower().replace("-", "").replace(" ", "")
    accepted = [a.lower().replace("-", "").replace(" ", "") for a in sched.get("accepted", [])]
    if not jt:
        sched_raw, sched_why = 0.6, "Schedule not stated."
    elif jt in accepted:
        sched_raw, sched_why = 1.0, "%s — accepted." % jt
    else:
        sched_raw, sched_why = 0.0, "%s — outside her accepted schedules." % jt
        concerns.append("Schedule type '%s' is not one she wants." % jt)
    components["schedule"] = _comp(sched_raw, sched.get("weight", 10), sched_why)

    # ---- compensation (soft: never kills a training role) ----
    comp_cfg = prefs.get("compensation", {})
    hourly, explicit = parse_hourly(listing)
    target = comp_cfg.get("target_hourly_min", 18.0)
    floor = comp_cfg.get("acceptable_hourly_floor", 15.0)
    if hourly is None:
        pay_raw, pay_why = 0.5, "No pay listed."
    elif hourly >= target:
        pay_raw, pay_why = 1.0, "About $%.2f/hr — at or above target." % hourly
    elif hourly >= floor:
        pay_raw, pay_why = 0.6, "About $%.2f/hr — below the $%.0f target but livable." % (hourly, target)
    else:
        pay_raw, pay_why = 0.2, "About $%.2f/hr — below her floor." % hourly
        if matched_tier == "tier_1_core":
            concerns.append("Pay is low, but it is a Tier 1 training role. Flagged, not rejected.")
        else:
            concerns.append("Pay is below her floor of $%.0f/hr." % floor)
    components["compensation"] = _comp(pay_raw, comp_cfg.get("weight", 8), pay_why)

    # ---- known employers ----
    emp = prefs.get("employers_of_interest", {})
    emp_hits = any_phrase(normalize(listing.get("company", "")), emp.get("names", []))
    components["employer"] = _comp(
        1.0 if emp_hits else 0.0, emp.get("weight", 5),
        ("Known South Florida system: %s" % emp_hits[0]) if emp_hits
        else "Employer not on the watch list.")
    if emp_hits:
        highlights.append("%s is a system she already has a line into." % emp_hits[0].title())

    # ---- normalize to 0-100 ----
    total_weight = sum(c["weight"] for c in components.values()) or 1
    earned = sum(c["points"] for c in components.values())
    score = 100.0 * earned / total_weight

    # ---- penalties, applied after normalization ----
    cred_cfg = hf.get("requires_credential_she_lacks", {})
    cred_hits = any_phrase(text, cred_cfg.get("credentials", []))
    if cred_hits and not strong:
        pts = float(cred_cfg.get("penalty", 25))
        penalties.append({"name": "credential_required", "points": pts,
                          "why": "Requires %s with no training offered." % cred_hits[0]})
        concerns.append("Asks for a credential she does not hold (%s) and does not offer training."
                        % cred_hits[0])

    soft = prefs.get("deal_breakers_soft", {})
    pen_cfg = soft.get("penalties", {})

    yrs = years_required(text)
    tolerated = hf.get("min_years_experience_tolerated", 1)
    if yrs is not None and yrs > tolerated:
        pts = float(pen_cfg.get("requires_2_plus_years", 15))
        penalties.append({"name": "experience_gap", "points": pts,
                          "why": "Asks for %d years of experience; she has under %d." % (yrs, tolerated + 1)})
        concerns.append("Wants %d years of experience. Apply anyway if it is Tier 1 — postings overstate." % yrs)

    if not explicit:
        pts = float(pen_cfg.get("no_salary_listed", 3))
        penalties.append({"name": "no_salary", "points": pts, "why": "No pay range published."})

    staffing_hits = any_phrase(text, soft.get("staffing_markers", []))
    if staffing_hits:
        pts = float(pen_cfg.get("staffing_agency", 5))
        penalties.append({"name": "staffing_agency", "points": pts,
                          "why": "Agency/travel posting (matched: %s)." % staffing_hits[0]})

    if contains_phrase(text, "travel") and contains_phrase(text, "assignment"):
        pts = float(pen_cfg.get("travel_role", 10))
        penalties.append({"name": "travel_role", "points": pts, "why": "Travel assignment, not a local hire."})

    score = max(0.0, score - sum(p["points"] for p in penalties))
    band, action = band_for(score, prefs)

    return {
        "id": listing.get("id"),
        "score": round(score, 1),
        "band": band,
        "band_action": action,
        "tier": matched_tier,
        "data_quality": data_quality,
        "disqualified": False,
        "disqualify_reason": None,
        "components": components,
        "penalties": penalties,
        "highlights": highlights,
        "concerns": concerns,
    }


def _comp(raw, weight, why):
    raw = max(0.0, min(1.0, float(raw)))
    return {"raw": round(raw, 3), "weight": float(weight),
            "points": round(raw * float(weight), 2), "why": why}


def _disqualified(listing, reason):
    return {
        "id": listing.get("id"),
        "score": 0.0,
        "band": "SKIP",
        "band_action": "Disqualified.",
        "tier": None,
        "data_quality": "full" if len(str(listing.get("description") or "").strip()) >= MIN_DESCRIPTION_CHARS else "thin",
        "disqualified": True,
        "disqualify_reason": reason,
        "components": {},
        "penalties": [],
        "highlights": [],
        "concerns": [reason],
    }


def band_for(score, prefs):
    bands = prefs.get("scoring", {}).get("priority_bands", [])
    for b in sorted(bands, key=lambda x: -x.get("min_score", 0)):
        if score >= b.get("min_score", 0):
            return b.get("name", "?"), b.get("action", "")
    return "SKIP", "Not worth your time."


# --------------------------------------------------------------------------
# data io
# --------------------------------------------------------------------------

def load_json(path, default=None):
    if not os.path.exists(path):
        if default is not None:
            return default
        raise SystemExit("Missing required file: %s" % path)
    with open(path) as fh:
        return json.load(fh)


def load_all():
    prefs = load_json(PREFS_PATH)
    profile = load_json(PROFILE_PATH, {})
    listings = load_json(LISTINGS_PATH, {"listings": []})
    return prefs, profile, listings


def active_listings(listings, prefs):
    """Listings still worth showing: not archived, not closed, not rejected."""
    dead = {"closed", "rejected", "not_interested"}
    cutoff = prefs.get("application_tracking", {}).get("auto_archive_after_days", 45)
    out = []
    for l in listings.get("listings", []):
        if str(l.get("status", "new")).lower() in dead:
            continue
        days = l.get("posted_days_ago")
        if days is not None and days > cutoff:
            continue
        out.append(l)
    return out


def rank(listings, prefs, profile):
    scored = []
    for l in listings:
        s = score_listing(l, prefs, profile)
        scored.append((l, s))
    scored.sort(key=lambda pair: -pair[1]["score"])
    return scored


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

BAND_ICON = {
    "APPLY NOW": "🔴",
    "STRONG": "🟠",
    "WORTH A LOOK": "🟡",
    "BACKUP": "⚪",
    "SKIP": "⚫",
}


def render_board(prefs, profile, listings):
    active = active_listings(listings, prefs)
    scored = rank(active, prefs, profile)
    cap = prefs.get("scoring", {}).get("max_suggestions_per_run", 10)
    shown = [(l, s) for l, s in scored if not s["disqualified"]][:cap]

    today = date.today().isoformat()
    out = []
    out.append("# Stacey's Job Board")
    out.append("")
    out.append("_Generated %s by `board.py`. Do not hand-edit — edit `listings.json` and re-run._" % today)
    out.append("")
    out.append("**Goal:** %s" % prefs.get("north_star", ""))
    out.append("")

    if not shown:
        out.append("## Nothing on the board yet")
        out.append("")
        out.append("`listings.json` has no scoreable listings. Run a search and add them.")
        out.append("")
        return "\n".join(out)

    out.append("## Do these first")
    out.append("")

    # Top 3 get full detail; ADHD rule — depth where it matters, one line elsewhere.
    for i, (l, s) in enumerate(shown[:3], 1):
        icon = BAND_ICON.get(s["band"], "•")
        title = l.get("title", "Untitled")
        url = l.get("url")
        heading = "[%s](%s)" % (title, url) if url else title
        out.append("### %d. %s %s" % (i, icon, heading))
        out.append("")
        out.append("**%s** · %s · %s%s" % (l.get("company", "Unknown"),
                                           l.get("location", "?"),
                                           l.get("salary_text") or "pay not listed",
                                           "  \n_⚠ Full posting not yet pulled — scored on the "
                                           "title and metadata only._" if s["data_quality"] == "thin" else ""))
        out.append("")
        out.append("**Score %.0f/100 — %s.** %s" % (s["score"], s["band"], s["band_action"]))
        out.append("")
        if s["highlights"]:
            out.append("Why this one:")
            for h in s["highlights"]:
                out.append("- %s" % h)
            out.append("")
        if s["concerns"]:
            out.append("Watch out:")
            for c in s["concerns"]:
                out.append("- %s" % c)
            out.append("")

    if len(shown) > 3:
        out.append("## Then, if you have energy")
        out.append("")
        out.append("| | Role | Where | Score | Verdict |")
        out.append("|---|---|---|---|---|")
        for l, s in shown[3:]:
            icon = BAND_ICON.get(s["band"], "•")
            title = l.get("title", "Untitled")
            url = l.get("url")
            link = "[%s](%s)" % (title, url) if url else title
            out.append("| %s | %s | %s, %s | %.0f | %s%s |" % (
                icon, link, l.get("company", "?"), l.get("location", "?"),
                s["score"], s["band"], " ⚠" if s["data_quality"] == "thin" else ""))
        out.append("")

    skipped = [(l, s) for l, s in scored if s["disqualified"]]
    if skipped:
        out.append("## Filtered out (logged so they don't come back)")
        out.append("")
        for l, s in skipped:
            out.append("- **%s** at %s — %s" % (
                l.get("title", "?"), l.get("company", "?"), s["disqualify_reason"]))
        out.append("")

    out.append("---")
    out.append("")
    thin = len([1 for _, sc in shown if sc["data_quality"] == "thin"])
    out.append("_%d active listing(s) scored, %d shown, %d filtered out._"
               % (len(active), len(shown), len(skipped)))
    if thin:
        out.append("")
        out.append("_⚠ %d of the %d shown have not had their full posting text pulled yet, so their "
                   "training signals are unknown rather than absent. Open those links directly — a "
                   "\"we will train you\" line in the body would move them up sharply._" % (thin, len(shown)))
    out.append("")
    return "\n".join(out)


def explain(listing, s):
    lines = []
    lines.append("%s — %s" % (listing.get("title"), listing.get("company")))
    lines.append("=" * 70)
    if s["disqualified"]:
        lines.append("DISQUALIFIED: %s" % s["disqualify_reason"])
        return "\n".join(lines)
    lines.append("SCORE %.1f/100  [%s]  tier=%s" % (s["score"], s["band"], s["tier"]))
    lines.append("")
    lines.append("%-18s %6s %8s %8s  %s" % ("COMPONENT", "RAW", "WEIGHT", "POINTS", "WHY"))
    for name, c in sorted(s["components"].items(), key=lambda kv: -kv[1]["points"]):
        lines.append("%-18s %6.2f %8.0f %8.2f  %s" % (name, c["raw"], c["weight"], c["points"], c["why"]))
    tw = sum(c["weight"] for c in s["components"].values())
    tp = sum(c["points"] for c in s["components"].values())
    lines.append("%-18s %6s %8.0f %8.2f  -> %.1f/100 before penalties"
                 % ("TOTAL", "", tw, tp, 100.0 * tp / tw if tw else 0))
    if s["penalties"]:
        lines.append("")
        lines.append("PENALTIES")
        for p in s["penalties"]:
            lines.append("  -%-5.0f %s (%s)" % (p["points"], p["name"], p["why"]))
    return "\n".join(lines)


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

REQUIRED_LISTING_FIELDS = ["id", "title", "company"]


def check(prefs, profile, listings):
    """Data integrity pass. Returns a list of problem strings (empty == healthy)."""
    problems = []
    seen = set()
    valid_status = set(prefs.get("application_tracking", {}).get("statuses", []))
    valid_modes = set(prefs.get("location", {}).get("accepted_modes", [])) | {""}

    for i, l in enumerate(listings.get("listings", [])):
        where = "listing[%d] (%s)" % (i, l.get("id") or l.get("title") or "no id")
        for f in REQUIRED_LISTING_FIELDS:
            if not l.get(f):
                problems.append("%s: missing required field '%s'" % (where, f))
        lid = l.get("id")
        if lid in seen:
            problems.append("%s: duplicate id '%s'" % (where, lid))
        seen.add(lid)
        st = str(l.get("status", "new")).lower()
        if valid_status and st not in valid_status:
            problems.append("%s: status '%s' is not one of %s" % (where, st, sorted(valid_status)))
        mode = str(l.get("remote") or "").lower()
        if mode and mode not in valid_modes:
            problems.append("%s: remote mode '%s' is not one of %s" % (where, mode, sorted(valid_modes)))
        d = l.get("posted_days_ago")
        if d is not None and (not isinstance(d, int) or d < 0):
            problems.append("%s: posted_days_ago must be a non-negative int, got %r" % (where, d))
        if not l.get("url"):
            problems.append("%s: no url — Stacey cannot apply to a listing she cannot open" % where)

    for tier in ["tier_1_core", "tier_2_clinical_adjacent", "tier_3_bridge"]:
        if tier not in prefs.get("role_tiers", {}):
            problems.append("preferences.json: missing role tier '%s'" % tier)

    if not prefs.get("scoring", {}).get("priority_bands"):
        problems.append("preferences.json: no priority_bands defined; every score would fall through to SKIP")

    return problems


def log_debug(event, detail):
    """Append one line to debug.log. Used to judge whether a fix actually helped."""
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(DEBUG_LOG, "a") as fh:
        fh.write("[%s] %-18s %s\n" % (stamp, event, detail))


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------

def main(argv):
    cmd = argv[1] if len(argv) > 1 else "board"
    prefs, profile, listings = load_all()

    if cmd == "board":
        md = render_board(prefs, profile, listings)
        with open(BOARD_PATH, "w") as fh:
            fh.write(md)
        active = active_listings(listings, prefs)
        scored = rank(active, prefs, profile)
        kept = len([1 for _, s in scored if not s["disqualified"]])
        log_debug("board_generated", "%d active, %d scoreable, %d filtered"
                  % (len(active), kept, len(scored) - kept))
        print(md)
        return 0

    if cmd == "score":
        if len(argv) < 3:
            print("usage: board.py score <listing-id>", file=sys.stderr)
            return 2
        target = argv[2]
        for l in listings.get("listings", []):
            if str(l.get("id")) == target:
                print(explain(l, score_listing(l, prefs, profile)))
                return 0
        print("No listing with id '%s'" % target, file=sys.stderr)
        return 1

    if cmd == "check":
        problems = check(prefs, profile, listings)
        if problems:
            print("%d problem(s) found:" % len(problems))
            for p in problems:
                print("  - %s" % p)
            log_debug("check_failed", "%d problem(s)" % len(problems))
            return 1
        print("All checks passed. %d listing(s) validated."
              % len(listings.get("listings", [])))
        log_debug("check_passed", "%d listing(s)" % len(listings.get("listings", [])))
        return 0

    if cmd == "stats":
        active = active_listings(listings, prefs)
        scored = rank(active, prefs, profile)
        by_status, by_band = {}, {}
        for l in listings.get("listings", []):
            st = str(l.get("status", "new"))
            by_status[st] = by_status.get(st, 0) + 1
        for _, s in scored:
            by_band[s["band"]] = by_band.get(s["band"], 0) + 1
        print("Total listings: %d (%d active)" % (len(listings.get("listings", [])), len(active)))
        print("\nBy status:")
        for k in sorted(by_status):
            print("  %-16s %d" % (k, by_status[k]))
        print("\nBy priority band:")
        for k in ["APPLY NOW", "STRONG", "WORTH A LOOK", "BACKUP", "SKIP"]:
            if k in by_band:
                print("  %-16s %d" % (k, by_band[k]))
        return 0

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
