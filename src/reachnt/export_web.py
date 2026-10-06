"""Write web/data/app.js for the ReachNT portal (window.RN = {...}).

The portal quotes the same numbers as the report because both read outputs/numbers.json.
Repair requests are synthetic and flagged as such in the data and on every screen.
"""
from __future__ import annotations

import json

import h3
import numpy as np
import pandas as pd

from . import explain
from .config import OUTPUTS, RAW, WEB_DATA, params, taxonomy
from .geo import load_communities, run_pairs
from .planner import run_option, single_job_cost, trip_option

DEMO_HUB = "Katherine"
DEMO_POLICIES = ["guarantee_0.2_h3", "guarantee_0.2", "floor_1", "cheapest_1"]
LABELS = {
    "guarantee_0.2_h3": "ReachNT: most urgent first, with shared trips",
    "guarantee_0.2": "Most urgent first, one community per trip",
    "floor_1": "Cheapest first, but urgent jobs on time",
    "cheapest_1": "Cheapest first (nobody decided this)",
}
SHORT = {"guarantee_0.2_h3": "ReachNT", "guarantee_0.2": "Urgent first", "floor_1": "Cheapest + deadline", "cheapest_1": "Cheapest first"}
LEDGER = {
    "guarantee_0.2_h3": dict(policy="guarantee", role="regional maintenance coordinator", date="6 Oct 2026",
                             rationale="Example record. Need sets the order. Urgent repairs get the same clock in town and out bush. "
                                       "Neighbouring communities share a trip when their H3 cells are within two rings."),
    "guarantee_0.2": dict(policy="guarantee", role="regional maintenance coordinator", date="6 Oct 2026",
                          rationale="Example record. Need sets the order and urgent repairs get the same clock everywhere. Each trip visits one community."),
    "floor_1": dict(policy="floor", role="regional maintenance coordinator", date="6 Oct 2026",
                    rationale="Example record. The budget is fixed this quarter, so routine work goes to the cheapest trips, but no urgent repair waits past the clock."),
    "cheapest_1": dict(policy="cheapest", role="regional maintenance coordinator", date="(no decision recorded)",
                       rationale="Nobody signed this. It is what a schedule does when it is built to clear the most jobs per dollar."),
}


def _jobs(k: str) -> pd.DataFrame:
    jobs = pd.read_parquet(OUTPUTS / f"jobs_{k}.parquet")
    rs = pd.read_parquet(OUTPUTS / f"reasons_{k}.parquet")
    jobs = jobs.merge(rs, on="job_id")
    jobs["reason_counts"] = jobs.reason_counts.map(json.loads)
    jobs["reason_log"] = jobs.reason_log.map(json.loads)
    return jobs


def build(N: dict) -> None:
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    P = params()
    Hc = P["h3"]
    com = load_communities()
    comd = com.set_index("cid")
    pairs = run_pairs(com)
    hubs = [dict(name=h, lat=v["lat"], lon=v["lon"], houses=v["town_houses"], cell=h3.latlng_to_cell(v["lat"], v["lon"], 7))
            for h, v in P["hubs"].items()]
    C = P["costs"]
    def trip_total(o):
        return o.fixed_cost + o.travel_hours * C["labour_per_hour"]
    single = {r.cid: round(trip_total(trip_option(comd.loc[r.cid].to_dict() | {"cid": r.cid}, not bool(r.island)))) for r in com.itertuples()}
    pair_rows = []
    for pr in pairs.itertuples():
        a, b = comd.loc[pr.a].to_dict() | {"cid": pr.a}, comd.loc[pr.b].to_dict() | {"cid": pr.b}
        isl = bool(a["island"]) or bool(b["island"])
        o = run_option(a, b, not isl, not isl, pr.km)
        if o is None:
            continue
        together = round(trip_total(o))
        pair_rows.append(dict(hub=pr.hub, a=pr.a, b=pr.b, grid_distance=int(pr.grid_distance), km=round(pr.km, 1),
                              together=together, separate=single[pr.a] + single[pr.b], saving=single[pr.a] + single[pr.b] - together))
    cdict = [dict(cid=r.cid, name=r.community.title(), hub=r.hub, band=r.band, houses=int(r.houses_est), lat=round(r.lat, 4),
                  lon=round(r.lon, 4), r7=r.h3_r7, r5=r.h3_r5, r4=r.h3_r4, island=bool(r.island),
                  closure=(r.closure_road if isinstance(r.closure_road, str) else ""),
                  closure_months=(r.closure_months if isinstance(r.closure_months, str) else ""), airstrip=bool(r.has_airstrip),
                  hours=round(r.oneway_hours, 1), overcrowded_pct=int(r.pct_2022), trip_cost=single[r.cid]) for r in com.itertuples()]

    from .geo import house_cell
    centre = {r.cid: (r.lat, r.lon) for r in com.itertuples()}
    centre.update({f"TOWN-{h}": (v["lat"], v["lon"]) for h, v in P["hubs"].items()})
    demo, year = {}, {}
    for k in DEMO_POLICIES:
        jobs = _jobs(k)
        # year view per community (all hubs): urgent waits and harm, from the full simulated year
        y = jobs[(~jobs.town) & (jobs.week < P["demand"]["weeks"])]
        u = y[y.category.isin(["urgent", "immediate"])]
        year[k] = {cid: dict(p90=round(float(np.percentile(g.wait_days, 90)), 1), n=int(len(g)),
                             harm=round(float(y[y.site == cid].harm_days.sum())))
                   for cid, g in u.groupby("site")}
        snap = pd.read_parquet(OUTPUTS / f"snap_{k}.parquet")
        snap = snap[snap.hub == DEMO_HUB]
        jj_all = jobs.set_index("job_id")
        weeks = {}
        for wk, s in snap.groupby("week"):
            s = s.copy()
            s["rank"] = s.groupby("trade").value.rank(ascending=False, method="first").astype(int)
            s["of"] = s.groupby("trade").job_id.transform("count")
            rows = []
            for _, sr in s.iterrows():
                jr = jj_all.loc[sr.job_id]
                place = f"{DEMO_HUB} (town)" if jr.town else comd.loc[jr.site, "community"].title()
                ex = explain.tenant_explanation({**jr.to_dict(), "job_id": sr.job_id}, place, LEDGER[k],
                                                None if jr.town else comd.loc[jr.site].to_dict(), (int(sr["rank"]), int(sr["of"])),
                                                as_of_week=int(wk), booked=bool(sr.done))
                log = [x for x in jr.reason_log if x[0] < int(wk)]
                rows.append(dict(id=sr.job_id, site=sr.site, place=place, band=jr.band, trade=jr.trade, hazard=jr.hazard,
                                 category=jr.category, text=jr.text,
                                 cell=house_cell(jr.site, int(jr.house.rsplit("-H", 1)[1]), centre[jr.site], jr.site.startswith("TOWN")),
                                 day=int(jr.day),
                                 value=round(float(sr.value)), done=bool(sr.done), trip=bool(sr.trip), run=sr.get("run", ""),
                                 mode=sr["mode"], reachable=bool(sr.reachable), trip_cost=round(float(sr.trip_cost)),
                                 rank=int(sr["rank"]), of=int(sr["of"]), wait=round(max(0.0, int(wk) * 7 + 3 - float(jr.day)), 1),
                                 needs_human=bool(jr.needs_human), vulnerable=bool(jr.vulnerable), reasons=log,
                                 now=("booked" if bool(sr.done) else next((x[1] for x in jr.reason_log if x[0] == int(wk)), None)),
                                 short=ex["short"], sections=ex["sections"], score=ex["score"], score_text=ex["score_text"]))
            weeks[int(wk)] = rows
            # field app: each trade's run this week, and "while you're there" suggestions
        field = {}
        for wk, rows in weeks.items():
            df = pd.DataFrame(rows)
            per_trade = {}
            for trade, g in df.groupby("trade"):
                trip_sites = sorted({r for r in g[g.trip & (g.site != "TOWN")].site})
                ring = set()
                for sid in trip_sites:
                    ring |= set(h3.grid_disk(comd.loc[sid, "h3_r5"], Hc["nearby_k"]))
                nearby = g[(~g.done) & (g.site != "TOWN") & (~g.site.isin(trip_sites))]
                nearby = nearby[nearby.site.map(lambda s: comd.loc[s, "h3_r5"] in ring)]
                near_list = []
                for r in nearby.itertuples():
                    d = min(h3.grid_distance(comd.loc[r.site, "h3_r5"], comd.loc[t, "h3_r5"]) for t in trip_sites)
                    near_list.append(dict(id=r.id, rings=int(d)))
                per_trade[trade] = dict(trips=trip_sites, town=bool((g.done & (g.site == "TOWN")).any()),
                                        nearby=sorted(near_list, key=lambda d: d["rings"])[:12])
            field[wk] = per_trade
        demo[k] = dict(label=LABELS[k], ledger=LEDGER[k], weeks=weeks, field=field)

    data = dict(
        notice=N["synthetic_notice"],
        hub=DEMO_HUB,
        taxonomy=taxonomy(), triage=P["triage"], clocks=P["clocks"], h3=Hc,
        hubs=hubs, communities=cdict,
        pairs=pair_rows,
        policies={k: v for k, v in N["policies"].items()},
        labels=LABELS, short=SHORT,
        demo=demo, year=year,
        reader=N["reader"], calibration=N["calibration"],
        totals=dict(communities=N["communities"], remote_houses=N["remote_houses"], town_houses=N["town_houses"],
                    requests=N["requests"], crews=N["crews_total"]),
        coast=json.loads((RAW / "nt_outline.json").read_text())["coast"],
    )
    js = "// Generated by src/reachnt/export_web.py. Repair requests are SYNTHETIC.\nwindow.RN = " + json.dumps(data, separators=(",", ":"), default=float) + ";\n"
    (WEB_DATA / "app.js").write_text(js)
    print(f"  web/data/app.js {len(js) / 1e6:.1f} MB")
