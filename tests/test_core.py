"""Checks on the rules that matter: urgency never sees distance or cost, the reader escalates danger,
the planner respects crew hours and road access, explanations stay readable and truthful."""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import numpy as np
import pandas as pd
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
    full = intake.modifier_hits("toilet blocked, the kids are sick, 9 of us living here, this is the third time")
    short = intake.modifier_hits("toilet blocked pls come")
    answers = dict(life_support="no", baby_elder="no", child_mobility="yes", before="yes", danger_now="no")
    record, history = dict(people=9, bedrooms=3), dict(same_fault_open_or_recent=True)
    a, _, _ = intake.household(full, answers, record, history)
    b, src, unanswered = intake.household(short, answers, record, history)
    assert urgency.score("toilet_blocked", a).total == urgency.score("toilet_blocked", b).total
    assert urgency.score("toilet_blocked", b).total > urgency.score("toilet_blocked", short).total
    assert src["crowded"] == ["record"] and "history" in src["repeat"] and unanswered == []


def test_an_unknown_answer_never_lowers_a_score():
    words = intake.modifier_hits("no hot water, the kids are sick")
    known, _, _ = intake.household(words, dict(child_mobility="no"))
    unknown, _, unanswered = intake.household(words, dict(child_mobility="unknown"))
    assert known == unknown == {"vulnerable": 1}               # the words still count; "no" or "unknown" takes nothing away
    assert "child_mobility" in unanswered                       # and an unanswered question asks for a call-back


# ---------------------------------------------------------------- vulnerability tiers
def test_tier_one_outranks_tier_two_outranks_none():
    t1 = urgency.score("hot_water", {"tier1": 1}).total
    t2 = urgency.score("hot_water", {"vulnerable": 1}).total
    t3 = urgency.score("hot_water", {}).total
    assert t1 > t2 > t3 and t1 - t3 == params()["triage"]["tier1_points"]


def test_losing_power_water_or_cooling_is_immediate_for_tier_one_only():
    for fault in params()["triage"]["lifeline_faults"]:
        assert urgency.category(fault, {"tier1": 1}) == "immediate"
        assert urgency.category(fault, {"vulnerable": 1}) == taxonomy()["hazards"][fault]["category"]
    assert urgency.category("pests", {"tier1": 1}) == "routine"           # only faults that cut power, water or cooling


def test_tiers_come_from_answers_and_words_and_one_tier_counts():
    assert intake.modifier_hits("power off, my husband is on dialysis").get("tier1")
    assert "vulnerable" not in intake.modifier_hits("no power, new baby and the kids are sick")
    mods, src, _ = intake.household({}, dict(life_support="yes", child_mobility="yes"))
    assert mods == {"tier1": 1} and src == {"tier1": ["answer"]}
    mods, _, _ = intake.household({}, dict(child_mobility="yes"))
    assert mods == {"vulnerable": 1}


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
    seats = params()["joint_trips"]["seats"]["road"]
    many = simulate.joint_trips(3, "K", {f"t{i}": {"C1": o("C1", 100)} for i in range(seats + 1)})
    assert many[0]["vehicles"] == 2 and many[0]["saving"] == 100 * (seats - 1)   # a ute takes only so many


def test_travelling_together_pays_for_the_waiting():
    o = lambda site, cost: planner.TripOption(site, True, "road", 6, cost, True)
    trips = {"plumber": {"C1": o("C1", 400)}, "electrician": {"C1": o("C1", 400)}}
    rate = params()["costs"]["labour_per_hour"]
    close = simulate.joint_trips(3, "K", trips, {"plumber": {"C1": 5.0}, "electrician": {"C1": 4.0}})[0]
    assert close["idle_hours"] == 1.0 and close["saving"] == pytest.approx(400 - rate)   # the electrician waits an hour
    far = simulate.joint_trips(3, "K", trips, {"plumber": {"C1": 9.0}, "electrician": {"C1": 1.0}})[0]
    assert far["saving"] == 0 and far["idle_cost"] == 0 and far["vehicles"] == 2   # 8 hours of waiting cost more than a second ute


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


# ---------------------------------------------------------------- audit fixes
def test_a_parameter_override_does_not_leak_into_the_next_task(monkeypatch):
    """experiments._one runs many tasks in one pooled worker: an override must not survive into the next task."""
    from reachnt import config, experiments
    seen = []
    monkeypatch.setattr(simulate, "prepare_requests", lambda seed=None: None)
    monkeypatch.setattr(simulate, "run", lambda *a, **k: seen.append(dict(config.params()["crews"])))
    monkeypatch.setattr(simulate, "summarise", lambda r: {})
    base = config.params()["crews"]["capacity_factor"]
    p = simulate.Policy("cheapest", 1.0)
    first = experiments._one((p, {("crews", "capacity_factor"): base + 0.37}, None, False))
    second = experiments._one((p, None, None, False))          # same process, no override
    assert seen[0]["capacity_factor"] == base + 0.37 and first["params_used"][("crews", "capacity_factor")] == base + 0.37
    assert seen[1]["capacity_factor"] == base and second["params_used"][("crews", "capacity_factor")] == base
    assert config.params()["crews"]["capacity_factor"] == base


def test_the_planner_stops_on_work_not_wall_time_so_plans_repeat():
    rng = np.random.default_rng(3)
    jobs = [dict(job_id=f"j{i}", site=f"C{i % 12}", hours=float(rng.integers(1, 7)), value=float(rng.integers(200, 8000)))
            for i in range(160)]
    opts = {f"C{k}": _opt(f"C{k}", float(rng.uniform(1, 12)), float(rng.uniform(100, 3000))) for k in range(12)}
    a = planner.plan_week(jobs, opts, 40, 0.2, work_limit=0.002)
    b = planner.plan_week(jobs, opts, 40, 0.2, work_limit=0.002)
    assert sorted(a.done) == sorted(b.done) and sorted(a.trips) == sorted(b.trips)
    assert a.limit in ("", "work") and a.limit != "wall" and a.work > 0
    small = planner.plan_week(jobs[:6], opts, 20, 0.2)
    assert small.optimal and small.limit == ""


def _small_run(**kw):
    req = simulate.prepare_requests()
    small = req[(req.hub == "Tennant Creek") & (req.week < 8)].copy()
    return small, simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=-44, snapshot_weeks=tuple(range(8)), **kw)


def test_scored_higher_is_said_only_when_every_booked_job_outranked_it():
    _, res = _small_run()
    snap = res.reasons["snapshots"]
    logs = {(jid, w): code for jid, log in zip(res.jobs.job_id, res.jobs.reason_log) for w, code, _, _ in log}
    seen = set()
    for (wk, trade), g in snap.groupby(["week", "trade"]):
        lowest = g[g.done].value.min() if g.done.any() else np.inf
        for r in g[~g.done].itertuples():
            code = logs.get((r.job_id, wk))
            seen.add(code)
            if code in ("crew_full", "lower_priority"):
                assert r.value < lowest
            if code == "crew_hours":
                assert r.value >= lowest
    assert seen & {"crew_full", "crew_hours", "lower_priority"}


def test_a_missed_danger_is_made_safe_only_when_fixed_and_duplicates_close_after_review():
    small, _ = _small_run()
    imm = small[small.category == "immediate"].index[:3]
    small.loc[imm, "category"] = "urgent"                         # the reader missed these dangers and did not flag them
    small.loc[imm, "true_category"] = "immediate"
    res = simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=-44)
    j = res.jobs.set_index("job_id")
    miss = j.loc[small.loc[imm, "job_id"]]
    assert (miss.made_safe_day.fillna(-1) == miss.done_day.fillna(-1)).all()   # no make-safe visit: safe when fixed
    read = j[(j.category == "immediate") & (j.true_category == "immediate")]
    assert (read.made_safe_day == read.available_day).all()
    W = params()["harm_weights"]
    m = miss.iloc[0]
    assert m.harm_days == pytest.approx(m.harm / 100 * W["immediate"] * m.wait_days)   # dangerous the whole time
    dup = j[(j.merged_into != "") & j.done_day.notna()]
    assert (dup.done_day >= dup.available_day).all()
    s = simulate.summarise(res)
    jy = res.jobs[res.jobs.week < params()["demand"]["weeks"]]
    assert s["jobs_done"] == int((~jy.open_at_end & (jy.merged_into == "")).sum())   # a merged duplicate is not an extra repair
    assert s["immediate_missed_by_reader"] >= 3 and s["immediate_made_safe_within_1_day"] < 1


def test_each_year_has_its_own_road_closures_and_crews_can_be_given(monkeypatch):
    small = simulate.prepare_requests()
    small = small[(small.hub == "Katherine") & (small.week < 1)]
    states = []
    real = simulate.geo.road_open
    monkeypatch.setattr(simulate.geo, "road_open", lambda row, m, w, rng=None: states.append(rng.bit_generator.state["state"]["state"]) or real(row, m, w, rng))
    crews = {k: 3 for k in simulate.crew_sizes(small)}
    r = simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=-51, crews=crews)
    first = states[0]; states.clear()
    simulate.run(simulate.Policy("guarantee", 0.2), small, extra_weeks=-51, seed=11)
    assert states[0] != first                                    # another year, another closure calendar
    assert (r.weekly.crew == 3).all()                            # the flood runs pass the usual year's crews


def test_cheapest_first_never_does_a_long_job_in_an_overnight_community():
    com = simulate.geo.load_communities()
    far = com[(com.oneway_hours > params()["travel"]["remote_band_hours"]) & ~com.island].cid.iloc[0]
    job = pd.DataFrame([dict(job_id="X", site=far, town=False, hours=6.0, hazard="structural_danger", category="immediate", day=0,
                             wait_days=30.0, clock_equal=2.8, clock_official=2.8, tier1=False, vulnerable=False, crowded=False, repeat=False)])
    assert not simulate._worth_doing(job, simulate.Policy("cheapest", 1.0)).iloc[0]
    assert simulate._worth_doing(job, simulate.Policy("guarantee", 0.2)).iloc[0]


def test_lateness_matches_the_portal_due_chip():
    led = dict(policy="guarantee", role="coordinator", date="6 Oct 2026")
    text = lambda w: " ".join(b for _, b in explain.tenant_explanation(_job(wait_days=w, reason_log=[]), "Ngukurr", led)["sections"])
    assert "longer than our rule" not in text(3.0)               # 0.2 days past the 2.8-day clock: still "due today"
    assert "by 1 day." in text(3.4)                              # 0.6 days past: late, and never "by 0 days"
    assert "by 2 days." in text(4.9) and "by 3 days." in text(5.3)   # 2.5 days rounds up, as Math.round


def test_travel_cost_is_stated_per_mode_not_as_the_worst_week():
    log = [[1, "travel_cost", 1774, "road"], [2, "travel_cost", 1774, "road"], [3, "travel_cost", 7680, "air"], [4, "travel_cost", 1774, "road"]]
    led = dict(policy="guarantee", role="coordinator", date="6 Oct 2026")
    body = dict(explain.tenant_explanation(_job(reason_log=log), "Ngukurr", led)["sections"])["What held it up"]
    assert "about $1,800 to drive, or $7,700 to fly while the road is closed: 3 weeks by road, 1 week by air." in body
    assert "to fly one" not in body                              # not the worst week's cost and mode for all of them
    one = dict(explain.tenant_explanation(_job(reason_log=log[:2]), "Ngukurr", led)["sections"])["What held it up"]
    assert "about $1,800 to drive one there and back" in one


def test_crew_hours_reason_does_not_claim_higher_scores():
    led = dict(policy="guarantee", role="coordinator", date="6 Oct 2026")
    body = dict(explain.tenant_explanation(_job(reason_log=[[1, "crew_hours", 1700, "road"]], trade="electrician"),
                                           "Ngukurr", led)["sections"])["What held it up"]
    assert "scored higher" not in body and "electricians' hours" in body


def test_no_make_safe_claim_for_a_danger_the_reader_missed():
    led = dict(policy="guarantee", role="coordinator", date="6 Oct 2026")
    missed = explain.tenant_explanation(_job(category="urgent", true_category="immediate", hazard="electrical_danger"), "X", led)
    assert "safe" not in dict(missed["sections"])["Where it is up to"]
    flagged = explain.tenant_explanation(_job(category="immediate", hazard="electrical_danger", made_safe_day=21.0), "X", led)
    assert "made it safe the day after you reported it" in dict(flagged["sections"])["Where it is up to"]


def test_a_tier_one_lifeline_escalation_goes_to_a_person():
    r = intake.read("no power, nana on dialysis", None)
    assert r.hazard == "no_power" and r.modifiers.get("tier1") and r.needs_human


def test_a_bad_people_answer_never_removes_points():
    rec = dict(people=9, bedrooms=3)
    for bad in (0, -2, "lots", True):
        mods, src, _ = intake.household({}, dict(people=bad), rec)
        assert mods == {"crowded": 1} and src["crowded"] == ["record"]
    mods, src, _ = intake.household({}, dict(people=12), dict(people=4, bedrooms=3))
    assert src["crowded"] == ["answer"]
    _, _, unanswered = intake.household({}, dict(people=0), {})
    assert "people" in unanswered


def test_rounding_and_default_clock_match_the_portal():
    assert urgency.score("hot_water", {}, 2.9, 2.8).ageing == 5          # 4.5 rounds up, as Math.round
    assert urgency.score("electrical_danger", {}, 2).total == urgency.score("electrical_danger", {}, 2, 2.8).total


@pytest.mark.parametrize("text,hazard", [   # the sample reports on the portal's New report screen (web/app.js SAMPLES)
    ("water coming through the ceiling onto the power point, sparks when it rains. nana and the kids sleep there", "electrical_danger"),
    ("toilet blocked pls come", "toilet_blocked"),
    ("sewage coming up in the yard, 12 people living here", "sewage_overflow"),
    ("no hot water for the baby, rang last week and nobody came", "hot_water"),
    ("smells like gas inside the house", "gas_leak"),
    ("front door kicked in won't lock", "security"),
    ("cockroaches everywhere in the kitchen", "pests"),
    ("pls come", None),
])
def test_portal_samples_are_read_by_the_rules(text, hazard):
    r = intake.read(text, None)
    assert r.hazard == hazard and (hazard is not None or r.needs_human)


def test_inclusion_scores_the_truth_and_reports_the_tail():
    r = evaluate.inclusion(n=600)
    for m in ("words", "intake"):
        assert r[m]["short_points_missed"] >= 0                   # the short telling is never scored above the household's truth
        assert r[m]["gap_median"] <= r[m]["gap_mean"] and r[m]["category_cliffs"] >= 0
