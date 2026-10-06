"""Checks on the rules that matter: urgency never sees distance or cost, the reader escalates danger,
the planner respects crew hours and road access, explanations stay readable and truthful."""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from reachnt import explain, intake, planner, synth, urgency  # noqa: E402
from reachnt.config import params, taxonomy  # noqa: E402


# ---------------------------------------------------------------- urgency is need-only
def test_urgency_signature_has_no_place_or_cost_inputs():
    args = set(inspect.signature(urgency.score).parameters)
    assert args <= {"hazard", "modifiers", "days_waited", "clock"}
    banned = ["distance", "km", "cost", "hub", "community", "remote", "band", "lat", "lon", "indigenous", "travel"]
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
