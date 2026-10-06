"""Weekly trip planner (Google OR-Tools CP-SAT).

For one hub, one trade and one week it chooses which communities get a trip and which open jobs are done,
under the crew's hours. Travel hours count against the crew's week, so even a planner that ignores money
drifts toward town work. That drift is the thing we make visible.

    maximise  sum(value_j * done_j)  -  lam * cost
    subject to  travel hours + job hours <= crew hours
                a community job is done only if that community gets a trip
                a community gets a trip only if it can be reached this week (road open, or an airstrip)

`value_j` comes from the policy:
  cheapest  every job is worth the same (1000 points): clear as many jobs as the money allows
  need      urgency points (urgency.py) + a deadline bonus for jobs about to breach the equal clock
  official  urgency points + a deadline bonus for jobs about to breach the official clock (remote allowance)
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .config import params


@dataclass
class TripOption:
    site: str
    reachable: bool
    mode: str            # "road", "air", "town", "cut"
    travel_hours: float  # crew hours spent travelling (round trip)
    fixed_cost: float    # vehicle or charter cost for the trip ($)
    overnight: bool


def trip_option(row, road_ok: bool) -> TripOption:
    """Travel for one tradesperson from the hub to a community and back this week."""
    P = params()
    C, T = P["costs"], P["travel"]
    if road_ok:
        h = 2 * row["oneway_hours"]
        cost = 2 * row["straight_km"] * T["circuity"] * C["vehicle_per_km"]
        return TripOption(row["cid"], True, "road", h, cost, row["oneway_hours"] > T["remote_band_hours"])
    if bool(row["has_airstrip"]):
        fh = row["flight_hours_oneway"]
        # charter: drop-off and pick-up are two return flights for the aircraft
        cost = 4 * fh * C["charter_per_hour"]
        return TripOption(row["cid"], True, "air", 2 * fh + 1.0, cost, True)   # +1 h airport time
    return TripOption(row["cid"], False, "cut", 0, 0, False)


def run_option(a, b, road_a: bool, road_b: bool, km_ab: float) -> TripOption | None:
    """One tradesperson through two neighbouring communities in one trip (an H3 run zone): hub -> A -> B -> hub."""
    P = params()
    C, T = P["costs"], P["travel"]
    if road_a and road_b:
        h = a["oneway_hours"] + b["oneway_hours"] + km_ab * T["circuity"] / T["road_speed_kmh"]
        cost = (a["straight_km"] + b["straight_km"] + km_ab) * T["circuity"] * C["vehicle_per_km"]
        return TripOption(f"{a['cid']}+{b['cid']}", True, "road-run", h, cost, True)
    if bool(a["has_airstrip"]) and bool(b["has_airstrip"]):
        fh = a["flight_hours_oneway"] + b["flight_hours_oneway"] + km_ab / T["flight_speed_kmh"]
        return TripOption(f"{a['cid']}+{b['cid']}", True, "air-run", fh + 1.5, 2 * fh * C["charter_per_hour"], True)
    return None


@dataclass
class PlanResult:
    done: list[str]
    trips: dict[str, TripOption]
    hours_used: float
    capacity: float
    cost: dict[str, float]          # travel, labour, overnight
    optimal: bool = True            # solver proved no better plan exists
    gap: float = 0.0                # (best bound - plan value) / |best bound|; 0 when optimal
    solve_s: float = 0.0


def plan_week(jobs: list[dict], options: dict[str, TripOption], capacity_hours: float, lam: float,
              time_limit: float | None = None, runs: dict[str, tuple[TripOption, tuple[str, str]]] | None = None) -> PlanResult:
    """jobs: dicts with job_id, site ('TOWN' or cid), hours, value. Returns what gets done."""
    P = params()
    C = P["costs"]
    if not jobs or capacity_hours <= 0:
        return PlanResult([], {}, 0.0, capacity_hours, {"travel": 0, "labour": 0, "overnight": 0})
    m = cp_model.CpModel()
    SCALE = 10  # tenths of an hour, tenths of a dollar-point
    y = {j["job_id"]: m.NewBoolVar(j["job_id"]) for j in jobs}
    sites = sorted({j["site"] for j in jobs if j["site"] != "TOWN"})
    x = {}
    for s in sites:
        o = options[s]
        if o.reachable:
            x[s] = m.NewBoolVar(f"trip_{s}")
    runs = {k: v for k, v in (runs or {}).items() if v[1][0] in sites and v[1][1] in sites}
    z = {k: m.NewBoolVar(f"run_{k}") for k in runs}
    covers: dict[str, list] = {}
    for k, (_, (a, b)) in runs.items():
        covers.setdefault(a, []).append(z[k]); covers.setdefault(b, []).append(z[k])
    hours_terms, obj = [], []
    max_onsite = P["planning"]["max_onsite_days_per_trip"] * C["hours_per_day"] * SCALE
    by_site: dict[str, list] = {}
    for j in jobs:
        v = y[j["job_id"]]
        hj = int(round(j["hours"] * SCALE))
        hours_terms.append(hj * v)
        s = j["site"]
        if s == "TOWN":
            jcost = j["hours"] * C["labour_per_hour"] + C["town_travel_per_job"]
        else:
            if s not in x and s not in covers:
                m.Add(v == 0)
                continue
            m.Add(v <= sum(([x[s]] if s in x else []) + covers.get(s, [])))
            by_site.setdefault(s, []).append(hj * v)
            o = options[s]
            jcost = j["hours"] * C["labour_per_hour"] + (C["overnight_per_night"] * j["hours"] / C["hours_per_day"] if o.overnight else 0)
        obj.append(int(round((j["value"] - lam * jcost) * SCALE)) * v)
    for s, xs in x.items():
        o = options[s]
        hours_terms.append(int(round(o.travel_hours * SCALE)) * xs)
        tcost = o.fixed_cost + o.travel_hours * C["labour_per_hour"]
        obj.append(-int(round(lam * tcost * SCALE)) * xs)
        if s in by_site:
            m.Add(sum(by_site[s]) <= max_onsite)
    for k, (o, _) in runs.items():
        hours_terms.append(int(round(o.travel_hours * SCALE)) * z[k])
        obj.append(-int(round(lam * (o.fixed_cost + o.travel_hours * C["labour_per_hour"]) * SCALE)) * z[k])
    for s_ in covers:   # a community is visited by at most one trip or run a week
        m.Add(sum(([x[s_]] if s_ in x else []) + covers[s_]) <= 1)
    m.Add(sum(hours_terms) <= int(capacity_hours * SCALE))
    m.Maximize(sum(obj))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit or P["planning"]["solver_time_limit_s"]
    solver.parameters.num_workers = 1          # single worker + fixed seed: identical results on every run
    solver.parameters.random_seed = 7
    st = solver.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return PlanResult([], {}, 0.0, capacity_hours, {"travel": 0, "labour": 0, "overnight": 0})
    done = [jid for jid, v in y.items() if solver.Value(v)]
    trips = {s: options[s] for s, v in x.items() if solver.Value(v)}
    used_runs = [k for k, v in z.items() if solver.Value(v)]
    for k in used_runs:
        o, (a, b) = runs[k]
        half = TripOption(k, True, o.mode, o.travel_hours / 2, o.fixed_cost / 2, True)
        trips[a] = half; trips[b] = half
    dset = set(done)
    labour = sum(j["hours"] for j in jobs if j["job_id"] in dset) * C["labour_per_hour"]
    overnight = sum(C["overnight_per_night"] * j["hours"] / C["hours_per_day"] for j in jobs
                    if j["job_id"] in dset and j["site"] != "TOWN" and trips.get(j["site"], options[j["site"]]).overnight)
    travel = sum(o.fixed_cost + o.travel_hours * C["labour_per_hour"] for o in trips.values())
    travel += sum(C["town_travel_per_job"] for j in jobs if j["job_id"] in dset and j["site"] == "TOWN")
    hours = sum(j["hours"] for j in jobs if j["job_id"] in dset) + sum(o.travel_hours for o in trips.values())
    val, bound = solver.ObjectiveValue(), solver.BestObjectiveBound()
    gap = 0.0 if st == cp_model.OPTIMAL else max(0.0, (bound - val) / max(abs(bound), 1.0))
    return PlanResult(done, trips, hours, capacity_hours, {"travel": travel, "labour": labour, "overnight": overnight},
                      st == cp_model.OPTIMAL, gap, solver.WallTime())


def single_job_cost(option: TripOption, hours: float) -> dict:
    """Cost of sending one tradesperson for one job (used for calibration against Nous 2017 and in explanations)."""
    C = params()["costs"]
    travel = option.fixed_cost + option.travel_hours * C["labour_per_hour"]
    nights = math.ceil(hours / C["hours_per_day"]) if option.overnight else 0
    labour = hours * C["labour_per_hour"]
    total = travel + labour + nights * C["overnight_per_night"]
    return {"travel": travel, "labour": labour, "overnight": nights * C["overnight_per_night"], "total": total,
            "travel_share": (travel + nights * C["overnight_per_night"]) / total}
