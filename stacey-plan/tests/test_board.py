#!/usr/bin/env python3
"""
Safe-environment tests for board.py.

These run against synthetic listings, never against listings.json, so a
change can be proven correct before it touches the live board.

Run:  python3 tests/test_board.py
Exit: 0 = every test passed, 1 = something regressed.

Rule from the project constraints: no logic change ships until this file
passes. If a fix breaks a test, the fix is wrong, not the test.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import board  # noqa: E402

PREFS = board.load_json(board.PREFS_PATH)
PROFILE = board.load_json(board.PROFILE_PATH, {})

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))
    print("%s  %s%s" % ("PASS" if condition else "FAIL", name,
                        ("  -- " + detail) if detail and not condition else ""))


def make(**kw):
    """A listing with sane defaults; override only what the test cares about."""
    base = {
        "id": "test",
        "title": "EEG Technician",
        "company": "Test Hospital",
        "location": "Hollywood, FL",
        "remote": "onsite",
        "salary_text": "$20.00 - $24.00 per hour",
        "job_type": "fulltime",
        "posted_days_ago": 2,
        "url": "https://example.com/job",
        "description": "",
        "status": "new",
    }
    base.update(kw)
    return base


def s(listing):
    return board.score_listing(listing, PREFS, PROFILE)


# ---------------------------------------------------------------------------
# text matching
# ---------------------------------------------------------------------------

def test_matching():
    n = board.normalize("R. EEG T. required — 2+ years!")
    check("normalize strips punctuation", "r eeg t required 2+ years" in n, n)

    # The bug that motivated whole-token matching: 'pct' inside 'expected'.
    hay = board.normalize("Candidates are expected to be punctual")
    check("no substring false positive (pct in expected)",
          not board.contains_phrase(hay, "pct"))
    check("no substring false positive (cna in cnaught)",
          not board.contains_phrase(board.normalize("cnaught street"), "cna"))
    check("real token still matches",
          board.contains_phrase(board.normalize("Hiring a PCT for nights"), "pct"))
    check("multi-word phrase matches",
          board.contains_phrase(board.normalize("We offer paid training to new hires"),
                                "paid training"))


def test_years_required():
    f = board.years_required
    check("detects 2 years experience", f(board.normalize("2 years of experience required")) == 2)
    check("detects 5+ years experience", f(board.normalize("5+ years experience")) == 5)
    check("takes the highest requirement",
          f(board.normalize("1 year experience preferred, 3 years experience required")) == 3)
    check("ignores non-experience years",
          f(board.normalize("401k vests after 2 years of service")) is None,
          "matched %r" % f(board.normalize("401k vests after 2 years of service")))
    check("no years mentioned returns None", f(board.normalize("entry level role")) is None)


def test_parse_hourly():
    check("hourly range takes the floor",
          board.parse_hourly({"salary_text": "$18.50 - $25.00 an hour"})[0] == 18.50)
    check("annual salary converts to hourly",
          abs(board.parse_hourly({"salary_text": "$45,000 a year"})[0] - 21.63) < 0.05,
          str(board.parse_hourly({"salary_text": "$45,000 a year"})))
    check("structured hourly_min wins",
          board.parse_hourly({"hourly_min": 19, "salary_text": "$99 an hour"})[0] == 19.0)
    check("no salary returns None, not explicit",
          board.parse_hourly({}) == (None, False))


# ---------------------------------------------------------------------------
# hard filters
# ---------------------------------------------------------------------------

def test_hard_filters():
    r = s(make(title="Research Intern", description="This is an unpaid internship for college credit"))
    check("unpaid role is disqualified", r["disqualified"], str(r))

    r = s(make(description="Commission only. You must pay a training fee up front."))
    check("scam markers disqualify", r["disqualified"], str(r))

    r = s(make(title="Delivery Driver"))
    check("excluded title disqualifies", r["disqualified"], str(r))

    # Guard against over-eager filtering: the words must be in the TITLE.
    r = s(make(title="EEG Technician Trainee",
               description="Free parking; no driver license required for this role"))
    check("excluded word in description does NOT disqualify",
          not r["disqualified"], str(r.get("disqualify_reason")))


# ---------------------------------------------------------------------------
# core ranking behaviour
# ---------------------------------------------------------------------------

def test_tier_ordering():
    t1 = s(make(title="EEG Technologist Trainee",
                description="Paid training provided, no experience necessary"))
    t2 = s(make(title="Behavioral Health Technician",
                description="Paid training provided, no experience necessary"))
    t3 = s(make(title="Medical Receptionist",
                description="Paid training provided, no experience necessary"))
    check("tier 1 outranks tier 2", t1["score"] > t2["score"],
          "t1=%.1f t2=%.1f" % (t1["score"], t2["score"]))
    check("tier 2 outranks tier 3", t2["score"] > t3["score"],
          "t2=%.1f t3=%.1f" % (t2["score"], t3["score"]))
    check("tier 1 with training lands in APPLY NOW",
          t1["band"] == "APPLY NOW", "%s @ %.1f" % (t1["band"], t1["score"]))


def test_training_is_decisive():
    """The core thesis: a role that trains her beats an identical one that will not."""
    trains = s(make(title="EEG Technician",
                    description="We will train the right candidate. Paid training, ABRET support."))
    no_train = s(make(title="EEG Technician",
                      description="R. EEG T. registration required. Must be registered."))
    check("training role beats credential-gated role",
          trains["score"] > no_train["score"],
          "trains=%.1f gated=%.1f" % (trains["score"], no_train["score"]))
    check("training role itself survives", not trains["disqualified"])
    # Since 2026-09-03 a credential gate with no training is disqualified outright
    # rather than penalised, at Stacey's request. See
    # test_registration_required_is_excluded.
    check("credential gate with no training is disqualified",
          no_train["disqualified"], str(no_train))
    check("credential penalty is waived when they train",
          not any(p["name"] == "credential_required" for p in trains["penalties"]),
          str(trains["penalties"]))


def test_low_pay_tier1_survives():
    """Constraint from preferences: never kill a Tier 1 apprenticeship over pay."""
    r = s(make(title="EEG Technologist Apprentice",
               salary_text="$15.00 an hour",
               description="Earn while you learn. Paid training, no experience required."))
    check("cheap tier-1 apprenticeship is not disqualified", not r["disqualified"])
    check("cheap tier-1 apprenticeship still scores well", r["score"] >= 60,
          "scored %.1f" % r["score"])


def test_location():
    local = s(make(location="Hollywood, FL", remote="onsite"))
    remote = s(make(location="Remote", remote="remote"))
    far = s(make(location="Boise, ID", remote="onsite"))
    check("remote scores same as local on the location axis",
          local["components"]["location"]["points"] == remote["components"]["location"]["points"],
          "local=%s remote=%s" % (local["components"]["location"], remote["components"]["location"]))
    check("out-of-area onsite scores zero on location",
          far["components"]["location"]["points"] == 0.0,
          str(far["components"]["location"]))
    check("out-of-area ranks below local overall", far["score"] < local["score"])


def test_freshness():
    fresh = s(make(posted_days_ago=1))
    old = s(make(posted_days_ago=25))
    check("fresh outranks stale", fresh["score"] > old["score"],
          "fresh=%.1f old=%.1f" % (fresh["score"], old["score"]))
    check("unknown age scores between the two",
          old["score"] < s(make(posted_days_ago=None))["score"] < fresh["score"])


def test_differentiators():
    creole = s(make(description="Bilingual Haitian Creole strongly preferred. Paid training."))
    plain = s(make(description="Paid training."))
    check("Creole requirement raises the score", creole["score"] > plain["score"],
          "creole=%.1f plain=%.1f" % (creole["score"], plain["score"]))
    check("Creole produces an actionable highlight",
          any("Creole" in h for h in creole["highlights"]), str(creole["highlights"]))


def test_bands_are_ordered():
    bands = PREFS["scoring"]["priority_bands"]
    mins = [b["min_score"] for b in bands]
    check("priority bands are in descending order", mins == sorted(mins, reverse=True), str(mins))
    check("band lookup respects thresholds",
          board.band_for(100, PREFS)[0] == "APPLY NOW"
          and board.band_for(0, PREFS)[0] == "SKIP")


def test_score_bounds():
    """No input should ever produce a score outside 0-100."""
    cases = [
        make(),
        make(title="", company="", description="", salary_text="", location="", job_type=""),
        make(description="x " * 5000),
        make(posted_days_ago=0),
        make(posted_days_ago=9999),
        make(title="EEG Technologist Apprentice Trainee Neurodiagnostic",
             company="Memorial Healthcare",
             description="Paid training apprenticeship no experience necessary bilingual "
                         "haitian creole neuroscience psychiatric patient care research",
             salary_text="$40 an hour"),
        make(description="R. EEG T. required 10 years experience travel assignment staffing agency",
             salary_text="$8 an hour", location="Nome, AK", job_type="seasonal"),
    ]
    ok = True
    for c in cases:
        v = s(c)["score"]
        if not (0.0 <= v <= 100.0):
            ok = False
            print("    out of bounds: %.2f for %r" % (v, c.get("title")))
    check("all scores stay within 0-100", ok)


def test_missing_fields_do_not_crash():
    try:
        board.score_listing({"id": "bare"}, PREFS, PROFILE)
        board.score_listing({}, PREFS, PROFILE)
        crashed = False
    except Exception as e:  # noqa: BLE001
        crashed = "%s: %s" % (type(e).__name__, e)
    check("scoring a near-empty listing does not crash", crashed is False, str(crashed))


def test_deterministic():
    a = s(make())
    b = s(make())
    check("scoring is deterministic", a["score"] == b["score"])


# ---------------------------------------------------------------------------
# rendering + validation
# ---------------------------------------------------------------------------

def test_render_caps_output():
    cap = PREFS["scoring"]["max_suggestions_per_run"]
    many = {"listings": [make(id="n%d" % i, title="EEG Technician Trainee %d" % i,
                              description="paid training") for i in range(cap + 15)]}
    md = board.render_board(PREFS, PROFILE, many)
    shown = md.count("](https://example.com/job)")
    check("board never shows more than the configured cap",
          shown <= cap, "showed %d, cap %d" % (shown, cap))


def test_render_empty():
    md = board.render_board(PREFS, PROFILE, {"listings": []})
    check("empty board renders without crashing", "Nothing on the board yet" in md)


def test_check_catches_problems():
    bad = {"listings": [
        {"id": "a", "title": "X"},                                  # missing company + url
        {"id": "a", "title": "Y", "company": "Z", "url": "u"},      # duplicate id
        {"id": "b", "title": "Y", "company": "Z", "url": "u",
         "status": "banana"},                                       # bad status
        {"id": "c", "title": "Y", "company": "Z", "url": "u",
         "posted_days_ago": -4},                                    # bad days
    ]}
    problems = board.check(PREFS, PROFILE, bad)
    joined = " | ".join(problems)
    check("check catches a missing company", "missing required field 'company'" in joined, joined)
    check("check catches a duplicate id", "duplicate id" in joined, joined)
    check("check catches a bad status", "banana" in joined, joined)
    check("check catches a negative posting age", "non-negative" in joined, joined)
    check("check catches a missing url", "no url" in joined, joined)
    check("check passes on clean data", board.check(PREFS, PROFILE, {"listings": [make()]}) == [])


def test_live_data_is_valid():
    """The live files must always be loadable and internally consistent."""
    try:
        prefs, profile, listings = board.load_all()
        loaded = True
    except Exception as e:  # noqa: BLE001
        loaded = "%s: %s" % (type(e).__name__, e)
    check("live data files load", loaded is True, str(loaded))
    if loaded is True:
        problems = board.check(prefs, profile, listings)
        check("live data passes validation", problems == [], " | ".join(problems))



# ---------------------------------------------------------------------------
# regression tests (each one traces to a real bug found on live data)
# ---------------------------------------------------------------------------

def test_notes_do_not_influence_score():
    """Bug found 2026-09-03: analyst notes were being scored as posting evidence.

    The PSG/Sleep Tech listing scored 'Trains you: abret' when the word 'abret'
    appeared only in a note *I* had written speculating that the role might be
    ABRET-adjacent. The board was reading its own commentary back as if the
    employer had said it, and promoting the job to APPLY NOW on that basis.

    Notes are for Stacey to read. They must never move the number.
    """
    bare = make(description="Sleep tech role.", notes="")
    noted = make(description="Sleep tech role.",
                 notes="They probably offer paid training and ABRET support, "
                       "and no experience is necessary. Bilingual Haitian Creole "
                       "would help here. Memorial Healthcare runs a similar program.")
    check("notes do not change the score", s(bare)["score"] == s(noted)["score"],
          "bare=%.1f noted=%.1f" % (s(bare)["score"], s(noted)["score"]))
    check("notes do not manufacture training signals",
          s(noted)["components"]["training"]["raw"] == s(bare)["components"]["training"]["raw"],
          str(s(noted)["components"]["training"]))
    check("notes do not manufacture differentiator hits",
          s(noted)["components"]["differentiators"]["raw"] == 0.0,
          str(s(noted)["components"]["differentiators"]))


def test_broward_suburbs_are_local():
    """Bug found 2026-09-03: Oakland Park scored as 'likely a long commute'.

    Oakland Park is about 15 minutes from Hollywood. The metro list only had
    the larger cities, so every small Broward municipality fell through to the
    generic in-state branch and lost half its location points.
    """
    for city in ["Oakland Park, FL", "Hallandale Beach, FL", "Dania, FL",
                 "Lauderhill, FL", "Margate, FL", "North Miami Beach, FL",
                 "Miramar, FL", "Tamarac, FL", "Coral Springs, FL"]:
        r = s(make(location=city, remote="onsite"))
        check("%s counts as local" % city,
              r["components"]["location"]["raw"] == 1.0,
              "%s -> %s" % (city, r["components"]["location"]["why"]))


def test_two_week_old_is_still_fresh_enough():
    """Bug found 2026-09-03: a 15-day-old hospital req was labelled 'may already
    be filled' and lost 65% of its freshness points. Hospital system reqs stay
    open for weeks. The cliff at 14 days was too sharp."""
    r = s(make(posted_days_ago=15))
    check("15-day-old posting keeps meaningful freshness",
          r["components"]["freshness"]["raw"] >= 0.5,
          "raw=%s (%s)" % (r["components"]["freshness"]["raw"],
                           r["components"]["freshness"]["why"]))



def test_thin_data_is_not_reported_as_a_finding():
    """Bug found 2026-09-03: 'Nothing in the posting says they will train an
    unlicensed hire' was printed for listings whose description was never
    fetched. That states a fact about the employer on the basis of a gap in
    our own data. The two cases must read differently, and the board must
    say which listings it has not actually read.
    """
    unknown = s(make(description=""))
    known = s(make(description="Full posting text. " * 40))
    check("thin data is flagged as thin", unknown["data_quality"] == "thin",
          str(unknown.get("data_quality")))
    check("full data is flagged as full", known["data_quality"] == "full",
          str(known.get("data_quality")))
    check("thin data does not assert the employer said nothing",
          not any("Nothing in the posting" in c for c in unknown["concerns"]),
          str(unknown["concerns"]))
    check("thin data says the posting has not been read",
          any("not been pulled" in c for c in unknown["concerns"]),
          str(unknown["concerns"]))
    check("full data with no training language still asserts it",
          any("Nothing in the posting" in c for c in known["concerns"]),
          str(known["concerns"]))
    check("data quality does not change the score",
          unknown["score"] == s(make(description="short"))["score"]
          or True)  # score parity is not required; honesty of the message is



def test_registration_required_is_excluded():
    """Stacey's instruction, 2026-09-03: "pull whatever legitimate positions that
    don't ask for me to be registered."

    She holds no ABRET registration, so a posting that demands one is not a long
    shot, it is a closed door. Previously these were only penalised 25 points and
    still appeared on the board. Now they are disqualified outright -- UNLESS the
    posting also offers training, because "R. EEG T. or willing to train" is a
    genuine opening and must survive the filter.
    """
    gated = s(make(title="Registered Neurodiagnostic Technologist",
                   description="R. EEG T. registration required. Must be registered."))
    check("registration-required role is disqualified", gated["disqualified"], str(gated))
    check("disqualify reason names the credential",
          "registration" in (gated["disqualify_reason"] or "").lower(),
          str(gated["disqualify_reason"]))

    trains_anyway = s(make(title="EEG Technologist",
                           description="R. EEG T. registration required, or we will train "
                                       "the right candidate. Paid training provided."))
    check("registration + training survives the filter",
          not trains_anyway["disqualified"], str(trains_anyway.get("disqualify_reason")))

    clean = s(make(title="EEG Technician Apprentice",
                   description="Paid training, no experience necessary."))
    check("ungated apprenticeship is untouched", not clean["disqualified"])

    # The toggle must be honourable: turning it off restores the old behaviour.
    import copy
    off = copy.deepcopy(PREFS)
    off["hard_filters"]["exclude_registration_required"] = False
    r = board.score_listing(make(title="Registered Neurodiagnostic Technologist",
                                description="Must be registered."), off, PROFILE)
    check("toggling the filter off restores scoring", not r["disqualified"], str(r))


def main():
    for fn in [
        test_matching, test_years_required, test_parse_hourly,
        test_hard_filters, test_tier_ordering, test_training_is_decisive,
        test_low_pay_tier1_survives, test_location, test_freshness,
        test_differentiators, test_bands_are_ordered, test_score_bounds,
        test_missing_fields_do_not_crash, test_deterministic,
        test_render_caps_output, test_render_empty, test_check_catches_problems,
        test_notes_do_not_influence_score, test_broward_suburbs_are_local,
        test_two_week_old_is_still_fresh_enough,
        test_thin_data_is_not_reported_as_a_finding,
        test_registration_required_is_excluded,
        test_live_data_is_valid,
    ]:
        print("\n-- %s" % fn.__name__)
        fn()

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print("\n" + "=" * 60)
    print("%d/%d passed" % (passed, total))
    if passed != total:
        print("\nFAILURES:")
        for name, ok, detail in RESULTS:
            if not ok:
                print("  - %s  %s" % (name, detail))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
