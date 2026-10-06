"""Run every policy, the sensitivity sweep and the reader evaluation. Writes outputs/ and numbers.json.

    python run_all.py
"""
from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd

from . import geo, intake, planner, simulate, synth
from .config import OUTPUTS, PROCESSED, params, taxonomy

POLICIES = [
    simulate.Policy("cheapest", 1.0, "Cheapest jobs first"),
    simulate.Policy("floor", 1.0, "Cheapest first + urgent guarantee"),
    simulate.Policy("official", 0.2, "Need first, official remote allowance"),
    simulate.Policy("guarantee", 0.2, "Need first + urgent guarantee (ReachNT default)"),
    simulate.Policy("guarantee", 0.5, "Need first + urgent guarantee, tighter budget"),
    simulate.Policy("guarantee", 0.2, "ReachNT: need first + urgent guarantee + H3 run zones", runs=True),
    simulate.Policy("guarantee", 0.5, "ReachNT, tighter budget (H3 run zones)", runs=True),
    simulate.Policy("cheapest", 1.0, "Cheapest jobs first + H3 run zones", runs=True),
    simulate.Policy("need", 0.8, "Need first, cost-aware (lam 0.8)"),
    simulate.Policy("need", 0.4, "Need first (lam 0.4)"),
    simulate.Policy("need", 0.2, "Need first (lam 0.2)"),
    simulate.Policy("need", 0.1, "Need first (lam 0.1)"),
    simulate.Policy("need", 0.05, "Need first (lam 0.05)"),
    simulate.Policy("need", 0.0, "Need first, cost ignored"),
]
SNAPSHOT_WEEKS = (12, 30)   # late September (dry) and early February (wet), from a July start


def key(p: simulate.Policy) -> str:
    return f"{p.name}_{p.lam:g}" + ("_h3" if p.runs else "")


def reader_eval() -> dict:
    H = taxonomy()["hazards"]
    R = intake.CAT_RANK
    tr = synth.labelled_corpus(60, "train", 1)
    clf = intake.Classifier().fit(tr.text, tr.hazard)
    out = {}
    for name, df in [("seen", synth.labelled_corpus(15, "train", 2)), ("heldout", synth.labelled_corpus(30, "heldout", 3))]:
        rd = [intake.read(t, clf) for t in df.text]
        cat = lambda h: H[h]["category"] if h else "routine"
        rule = [intake.most_severe(intake.rule_hits(t)) for t in df.text]
        model = [clf.predict_proba(t)[0] for t in df.text]
        res = {}
        for lab, pred in [("rules", rule), ("model", model), ("combined", [x.hazard for x in rd])]:
            res[lab] = dict(hazard_acc=float(np.mean([p == t for p, t in zip(pred, df.hazard)])),
                            category_acc=float(np.mean([cat(p) == cat(t) for p, t in zip(pred, df.hazard)])),
                            under_triaged=float(np.mean([R[cat(p)] > R[cat(t)] for p, t in zip(pred, df.hazard)])))
        res["combined"]["under_triaged_unflagged"] = float(np.mean([R[cat(x.hazard)] > R[cat(t)] and not x.needs_human for x, t in zip(rd, df.hazard)]))
        imm = [(x, t) for x, t in zip(rd, df.hazard) if cat(t) == "immediate"]
        res["combined"]["danger_missed"] = float(np.mean([cat(x.hazard) != "immediate" and not x.needs_human for x, t in imm]))
        res["combined"]["to_person"] = float(np.mean([x.needs_human for x in rd]))
        res["n"] = len(df)
        out[name] = res
    return out


def calibration() -> dict:
    com = geo.load_communities().set_index("community")
    C = params()["costs"]
    out = {}
    for name in ["KINTORE", "LAJAMANU", "WADEYE", "GALIWINKU", "BARUNGA"]:
        r = com.loc[name].to_dict(); r["cid"] = com.loc[name, "cid"]
        o = planner.trip_option(r, not bool(r["island"]))
        one = planner.single_job_cost(o, 2.5)
        ten_travel = o.fixed_cost + o.travel_hours * C["labour_per_hour"] + (3 * C["overnight_per_night"] if o.overnight else 0)
        ten_total = ten_travel + 10 * 2.5 * C["labour_per_hour"]
        out[name.title()] = dict(mode=o.mode, one_job_total=one["total"], one_job_travel_share=one["travel_share"],
                                 ten_jobs_travel_share=ten_travel / ten_total, per_job_ten=ten_total / 10)
    return out


def _save(p: simulate.Policy, r: simulate.SimResult) -> None:
    k = key(p)
    r.jobs.drop(columns=["reason_counts", "last_reason", "reason_log"]).to_parquet(OUTPUTS / f"jobs_{k}.parquet")
    r.jobs[["job_id", "reason_counts", "last_reason", "reason_log"]].assign(
        reason_counts=lambda d: d.reason_counts.map(json.dumps), last_reason=lambda d: d.last_reason.map(json.dumps),
        reason_log=lambda d: d.reason_log.map(json.dumps)
    ).to_parquet(OUTPUTS / f"reasons_{k}.parquet")
    r.weekly.to_parquet(OUTPUTS / f"weekly_{k}.parquet")
    r.reasons["snapshots"].to_parquet(OUTPUTS / f"snap_{k}.parquet")


def _one(args) -> dict:
    """Run one setting in its own process. overrides: {(section, key): value}; seed: request-stream seed."""
    p, overrides, seed, save = args
    from . import config
    P = config.params()
    for (a, b), v in (overrides or {}).items():
        P[a][b] = v
    t = time.time()
    r = simulate.run(p, simulate.prepare_requests(seed=seed), snapshot_weeks=SNAPSHOT_WEEKS if save else ())
    if save:
        _save(p, r)
    s = simulate.summarise(r)
    s["key"] = key(p)
    s["seconds"] = time.time() - t
    return s


def _pool(tasks: list) -> list[dict]:
    from concurrent.futures import ProcessPoolExecutor
    import os
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as ex:
        return list(ex.map(_one, tasks))


def run_policies(req: pd.DataFrame) -> tuple[list[dict], dict]:
    summaries = _pool([(p, None, None, True) for p in POLICIES])
    for p, s in zip(POLICIES, summaries):
        print(f"  {p.label:52s} ${s['cost_per_job']:7.0f}/job  urgent P90 remote {s['urgent_p90_remote']:5.1f} d  "
              f"harm-days {s['harm_days_total']:9.0f}  ({s['seconds']:.0f}s)")
    return summaries, {}


def sensitivity(base_req: pd.DataFrame) -> list[dict]:
    """Re-run the three headline policies with the assumptions that move results changed one at a time."""
    heads = [simulate.Policy("cheapest", 1.0), simulate.Policy("guarantee", 0.2), simulate.Policy("guarantee", 0.2, runs=True)]
    variants = [("capacity_factor", ("crews", "capacity_factor"), [1.15, 1.5]),
                ("wet_cut_week_share", ("access", "wet_cut_week_share"), [0.2, 0.5]),
                ("charter_per_hour", ("costs", "charter_per_hour"), [1500, 3000])]
    simulate.prepare_requests(seed=99)          # build the second year once, before the pool reads it
    tasks, meta = [], []
    for name, path, vals in variants:
        for v in vals:
            for h in heads:
                tasks.append((h, {path: v}, None, False)); meta.append((name, v, h))
    for h in heads:
        tasks.append((h, None, 99, False)); meta.append(("random_year", 99, h))
    rows = []
    for (name, v, h), s in zip(meta, _pool(tasks)):
        rows.append(dict(param=name, value=v, policy=h.name, lam=h.lam, key=key(h), cost_per_job=s["cost_per_job"],
                         urgent_p90_remote=s["urgent_p90_remote"], urgent_p90_town=s["urgent_p90_town"],
                         harm_days=s["harm_days_total"], overdue_equal_remote=s["overdue_equal_remote"]))
    return rows
