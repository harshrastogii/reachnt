"""Checks on the rules that matter: urgency never sees distance or cost, the reader escalates danger,
the planner respects crew hours and road access, explanations stay readable and truthful."""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from reachnt import evaluate, explain, intake, planner, simulate, synth, urgency  # noqa: E402
from reachnt.config import params, taxonomy  # noqa: E402


# ---------------------------------------------------------------- urgency is need-only
def test_urgency_signature_has_no_place_or_cost_inputs():
    args = set(inspect.signature(urgency.score).parameters)
    assert args <= {"hazard", "modifiers", "days_waited", "clock"}
    banned = ["distance", "km", "cost", "hub", "community", "remote", "band", "lat", "lon", "indigenous", "travel",
              # the inclusive model: how, when and in what language a report arrived never sets its place in line
              "channel", "language", "english", "interpreter", "submitted", "form", "app", "phone", "logged"]
    src = inspect.getsource(urgency.score)
    for word in banned:
        assert word not in src.lower(), f"urgency.score mentions '{word}'"


def test_same_report_same_score_anywhere():
    a = urgency.score("hot_water", {"vulnerable": 1}, 3.0, 2.8)
    b = urgency.score("hot_water", {"vulnerable": 1}, 3.0, 2.8)
    assert a.total == b.total


def test_category_order():
    imm = urgency.score("electrical_danger", {}).total
    urg = urgency.score("hot_water", {}).total
    rou = urgency.score("pests", {}).total
    assert imm > urg > rou


def test_ageing_moves_routine_up_eventually():
    fresh = urgency.score("pests", {}, 0, 14).total
    old = urgency.score("pests", {}, 180, 14).total   # half a year
    assert old > urgency.score("hot_water", {}, 0, 2.8).total > fresh


def test_equal_clock_has_no_remote_allowance_official_does():
    assert urgency.clock_days("urgent", True, "equal") == urgency.clock_days("urgent", False, "equal")
    assert urgency.clock_days("urgent", True, "official") > urgency.clock_days("urgent", False, "official")
    # FS17: 2 vs 5 and 10 vs 25 business days
    assert urgency.clock_days("urgent", True, "official") == pytest.approx(5 * 7 / 5)
    assert urgency.clock_days("routine", True, "official") == pytest.approx(25 * 7 / 5)


# ---------------------------------------------------------------- inclusive intake: saying less costs no points
def test_short_and_full_tellings_score_the_same_once_the_questions_are_asked():
    full = intake.modifier_hits("toilet blocked, my nana lives here, 9 of us living here, this is the third time")
    short = intake.modifier_hits("toilet blocked pls come")
    answers = dict(young_child="no", elder="yes", health="no", before="yes", danger_now="no")
    record, history = dict(people=9, bedrooms=3), dict(same_fault_open_or_recent=True)
    a, _, _ = intake.household(full, answers, record, history)
    b, src, unanswered = intake.household(short, answers, record, history)
    assert urgency.score("toilet_blocked", a).total == urgency.score("toilet_blocked", b).total
    assert urgency.score("toilet_blocked", b).total > urgency.score("toilet_blocked", short).total
    assert src["crowded"] == ["record"] and "history" in src["repeat"] and unanswered == []


def test_an_unknown_answer_never_lowers_a_score():
    words = intake.modifier_hits("no hot water for the baby")
    known, _, _ = intake.household(words, dict(young_child="no"))
    unknown, _, unanswered = intake.household(words, dict(young_child="unknown"))
    assert known == unknown == {"vulnerable": 1}               # the words still count; "no" or "unknown" takes nothing away
    assert "young_child" in unanswered                          # and an unanswered question asks for a call-back


def test_inclusion_measure_shows_the_gap_closing():
    r = evaluate.inclusion(n=400)
    assert r["words"]["gap_mean"] > 10 > r["intake"]["gap_mean"]
    assert r["intake"]["vulnerable_recognised_short"] > 0.8 > r["words"]["vulnerable_recognised_short"]


# ---------------------------------------------------------------- time left raises priority; a missed visit keeps its clock
def test_priority_rises_as_the_clock_runs_out():
    job = dict(hazard="hot_water", category="urgent", vulnerable=False, crowded=False, repeat=False, day=0,
               clock_equal=2.8, clock_official=7.0)
    pol = simulate.Policy("guarantee", 0.2)
    early = simulate.job_value(dict(job, day=0, clock_equal=30, clock_official=30), pol, 1)   # plenty of time left
    late = simulate.job_value(job, pol, 2)                                                    # clock ends within the week
    assert late - early >= params()["planning"]["deadline_bonus"] + params()["planning"]["floor_bonus"]


def test_a_missed_visit_keeps_its_clock_and_goes_back_in_the_plan():
    req = simulate.prepare_requests()
    small = req[(req.hub == "Tennant Creek") & (req.week < 10)].copy()
    res = simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=0, miss_share=0.3).jobs
    hit = res[res.reason_counts.map(lambda c: c.get("no_access", 0) > 0)]
    assert len(hit) > 0
    later = hit[~hit.open_at_end]
    assert (later.wait_days == later.done_day - later.day).all()           # waiting counts from the first report
    assert later.reason_log.map(lambda log: any(x[1] == "no_access" for x in log)).all()


def test_a_fix_that_did_not_hold_comes_back_ahead_and_keeps_its_first_day():
    fresh = urgency.score("toilet_blocked", {}, 0, 2.8)
    rework = urgency.score("toilet_blocked", {"rework": 1}, 0, 2.8)
    assert rework.total - fresh.total == params()["triage"]["rework_points"]
    # reopened, it keeps the day it was first reported: its clock has run out, so the planner boosts it
    job = dict(hazard="toilet_blocked", category="urgent", vulnerable=False, crowded=False, repeat=False, day=0, clock_equal=2.8, clock_official=7.0)
    assert simulate.job_value(job, simulate.Policy("guarantee", 0.2), 21) > simulate.job_value(dict(job, day=20), simulate.Policy("guarantee", 0.2), 21) - 1


def test_trades_going_to_the_same_place_share_one_vehicle():
    o = lambda site, cost, mode="road": planner.TripOption(site, True, mode, 6, cost, True)
    rows = simulate.joint_trips(3, "Katherine", {"plumber": {"C1": o("C1", 400)}, "electrician": {"C1": o("C1", 400), "C2": o("C2", 300)},
                                                 "carpenter": {"C9": o("C9", 500)}})
    assert len(rows) == 1 and rows[0]["trip"] == "C1" and rows[0]["saving"] == 400 and rows[0]["trades"] == ["electrician", "plumber"]
    seats = simulate.SEATS["road"]
    many = simulate.joint_trips(3, "K", {f"t{i}": {"C1": o("C1", 100)} for i in range(seats + 1)})
    assert many[0]["vehicles"] == 2 and many[0]["saving"] == 100 * (seats - 1)   # a ute takes only so many


def test_a_flood_adds_jobs_only_in_the_hit_communities_and_cuts_their_roads():
    from reachnt import experiments
    ev = experiments.event_requests()
    D = params()["disaster"]
    assert set(ev.site) <= set(D["communities"]) and ev.event.all() and len(ev) > 0
    small = simulate.prepare_requests()
    small = small[(small.hub == "Katherine") & (small.week >= D["week"] - 1) & (small.week < D["week"] + 2)]
    res = simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=0,
                       closed={cid: (0, 999) for cid in D["communities"]})
    roads = res.jobs[res.jobs.site.isin(D["communities"]) & res.jobs.done_mode.str.startswith("road")]
    assert roads.empty                                                  # nothing reaches them by road while it is cut


# ---------------------------------------------------------------- reader
@pytest.fixture(scope="module")
def clf():
    tr = synth.labelled_corpus(40, "train", 1)
    return intake.Classifier().fit(tr.text, tr.hazard)


@pytest.mark.parametrize("text,hazard", [
    ("power point sparking in the kitchen", "electrical_danger"),
    ("smell gas near the stove", "gas_leak"),
    ("sewage coming up in the yard", "sewage_overflow"),
    ("no hot water for the kids", "hot_water"),
    ("cockroaches everywhere", "pests"),
])
def test_rules_read_plain_reports(text, hazard, clf):
    assert intake.read(text, clf).hazard == hazard


def test_danger_word_sends_to_person(clf):
    r = intake.read("black marks and melting on the power point", clf)
    assert r.hazard == "electrical_danger" or r.needs_human


def test_unreadable_goes_to_person(clf):
    assert intake.read("pls come", clf).needs_human


def test_patterns_compile_in_javascript_style():
    # the web prototype reuses the same patterns: no Python-only syntax
    for h in taxonomy()["hazards"].values():
        for p in h["patterns"]:
            assert "(?P<" not in p and "(?<" not in p


# ---------------------------------------------------------------- planner
def _opt(site, hours, cost, reachable=True, mode="road"):
    return planner.TripOption(site, reachable, mode, hours, cost, hours > 4)


def test_planner_respects_capacity_and_access():
    jobs = [dict(job_id=f"t{i}", site="TOWN", hours=2, value=500) for i in range(10)]
    jobs += [dict(job_id=f"r{i}", site="C01", hours=2, value=1500) for i in range(3)]
    jobs += [dict(job_id=f"x{i}", site="C02", hours=2, value=5000) for i in range(3)]
    opts = {"C01": _opt("C01", 8, 1000), "C02": _opt("C02", 0, 0, reachable=False, mode="cut")}
    res = planner.plan_week(jobs, opts, capacity_hours=20, lam=0.0)
    used = sum(2 for _ in res.done) + sum(o.travel_hours for o in res.trips.values())
    assert used <= 20 + 1e-6
    assert not any(j.startswith("x") for j in res.done)       # cut community is never planned
    assert all(f"r{i}" in res.done for i in range(3))           # high-need remote jobs beat low-need town jobs at lam 0


def test_cost_weight_pushes_remote_back():
    jobs = [dict(job_id=f"t{i}", site="TOWN", hours=2, value=500) for i in range(10)]
    jobs += [dict(job_id=f"r{i}", site="C01", hours=2, value=900) for i in range(3)]
    opts = {"C01": _opt("C01", 8, 3000)}
    cheap = planner.plan_week(jobs, opts, 30, lam=1.0)
    need = planner.plan_week(jobs, opts, 30, lam=0.0)
    assert not any(j.startswith("r") for j in cheap.done)
    assert any(j.startswith("r") for j in need.done)


def test_cost_calibration_matches_nous_range():
    """A lone emergency job in a very remote community should be mostly travel (Nous 2017: up to 96%)."""
    o = planner.TripOption("C", True, "road", 15.0, 2400.0, True)
    share = planner.single_job_cost(o, 2.5)["travel_share"]
    assert 0.85 <= share <= 0.98


# ---------------------------------------------------------------- explanations
def _job(**kw):
    base = dict(hazard="hot_water", category="urgent", trade="plumber", remote=True, text="no hot water", needs_human=False,
                wait_days=20.0, open_at_end=False, done_day=40.0, day=20, hub="Katherine", vulnerable=True, crowded=False, repeat=False,
                reason_log=[[1, "travel_cost", 1900, "road"], [2, "crew_full", 1900, "road"]])
    base.update(kw)
    return base


def test_explanation_names_cost_decision_and_who_signed():
    led = dict(policy="floor", role="regional maintenance coordinator", date="6 Oct 2026")
    ex = explain.tenant_explanation(_job(), "Ngukurr", led)
    text = " ".join(s for _, s in ex["sections"])
    assert "cost decision" in text and "6 Oct 2026" in text and "$1,900" in text
    assert "Distance and cost are never part of this score" in ex["score_text"]


def test_explanation_is_plain_english():
    led = dict(policy="need", role="coordinator", date="6 Oct 2026")
    ex = explain.tenant_explanation(_job(), "Ngukurr", led, rank=(3, 20))
    for title, body in ex["sections"]:
        if title in ("What we heard",):
            continue
        assert explain.flesch_reading_ease(body) >= 50, (title, body)
    assert len(ex["short"]) <= 200


# ---------------------------------------------------------------- H3
def test_run_pairs_are_within_two_rings_and_same_hub():
    import h3
    from reachnt import geo
    com = geo.load_communities()
    pairs = geo.run_pairs(com)
    c = com.set_index("cid")
    assert len(pairs) > 0
    for p in pairs.itertuples():
        assert c.loc[p.a, "hub"] == c.loc[p.b, "hub"]
        assert h3.grid_distance(c.loc[p.a, "h3_r4"], c.loc[p.b, "h3_r4"]) <= params()["h3"]["run_k"]


def test_house_cell_is_stable_and_near_the_community():
    import h3
    from reachnt import geo
    a = geo.house_cell("C43", 12, (-14.73, 134.73), False)
    b = geo.house_cell("C43", 12, (-14.73, 134.73), False)
    assert a == b and h3.get_resolution(a) == params()["h3"]["house_res"]
    centre = h3.latlng_to_cell(-14.73, 134.73, params()["h3"]["house_res"])
    assert h3.grid_distance(a, centre) <= params()["h3"]["house_ring_k"]


def test_planner_uses_a_run_zone_when_it_is_cheaper_than_two_trips():
    jobs = [dict(job_id=f"a{i}", site="CA", hours=2, value=900) for i in range(3)]
    jobs += [dict(job_id=f"b{i}", site="CB", hours=2, value=900) for i in range(3)]
    opts = {"CA": _opt("CA", 10, 2000), "CB": _opt("CB", 10, 2000)}
    run = planner.TripOption("CA+CB", True, "road-run", 11, 2200, True)
    res = planner.plan_week(jobs, opts, capacity_hours=24, lam=0.2, runs={"CA+CB": (run, ("CA", "CB"))})
    assert len(res.done) == 6
    assert res.trips["CA"].site == "CA+CB" and res.trips["CB"].site == "CA+CB"


def test_small_plan_is_proved_optimal():
    jobs = [dict(job_id=f"t{i}", site="TOWN", hours=2, value=500) for i in range(6)]
    jobs += [dict(job_id=f"r{i}", site="C01", hours=2, value=1500) for i in range(3)]
    res = planner.plan_week(jobs, {"C01": _opt("C01", 8, 1000)}, capacity_hours=20, lam=0.2)
    assert res.optimal and res.gap == 0.0


def test_calibration_error_is_zero_when_confidence_matches_accuracy():
    conf = np.array([0.8] * 10)
    right = np.array([1] * 8 + [0] * 2, dtype=float)
    ece, curve = evaluate._ece(conf, right)
    assert ece == pytest.approx(0.0) and curve[0][2] == 10
    assert evaluate._ece(np.array([0.9] * 10), np.zeros(10))[0] == pytest.approx(0.9)


def test_reader_names_no_confidence_percentage(clf):
    r = intake.read("the thingy in the yard is making a funny noise", clf)
    assert not any("%" in s for s in r.reasons)
