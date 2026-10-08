"""Rebuild everything: geography, synthetic requests, reader evaluation, all policies, sensitivity,
numbers.json, report figures and the web prototype's data.

    python run_all.py            # full run (about 10 minutes)
    python run_all.py --quick    # skip the sensitivity sweep
    python run_all.py --quality  # only the quality measures (evaluate.py, about 4 minutes), merged into numbers.json
    python run_all.py --extras   # only the inclusion, missed-visit, trades-together and flood experiments, merged into numbers.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

import pandas as pd  # noqa: E402

from reachnt import evaluate, experiments, export_web, figures, geo, simulate  # noqa: E402
from reachnt.config import OUTPUTS, PROCESSED, params  # noqa: E402


def main(quick: bool = False) -> None:
    OUTPUTS.mkdir(exist_ok=True)
    print("1. Geography")
    com = geo.build_communities()
    print("2. Synthetic requests (read by the triage reader)")
    req = simulate.prepare_requests(force=True)
    print("3. Reader evaluation")
    reader = experiments.reader_eval()
    print("4. Cost calibration against Nous (2017)")
    calib = experiments.calibration()
    print("5. Policies")
    summaries, results = experiments.run_policies(req)
    pd.DataFrame([{k: v for k, v in s.items() if k != "bands"} for s in summaries]).to_csv(OUTPUTS / "policies.csv", index=False)
    pd.DataFrame([dict(key=s["key"], label=s["label"], **b) for s in summaries for b in s["bands"]]).to_csv(OUTPUTS / "bands.csv", index=False)
    sens = []
    if not quick:
        print("6. Sensitivity")
        sens = experiments.sensitivity(req)
        pd.DataFrame(sens).to_csv(OUTPUTS / "sensitivity.csv", index=False)
    elif (OUTPUTS / "sensitivity.csv").exists():
        sens = pd.read_csv(OUTPUTS / "sensitivity.csv").to_dict("records")

    houses_band = com.groupby("band").houses_est.sum().to_dict()
    houses_band["Town"] = sum(v["town_houses"] for v in params()["hubs"].values())
    S = {s["key"]: s for s in summaries}
    numbers = dict(
        synthetic_notice="Job-level data are synthetic. Communities, houses, hubs, access, job mix, clocks and cost structure are real or sourced.",
        communities=int(len(com)), remote_houses=int(com.houses_est.sum()), town_houses=int(houses_band["Town"]),
        houses_by_band={k: int(v) for k, v in houses_band.items()},
        communities_by_band=com.band.value_counts().to_dict(),
        requests=int(len(req)), requests_by_category=req.category.value_counts().to_dict(),
        read_to_person_share=float(req.needs_human.mean()),
        read_misread_unflagged_share=float((req.category != req.true_category).mean()),
        crews_total=int(sum(simulate.crew_sizes(req).values())),
        reader=reader, calibration=calib, policies=S, sensitivity=sens,
    )
    print("6b. Quality measures: ROC/PR-AUC, calibration, ranking, solver gap, five random years")
    numbers["quality"] = evaluate.build()
    print("6c. Inclusion (saying less costs no points) and missed visits")
    numbers.update(extras())
    (OUTPUTS / "numbers.json").write_text(json.dumps(numbers, indent=1, default=float))
    print("7. Figures")
    figures.build_all(numbers)
    print("8. Web prototype data")
    export_web.build(numbers)
    c, f, n = S["cheapest_1"], S["guarantee_0.2"], S["guarantee_0.2_h3"]
    print(f"\nDone. Cheapest-first: ${c['cost_per_job']:.0f}/job, remote urgent P90 {c['urgent_p90_remote']:.0f} days vs town {c['urgent_p90_town']:.0f}. "
          f"Need + guarantee: ${f['cost_per_job']:.0f}/job, harm-days {f['harm_days_total']:.0f}. ReachNT (+ H3 run zones): ${n['cost_per_job']:.0f}/job, harm-days {n['harm_days_total']:.0f}.")


def extras() -> dict:
    inc = evaluate.inclusion()
    mv = experiments.missed_visits()
    pd.DataFrame(mv).to_csv(OUTPUTS / "missed_visits.csv", index=False)
    (OUTPUTS / "inclusion.json").write_text(json.dumps(inc, indent=1))
    w, i = inc["words"], inc["intake"]
    print(f"  Short reports, words only: {w['gap_mean']:.0f} points lower, {w['short_ranked_lower']:.0%} ranked lower. "
          f"With the standard questions: {i['gap_mean']:.1f} points, {i['short_ranked_lower']:.0%}.")
    for r in mv:
        print(f"  {r['key']:18s} {r['share']:.0%} of visits missed: ${r['cost_per_job']:.0f}/job, urgent P90 remote {r['urgent_p90_remote']:.0f} d, "
              f"harm-days {r['harm_days_total']:.0f}" + (f", missed urgent remote jobs P90 {r['urgent_remote_missed_p90']:.0f} d" if r["share"] else ""))
    jt = experiments.joint_trips()
    for r in jt:
        print(f"  {r['key']:18s} trades travelling together: {r['joint_trips']} shared trips, ${r['cost_per_job']:.0f} -> ${r['cost_per_job_joint']:.0f} per repair")
    dz = experiments.disaster()
    for r in dz:
        print(f"  {r['label']:22s} flood jobs {r['event_jobs']}, urgent P90 {r['event_urgent_p90']}, rest of hub urgent P90 {r['other_urgent_p90']:.0f} d")
    pd.DataFrame(dz).to_csv(OUTPUTS / "disaster.csv", index=False)
    pd.DataFrame(jt).to_csv(OUTPUTS / "joint_trips.csv", index=False)
    return dict(inclusion=inc, missed_visits=mv, joint_trips=jt, disaster=dz)


def extras_only() -> None:
    numbers = json.loads((OUTPUTS / "numbers.json").read_text())
    numbers.update(extras())
    (OUTPUTS / "numbers.json").write_text(json.dumps(numbers, indent=1, default=float))


def quality_only() -> None:
    numbers = json.loads((OUTPUTS / "numbers.json").read_text())
    numbers["quality"] = evaluate.build()
    (OUTPUTS / "numbers.json").write_text(json.dumps(numbers, indent=1, default=float))
    figures.build_all(numbers)


if __name__ == "__main__":
    if "--quality" in sys.argv:
        quality_only()
    elif "--extras" in sys.argv:
        extras_only()
    else:
        main(quick="--quick" in sys.argv)
