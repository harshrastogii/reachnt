"""One year of (synthetic) repair requests run through the weekly planner under different policies.

What is real: communities, houses, hubs, access calendar, job mix, response clocks, cost structure.
What is synthetic: the individual requests and their wording. Every output says so.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import geo, intake, synth, urgency
from .config import OUTPUTS, PROCESSED, params, taxonomy
from .planner import plan_week, run_option, trip_option

CAT_FACTOR = {"immediate": 3.0, "urgent": 1.5, "routine": 0.5}   # harm-day weight per category (ASSUMPTION)
MADE_SAFE_FACTOR = 1.5                                             # immediate job after make-safe weighs like urgent


# ------------------------------------------------------------------ requests
def prepare_requests(force: bool = False, seed: int | None = None) -> pd.DataFrame:
    path = PROCESSED / f"requests{'' if seed is None else '_' + str(seed)}.parquet"
    if path.exists() and not force:
        return pd.read_parquet(path)
    H = taxonomy()["hazards"]
    com = geo.load_communities()
    req = synth.request_stream(com, seed)
    tr = synth.labelled_corpus(60, "train", 1)
    clf = intake.Classifier().fit(tr.text, tr.hazard)
    reads = [intake.read(t, clf) for t in req.text]
    req["read_hazard"] = [r.hazard for r in reads]
    req["needs_human"] = [r.needs_human for r in reads]
    req["read_source"] = [r.source for r in reads]
    req["vulnerable"] = [("vulnerable" in r.modifiers) for r in reads]
    req["crowded"] = [("crowded" in r.modifiers) for r in reads]
    req["repeat"] = [("repeat" in r.modifiers) for r in reads]
    # a person reviews flagged reports next business day and records the true fault (ASSUMPTION: review is correct)
    req["hazard"] = np.where(req.needs_human | req.read_hazard.isna(), req.true_hazard, req.read_hazard)
    req["available_day"] = req.day + np.where(req.needs_human, 1, 0)
    req["category"] = req.hazard.map(lambda h: H[h]["category"])
    req["true_category"] = req.true_hazard.map(lambda h: H[h]["category"])
    req["trade"] = req.hazard.map(lambda h: H[h]["trade"])
    req["hours"] = req.hazard.map(lambda h: H[h]["hours"])
    req["harm"] = req.true_hazard.map(lambda h: H[h]["harm"])
    band = dict(zip(com.cid, com.band))
    hubs = params()["hubs"]
    centre = {r.cid: (r.lat, r.lon) for r in com.itertuples()}
    centre.update({f"TOWN-{h}": (v["lat"], v["lon"]) for h, v in hubs.items()})
    req["house_h3"] = [geo.house_cell(s, int(h.rsplit("-H", 1)[1]), centre[s], s.startswith("TOWN"))
                       for s, h in zip(req.site, req.house)]
    req["band"] = np.where(req.town, "Town", req.site.map(band))
    req["remote"] = ~req.town
    req.to_parquet(path)
    return req


def crew_sizes(req: pd.DataFrame) -> dict[tuple[str, str], int]:
    P = params()["crews"]
    weeks = params()["demand"]["weeks"]
    hrs = req.groupby(["hub", "trade"]).hours.sum() / weeks
    return {k: max(P["min_per_hub"], math.ceil(P["capacity_factor"] * v / P["hours_per_week"])) for k, v in hrs.items()}


# ------------------------------------------------------------------ policies
@dataclass(frozen=True)
class Policy:
    name: str           # cheapest | floor | need | official | guarantee
    lam: float          # points per dollar
    label: str = ""
    runs: bool = False  # allow H3 run zones (two neighbouring communities in one trip)

    @property
    def regime(self) -> str:
        return "official" if self.name == "official" else "equal"


def job_value(job: dict, policy: Policy, day_end: float) -> float:
    P = params()["planning"]
    if policy.name in ("cheapest", "floor"):
        v = 1000.0
        if policy.name == "floor" and job["category"] in ("urgent", "immediate") and job["day"] + job["clock_equal"] - day_end <= P["due_soon_days"]:
            v += P["floor_bonus"]
        return v
    clock = job["clock_" + policy.regime]
    waited = day_end - job["day"]
    u = urgency.score(job["hazard"], {k: 1 for k in ("vulnerable", "crowded", "repeat") if job[k]}, waited, clock)
    v = u.total
    due = job["day"] + clock - day_end <= P["due_soon_days"]
    if due:
        v += P["deadline_bonus"]
    if policy.name == "guarantee" and due and job["category"] in ("urgent", "immediate"):
        v += P["floor_bonus"]
    return float(v)


# ------------------------------------------------------------------ simulation
@dataclass
class SimResult:
    policy: Policy
    jobs: pd.DataFrame
    weekly: pd.DataFrame
    reasons: dict = field(default_factory=dict)


def run(policy: Policy, req: pd.DataFrame | None = None, extra_weeks: int = 8, seed: int | None = None,
        snapshot_weeks: tuple[int, ...] = ()) -> SimResult:
    P = params()
    req = prepare_requests(seed=seed) if req is None else req
    com = geo.load_communities().set_index("cid", drop=False)
    crews = crew_sizes(req)
    pairs = geo.run_pairs(com.reset_index(drop=True)) if policy.runs else pd.DataFrame(columns=["hub", "a", "b", "km"])
    rng = np.random.default_rng(P["seed"] + 7)
    jobs = req.copy()
    jobs["clock_equal"] = [urgency.clock_days("urgent" if c == "immediate" else c, r, "equal") for c, r in zip(jobs.category, jobs.remote)]
    jobs["clock_official"] = [urgency.clock_days("urgent" if c == "immediate" else c, r, "official") for c, r in zip(jobs.category, jobs.remote)]
    jobs["done_day"] = np.nan
    jobs["done_mode"] = ""
    recs = jobs.to_dict("records")
    by_hub: dict[str, list[dict]] = {}
    for j in recs:
        by_hub.setdefault(j["hub"], []).append(j)
    reasons: dict[str, Counter] = {j["job_id"]: Counter() for j in recs}
    snaps: list[dict] = []
    logs: dict[str, list] = {}
    last_reason: dict[str, dict] = {}
    weekly = []
    weeks = P["demand"]["weeks"] + extra_weeks
    start_month = P["demand"]["start_month"]
    for wk in range(weeks):
        day0, day_end = wk * 7, wk * 7 + 7
        month = (start_month - 1 + day0 // 30) % 12 + 1
        road = {cid: geo.road_open(com.loc[cid], month, wk, rng) for cid in com.index}
        for hub, hjobs in by_hub.items():
            open_jobs = [j for j in hjobs if np.isnan(j["done_day"]) and j["available_day"] < day_end]
            for trade in sorted({j["trade"] for j in open_jobs}):
                tj = [j for j in open_jobs if j["trade"] == trade]
                cap = crews.get((hub, trade), 1) * P["crews"]["hours_per_week"]
                plan_jobs, options = [], {}
                for j in tj:
                    site = "TOWN" if j["town"] else j["site"]
                    if site != "TOWN" and site not in options:
                        options[site] = trip_option(com.loc[site], road[site])
                    plan_jobs.append(dict(job_id=j["job_id"], site=site, hours=j["hours"], value=job_value(j, policy, day_end)))
                # keep the model small: top 40 jobs per community (400 in town) by value
                plan_jobs.sort(key=lambda d: -d["value"])
                per_site: Counter = Counter()
                trimmed = []
                for d in plan_jobs:
                    if per_site[d["site"]] < (400 if d["site"] == "TOWN" else 40):
                        trimmed.append(d); per_site[d["site"]] += 1
                runs = {}
                if policy.runs:
                    open_sites = {d["site"] for d in trimmed}
                    for pr in pairs[pairs.hub == hub].itertuples():
                        if pr.a in open_sites and pr.b in open_sites:
                            o = run_option(com.loc[pr.a], com.loc[pr.b], road[pr.a], road[pr.b], pr.km)
                            if o:
                                runs[o.site] = (o, (pr.a, pr.b))
                res = plan_week(trimmed, options, cap, policy.lam, runs=runs)
                done = set(res.done)
                if wk in snapshot_weeks:
                    vals = {d["job_id"]: d["value"] for d in plan_jobs}
                    for j in tj:
                        site = "TOWN" if j["town"] else j["site"]
                        o = options.get(site)
                        snaps.append(dict(week=wk, hub=hub, trade=trade, job_id=j["job_id"], site=site, value=vals[j["job_id"]],
                                          done=j["job_id"] in done, trip=site in res.trips,
                                          mode=(res.trips[site].mode if site in res.trips else (o.mode if o else "town")),
                                          run=(res.trips[site].site if site in res.trips and "+" in res.trips[site].site else ""),
                                          reachable=(o.reachable if o else True), trip_cost=(o.fixed_cost if o else 0.0),
                                          travel_hours=(o.travel_hours if o else 0.0), capacity=cap, used=res.hours_used))
                full = res.hours_used >= 0.92 * cap
                for j in tj:
                    jid = j["job_id"]
                    site = "TOWN" if j["town"] else j["site"]
                    if jid in done:
                        j["done_day"] = max(j["available_day"] + 1, day0 + 3)
                        j["done_mode"] = "town" if site == "TOWN" else res.trips[site].mode
                        continue
                    if site != "TOWN" and not options[site].reachable:
                        code = "cut"
                    elif site != "TOWN" and site not in res.trips:
                        code = "crew_full" if full else "travel_cost"
                    else:
                        code = "lower_priority"
                    reasons[jid][code] += 1
                    o = options.get(site)
                    tcost = (o.fixed_cost + o.travel_hours * P["costs"]["labour_per_hour"]) if (o and o.reachable) else 0.0
                    logs.setdefault(jid, []).append([wk, code, round(tcost), o.mode if o else "town"])
                    last_reason[jid] = dict(week=wk, code=code, mode=o.mode if o else "town", trip_cost=(o.fixed_cost if o else 0),
                                            capacity=cap, used=res.hours_used, trips=len(res.trips))
                weekly.append(dict(week=wk, hub=hub, trade=trade, month=month, crew=crews.get((hub, trade), 1), capacity=cap,
                                   hours_used=res.hours_used, jobs_done=len(done), trips=len(res.trips),
                                   air_trips=sum(o.mode.startswith("air") for o in res.trips.values()),
                                   run_trips=len({o.site for o in res.trips.values() if "+" in o.site}), **{f"cost_{k}": v for k, v in res.cost.items()}))
    out = pd.DataFrame(recs)
    end = weeks * 7
    out["open_at_end"] = out.done_day.isna()
    out["wait_days"] = np.where(out.open_at_end, end - out.day, out.done_day - out.day)
    out["overdue_equal"] = out.wait_days > out.clock_equal
    out["overdue_official"] = out.wait_days > out.clock_official
    w = out.harm / 100 * out.true_category.map(CAT_FACTOR)
    w = np.where(out.true_category == "immediate", out.harm / 100 * MADE_SAFE_FACTOR, w)   # made safe on day one
    out["harm_days"] = w * out.wait_days
    out["reason_counts"] = out.job_id.map(lambda k: dict(reasons[k]))
    out["reason_log"] = out.job_id.map(lambda k: logs.get(k, []))
    out["last_reason"] = out.job_id.map(lambda k: last_reason.get(k, {}))
    out["policy"] = policy.name
    out["lam"] = policy.lam
    return SimResult(policy, out, pd.DataFrame(weekly), {"snapshots": pd.DataFrame(snaps)})


# ------------------------------------------------------------------ metrics
BAND_ORDER = ["Town", "Near town (road)", "Remote (road)", "Very remote (road)", "Remote, cut in the wet", "Island (fly-in)"]


def summarise(res: SimResult, houses: pd.Series | None = None) -> dict:
    j = res.jobs[res.jobs.week < params()["demand"]["weeks"]]
    wk = res.weekly
    cost = wk[[c for c in wk.columns if c.startswith("cost_")]].sum()
    total = float(cost.sum())
    done = int((~j.open_at_end).sum())
    urg = j[j.category.isin(["urgent", "immediate"])]
    remote = urg[~urg.town]
    town = urg[urg.town]
    s = dict(policy=res.policy.name, lam=res.policy.lam, label=res.policy.label,
             total_cost=total, cost_travel=float(cost.get("cost_travel", 0)), cost_per_job=total / max(done, 1),
             jobs_done=done, open_at_end=int(j.open_at_end.sum()),
             urgent_p90_town=float(np.percentile(town.wait_days, 90)), urgent_p90_remote=float(np.percentile(remote.wait_days, 90)),
             urgent_median_town=float(town.wait_days.median()), urgent_median_remote=float(remote.wait_days.median()),
             overdue_equal_town=float(town.overdue_equal.mean()), overdue_equal_remote=float(remote.overdue_equal.mean()),
             overdue_official_remote=float(remote.overdue_official.mean()),
             harm_days_total=float(j.harm_days.sum()), air_trips=int(wk.air_trips.sum()), trips=int(wk.trips.sum()))
    s["gap_p90"] = s["urgent_p90_remote"] / max(s["urgent_p90_town"], 0.1)
    by = []
    for b in BAND_ORDER:
        x = j[j.band == b]
        if len(x) == 0:
            continue
        u = x[x.category.isin(["urgent", "immediate"])]
        by.append(dict(band=b, jobs=len(x), urgent_median=float(u.wait_days.median()), urgent_p90=float(np.percentile(u.wait_days, 90)),
                       routine_median=float(x[x.category == "routine"].wait_days.median()),
                       overdue_equal=float(u.overdue_equal.mean()), harm_days=float(x.harm_days.sum()),
                       open_at_end=int(x.open_at_end.sum())))
    s["bands"] = by
    return s
