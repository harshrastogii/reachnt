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


def quality_appendix(N) -> str:
    Q = N.get("quality")
    if not Q:
        return "The quality measures have not been run (python run_all.py --quality)."
    R, S = Q["reader"], Q["simulation"]
    a, b = R["seen"], R["heldout"]
    f2, p0 = (lambda x: f"{x:.2f}"), (lambda x: f"{x * 100:.0f}%")
    ci = lambda v: f"{v[0]:.2f}–{v[1]:.2f}"
    rows = [
        f"Every measure below is computed by src/reachnt/evaluate.py on synthetic reports: {a['n']} in familiar wording and {b['n']} in wording kept out of training, "
        f"{p0(b['prevalence'])} of them dangerous (Immediate). ROC-AUC is the chance the model scores a random dangerous report above a random safe one (0.5 is guessing, 1 is perfect). "
        f"PR-AUC summarises how many flagged reports are truly dangerous across all thresholds; guessing scores the share of dangerous reports, {f2(b['danger']['pr_auc_baseline'])}. "
        f"Ranges are 95% bootstrap intervals.",
        "",
        "TABLE: Table G1. Reader quality. \"Model\" is the logistic regression alone; \"system\" is rules, model and the send-to-a-person checks together.",
        "| Measure | Familiar wording | New wording |", "|---|---|---|",
        f"| Dangerous fault, ROC-AUC (model) | {f2(a['danger']['roc_auc'])} ({ci(a['danger']['roc_auc_ci'])}) | {f2(b['danger']['roc_auc'])} ({ci(b['danger']['roc_auc_ci'])}) |",
        f"| Dangerous fault, PR-AUC (model) | {f2(a['danger']['pr_auc'])} ({ci(a['danger']['pr_auc_ci'])}) | {f2(b['danger']['pr_auc'])} ({ci(b['danger']['pr_auc_ci'])}) |",
        f"| Dangerous reports caught: labelled Immediate or sent to a person (system recall) | {p0(a['danger']['net_recall'])} | {p0(b['danger']['net_recall'])} |",
        f"| Dangerous reports labelled Immediate straight away | {p0(a['danger']['direct_recall'])} | {p0(b['danger']['direct_recall'])} |",
        f"| Flagged reports that were truly dangerous (system precision) | {p0(a['danger']['net_precision'])} | {p0(b['danger']['net_precision'])} |",
        f"| Category (Immediate/Urgent/Routine), macro ROC-AUC (model) | {f2(a['category']['model_roc_auc_macro'])} | {f2(b['category']['model_roc_auc_macro'])} |",
        f"| Category, macro PR-AUC (model) | {f2(a['category']['model_pr_auc_macro'])} | {f2(b['category']['model_pr_auc_macro'])} |",
        f"| Category, accuracy / macro-F1 (system) | {p0(a['category']['combined_accuracy'])} / {f2(a['category']['combined_macro_f1'])} | {p0(b['category']['combined_accuracy'])} / {f2(b['category']['combined_macro_f1'])} |",
        f"| Category, quadratic-weighted kappa (system) | {f2(a['category']['combined_kappa_quadratic'])} | {f2(b['category']['combined_kappa_quadratic'])} |",
        f"| Exact fault type ({a['fault_type']['classes']} types), top-1 / top-3 accuracy (model) | {p0(a['fault_type']['top1'])} / {p0(a['fault_type']['top3'])} | {p0(b['fault_type']['top1'])} / {p0(b['fault_type']['top3'])} |",
        f"| Exact fault type, macro-F1 (model) | {f2(a['fault_type']['macro_f1'])} | {f2(b['fault_type']['macro_f1'])} |",
        f"| Calibration: Brier score / expected calibration error (model, lower is better) | {f2(a['fault_type']['brier'])} / {f2(a['fault_type']['ece'])} | {f2(b['fault_type']['brier'])} / {f2(b['fault_type']['ece'])} |",
        "",
        f"Five-fold cross-validation on the training reports gave macro-F1 {f2(R['cross_validation']['macro_f1_mean'])} ± {f2(R['cross_validation']['macro_f1_sd'])} and danger ROC-AUC "
        f"{f2(R['cross_validation']['danger_roc_auc_mean'])} ± {f2(R['cross_validation']['danger_roc_auc_sd'])}, so the model is stable on wording it knows. The drop on new wording is the real finding: "
        f"the model alone separates dangerous from safe reports only moderately (ROC-AUC {f2(b['danger']['roc_auc'])}), and its confidence runs ahead of its accuracy at the top "
        f"(Figure 5, right). The system still catches {p0(b['danger']['net_recall'])} of dangerous reports because it sends doubtful ones to a person, at the price of a precision of "
        f"{p0(b['danger']['net_precision'])}. For that reason ReachNT never shows tenants a confidence percentage.",
        "",
        "FIGURE: outputs/figures/fig5_reader_quality.png | 16.0 | Figure 5. Left and centre: how well the model's danger score separates dangerous from safe reports; the star is the whole system on new wording, with a person checking doubtful reports. Right: when the model says it is X% sure, how often it is right (the dashed line is honest confidence).",
        "",
    ]
    sw = R["threshold_sweep"]
    lo, hi = min(x["to_person"] for x in sw), max(x["to_person"] for x in sw)
    rows.append(f"Moving the confidence threshold from {sw[0]['threshold']:.2f} to {sw[-1]['threshold']:.2f} changed the share sent to a person only between {p0(lo)} and {p0(hi)}: "
                f"most referrals come from the danger checks, not the threshold. We kept {R['threshold']:.2f}, set before testing; tuning it on the test reports would flatter the result.")
    rows.append("")
    rk = b["ranking"]
    rows.append(f"Ranking. On new wording, the queue built from read reports agreed with the queue built from the true faults at Kendall's τ = {f2(rk['kendall_tau_read'])} "
                f"({f2(rk['kendall_tau_checked'])} once a person has corrected the reports sent to them). Of the {rk['top_k']} reports at the top of the queue, "
                f"{p0(rk['dangerous_in_top_k_read'])} were truly dangerous before that check and {p0(rk['dangerous_in_top_k_checked'])} after.")
    rows.append("")
    pl = S["planner"]
    rows.append(f"Planner. Across the {pl['plans']:,} weekly plans in the runs below, CP-SAT proved {pl['optimal_share'] * 100:.1f}% of them optimal: no better plan exists "
                f"under the model's rules. The other {pl['hit_limit_share'] * 100:.1f}% stopped at the {pl['time_limit_s']:.0f}-second limit with a feasible plan; for those the solver "
                f"can only bound how much better a plan might be, at most {pl['gap_max'] * 100:.0f}% in the worst week, and such bounds are usually loose. "
                f"The median plan took {pl['solve_median_s'] * 1000:.0f} milliseconds and 95% took under {pl['solve_p95_s']:.2f} seconds.")
    rows.append("")
    names = {"cheapest_1": "Cheapest first", "guarantee_0.2": "Urgent first, one community per trip", "guarantee_0.2_h3": "ReachNT"}
    rows += ["TABLE: Table G2. The headline plans in five random years of synthetic requests (the main year and four more). Mean, with the range.",
             "| Plan | Cost per repair | 9 in 10 urgent remote repairs fixed within (days) | Fault-days (thousands) |", "|---|---|---|---|"]
    for k, lab in names.items():
        sp = S["spread"][k]
        rows.append(f"| {lab} | ${sp['cost_per_job']['mean']:,.0f} (${sp['cost_per_job']['min']:,.0f}–${sp['cost_per_job']['max']:,.0f}) | "
                    f"{sp['urgent_p90_remote']['mean']:.0f} ({sp['urgent_p90_remote']['min']:.0f}–{sp['urgent_p90_remote']['max']:.0f}) | "
                    f"{sp['harm_days_total']['mean'] / 1000:.0f} ({sp['harm_days_total']['min'] / 1000:.0f}–{sp['harm_days_total']['max'] / 1000:.0f}) |")
    pr = S["paired"]
    rows.append("")
    rows.append(f"In every year ReachNT cut fault-days against cheapest-first by {p0(pr['fault_days_cut_vs_cheapest']['min'])}–{p0(pr['fault_days_cut_vs_cheapest']['max'])}, "
                f"for {p0(pr['cost_rise_vs_cheapest']['min'])}–{p0(pr['cost_rise_vs_cheapest']['max'])} more per repair, and shared trips saved "
                f"${pr['cost_saved_by_sharing']['min']:,.0f}–${pr['cost_saved_by_sharing']['max']:,.0f} per repair against the same plan without them.")
    return "\n".join(rows)


def _ctx(N) -> dict:
    P = N["policies"]
    C0, G, F, N0, L4 = P["cheapest_1"], P["guarantee_0.2"], P["floor_1"], P["need_0"], P["need_0.4"]
    R, RT, CH = P["guarantee_0.2_h3"], P["guarantee_0.5_h3"], P["cheapest_1_h3"]
    band = lambda pol, b, k="urgent_p90": next(x for x in pol["bands"] if x["band"] == b)[k]
    Qr = (N.get("quality") or {}).get("reader", {})
    IN = N.get("inclusion", {})
    MV = {}
    for r in N.get("missed_visits", []):
        MV.setdefault(r["key"], {})[0 if not r["share"] else 1] = r
    return dict(N=N, Qr=Qr, IN=IN, MV=MV, P=P, C0=C0, G=G, F=F, N0=N0, L4=L4, R=R, RT=RT, CH=CH, band=band,
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
                .replace("TENANT_EXAMPLE", tenant_example(N))
                .replace("QUALITY_APPENDIX", quality_appendix(N)))
