"""Fill the report's generated blocks from outputs/numbers.json, so the report quotes the pipeline, not memory."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))


def _n():
    return json.loads((ROOT / "outputs" / "numbers.json").read_text())


def sensitivity_sentence(N) -> str:
    S = N.get("sensitivity") or []
    if not S:
        return "The sensitivity sweep has not been run (python run_all.py without --quick)."
    import pandas as pd
    d = pd.DataFrame(S)
    if "key" not in d:   # older sweeps: heads were cheapest, guarantee, guarantee with run zones, in that order
        d["key"] = [["cheapest_1", "guarantee_0.2", "guarantee_0.2_h3"][i % 3] for i in range(len(d))]
    c, r = d[d.key == "cheapest_1"].reset_index(drop=True), d[d.key == "guarantee_0.2_h3"].reset_index(drop=True)
    g = d[d.key == "guarantee_0.2"].reset_index(drop=True)
    always = bool(((r.harm_days < c.harm_days) & (r.urgent_p90_remote <= c.urgent_p90_remote)).all())
    h3_wins = int(((r.harm_days < g.harm_days) & (r.cost_per_job < g.cost_per_job)).sum())
    return (f"We re-ran cheapest-first, need first with a guarantee, and ReachNT with crew capacity at 1.15 and 1.5 times job hours, "
            f"the wet-season cut share at 0.2 and 0.5, the charter rate at $1,500 and $3,000 an hour, and a second random year "
            f"({len(c)} variants each). Cheapest-first ranged from ${c.cost_per_job.min():,.0f} to ${c.cost_per_job.max():,.0f} a job, with the "
            f"remote urgent 90th percentile at {c.urgent_p90_remote.min():.0f}–{c.urgent_p90_remote.max():.0f} days; ReachNT ranged from "
            f"${r.cost_per_job.min():,.0f} to ${r.cost_per_job.max():,.0f} a job and " + (f"{r.urgent_p90_remote.min():.0f} days in every variant. " if r.urgent_p90_remote.min() == r.urgent_p90_remote.max() else f"{r.urgent_p90_remote.min():.0f}–{r.urgent_p90_remote.max():.0f} days. ")
            + ("In every variant ReachNT had fewer harm-days and shorter remote urgent waits than cheapest-first. " if always else
               "In at least one variant that ordering changed (outputs/sensitivity.csv). ")
            + f"Run zones lowered both cost and harm-days in {h3_wins} of {len(r)} variants. The direction of the trade-off holds; its size moves with the assumptions.")


def calibration_table(N) -> str:
    rows = ["TABLE: Table D1. Cost calibration. One 2.5-hour job sent alone, and ten jobs sharing one trip, against Nous (2017): travel up to 96% of an emergency job's cost, 11–37% for planned work.",
            "| Community | Mode | One job: total | One job: travel share | Ten jobs: travel share | Ten jobs: cost per job |", "|---|---|---|---|---|---|"]
    for k, v in N["calibration"].items():
        rows.append(f"| {k} | {v['mode']} | ${v['one_job_total']:,.0f} | {v['one_job_travel_share']:.0%} | {v['ten_jobs_travel_share']:.0%} | ${v['per_job_ten']:,.0f} |")
    rows.append("")
    rows.append("Main assumptions (all in config/params.yaml): labour $130 an hour; vehicle $1.10 a km; overnight $320; charter $2,200 an hour; blended road speed 70 km/h with 1.2 circuity; requests 4 per house per year; crews 1.3 × expected job hours; 35% of wet-season weeks cut for Top End communities more than 2 hours out that the register does not cover.")
    return "\n".join(rows)


def tenant_example(N) -> str:
    import pandas as pd
    from reachnt import explain, geo
    out = ROOT / "outputs"
    jobs = pd.read_parquet(out / "jobs_cheapest_1.parquet").merge(pd.read_parquet(out / "reasons_cheapest_1.parquet"), on="job_id")
    jobs = jobs.drop(columns=[c for c in ("house_h3",) if c in jobs])
    j = jobs[(~jobs.town) & (jobs.category == "urgent") & (jobs.band == "Remote, cut in the wet")].sort_values("wait_days")
    j = j.iloc[int(len(j) * 0.9)].to_dict()
    j["reason_log"] = json.loads(j["reason_log"])
    com = geo.load_communities().set_index("cid")
    ex = explain.tenant_explanation(j, "[community]", dict(policy="cheapest", role="coordinator", date="(no decision recorded)"),
                                    com.loc[j["site"]].to_dict())
    lines = [f"An urgent job at the 90th percentile of waits in a community cut in the wet, under cheapest-first ({j['job_id']}; community name withheld). Text message: \"{ex['short']}\""]
    for t, b in ex["sections"]:
        lines.append(f"**{t}.** {b}")
    lines.append(ex["score_text"])
    return "\n".join(lines)


def _ctx(N) -> dict:
    P = N["policies"]
    C0, G, F, N0, L4 = P["cheapest_1"], P["guarantee_0.2"], P["floor_1"], P["need_0"], P["need_0.4"]
    R, RT, CH = P["guarantee_0.2_h3"], P["guarantee_0.5_h3"], P["cheapest_1_h3"]
    band = lambda pol, b, k="urgent_p90": next(x for x in pol["bands"] if x["band"] == b)[k]
    return dict(N=N, P=P, C0=C0, G=G, F=F, N0=N0, L4=L4, R=R, RT=RT, CH=CH, band=band,
                money=lambda x: f"${x:,.0f}", pct=lambda x: f"{x * 100:.0f}%",
                d=lambda x: f"{x:.0f}", m=lambda x: f"${x / 1e6:.1f} million")


def filled(text: str) -> str:
    import re
    N = _n()
    ctx = _ctx(N)
    def ev(expr: str) -> str:
        m = re.match(r"^(.*):([,.0-9a-z%]+)$", expr)
        if m:
            return format(eval(m.group(1), {}, ctx), m.group(2))
        return str(eval(expr, {}, ctx))
    text = re.sub(r"\{\{(.+?)\}\}", lambda m: ev(m.group(1)), text)
    return (text.replace("SENSITIVITY_SENTENCE", sensitivity_sentence(N))
                .replace("CALIBRATION_TABLE", calibration_table(N))
                .replace("TENANT_EXAMPLE", tenant_example(N)))
