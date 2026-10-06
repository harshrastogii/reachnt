"""Report figures. Every number drawn here comes from outputs/numbers.json or outputs/*.parquet.

Palette: the dataviz reference palette. Policies use categorical slots 1-3 in fixed order
(cheapest = orange slot 2 because it is the "warning" comparison; need = blue slot 1; floor = aqua slot 3).
Remoteness bands are ordinal, so they use one blue ramp light -> dark.
"""
from __future__ import annotations

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from .config import OUTPUTS, RAW  # noqa: E402
from .geo import load_communities  # noqa: E402
from .simulate import BAND_ORDER  # noqa: E402

FIG = OUTPUTS / "figures"
INK, INK2, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df", "#ffffff"
BLUE, ORANGE, AQUA, YELLOW, GREY, VIOLET = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9a9994", "#4a3aa7"
RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"]   # ordinal, 250 -> 700
POLICY_STYLE = {"cheapest_1": ("Cheapest jobs first", ORANGE), "guarantee_0.2": ("Urgent first, one community per trip", BLUE),
                "guarantee_0.2_h3": ("ReachNT: urgent first, shared trips", VIOLET)}


def _style():
    plt.rcParams.update({"font.family": "Arial", "font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK2,
                         "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                         "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
                         "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.dpi": 220, "legend.frameon": False})


def frontier(N: dict):
    P = pd.DataFrame([{k: v for k, v in s.items() if k != "bands"} for s in N["policies"].values()])
    need = P[P.policy == "need"].sort_values("lam")
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.3))
    for ax, col, ylab in [(axes[0], "harm_days_total", "Days living with a fault (thousands)"),
                          (axes[1], "urgent_p90_remote", "Days until 9 in 10 urgent\nremote repairs are fixed")]:
        scale = 1000 if col == "harm_days_total" else 1
        ax.plot(need.cost_per_job, need[col] / scale, color=GREY, lw=1.6, marker="o", ms=4.5, mec=SURFACE, mew=1.2,
                label="Urgent first, no deadline (cost weight 0 to 0.8)", zorder=3)
        g = P[(P.policy == "guarantee") & (~P.key.str.endswith("_h3"))].sort_values("lam")
        ax.plot(g.cost_per_job, g[col] / scale, color=BLUE, lw=2, marker="o", ms=6, mec=SURFACE, mew=1.5,
                label="Urgent first, with a deadline", zorder=5)
        g3 = P[(P.policy == "guarantee") & (P.key.str.endswith("_h3"))].sort_values("lam")
        ax.plot(g3.cost_per_job, g3[col] / scale, color=VIOLET, lw=2.4, marker="h", ms=9, mec=SURFACE, mew=1.5,
                label="ReachNT: urgent first, deadline, shared trips", zorder=6)
        c3 = P[P.key == "cheapest_1_h3"]
        if len(c3):
            ax.scatter(c3.cost_per_job, c3[col] / scale, s=60, marker="h", color=ORANGE, edgecolor=INK2, linewidth=0.8, zorder=4,
                       label="Cheapest first, with shared trips")
        for _, r in need.iterrows():
            if r.lam in (0.0, 0.1, 0.8):
                ax.annotate(f"weight {r.lam:g}", (r.cost_per_job, r[col] / scale), textcoords="offset points", xytext=(6, -10 if r.lam else 4),
                            fontsize=7.5, color=INK2)
        for k, (lab, colr) in [("cheapest_1", ("Cheapest jobs first", ORANGE)), ("floor_1", ("Cheapest first, deadline for urgent jobs", AQUA))]:
            r = P[P.key == k].iloc[0]
            ax.scatter([r.cost_per_job], [r[col] / scale], s=60, color=colr, edgecolor=SURFACE, linewidth=1.5, zorder=4, label=lab)
        r = P[P.key == "official_0.2"].iloc[0]  # noqa
        ax.scatter([r.cost_per_job], [r[col] / scale], s=50, marker="D", color=GREY, edgecolor=SURFACE, linewidth=1.5, zorder=4,
                   label="Urgent first, official remote deadlines")
        ax.set_xlabel("Average cost per repair ($)")
        ax.set_ylabel(ylab)
        ax.set_ylim(bottom=0)
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=3, fontsize=6.8, handlelength=1.2, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.13, 1, 1))
    fig.savefig(FIG / "fig2_frontier.png")
    plt.close(fig)


def band_waits(N: dict):
    bands = [b for b in BAND_ORDER if any(x["band"] == b for x in N["policies"]["guarantee_0.2_h3"]["bands"])]
    fig, ax = plt.subplots(figsize=(7.2, 3.1))
    h = 0.26
    y = np.arange(len(bands))
    for i, (k, (lab, colr)) in enumerate(POLICY_STYLE.items()):
        b = {x["band"]: x for x in N["policies"][k]["bands"]}
        vals = [b[x]["urgent_p90"] for x in bands]
        ax.barh(y + (i - 1) * h, vals, height=h - 0.04, color=colr, label=lab)
        for yy, v in zip(y + (i - 1) * h, vals):
            ax.text(v + 1, yy, f"{v:.0f}", va="center", fontsize=7, color=INK2)
    ax.set_yticks(y, bands)
    ax.invert_yaxis()
    ax.set_xlabel("Days until 9 in 10 urgent repairs are fixed")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="upper center", fontsize=7.5, ncol=3, bbox_to_anchor=(0.45, -0.2))
    fig.tight_layout()
    fig.savefig(FIG / "fig3_band_waits.png", bbox_inches="tight")
    plt.close(fig)


def reasons(N: dict):
    codes = [("travel_cost", "No trip: too costly that week", ORANGE), ("crew_full", "Trades fully booked", BLUE),
             ("cut", "Road cut, no airstrip", YELLOW), ("lower_priority", "Trade came, did more urgent jobs", AQUA)]
    fig, ax = plt.subplots(figsize=(7.2, 2.2))
    rows = []
    for k, (lab, _) in POLICY_STYLE.items():
        j = pd.read_parquet(OUTPUTS / f"reasons_{k}.parquet")
        base = pd.read_parquet(OUTPUTS / f"jobs_{k}.parquet", columns=["job_id", "town"])
        j = j.merge(base, on="job_id")
        j = j[~j.town]
        tot = {c: 0 for c, _, _ in codes}
        for rc in j.reason_counts:
            for c, n in json.loads(rc).items():
                tot[c] = tot.get(c, 0) + n
        rows.append((lab, tot))
    y = np.arange(len(rows))
    for i, (lab, tot) in enumerate(rows):
        left = 0
        for c, cl, colr in codes:
            w = tot.get(c, 0) / 1000
            ax.barh(i, w, left=left, color=colr, height=0.6, edgecolor=SURFACE, linewidth=1.5, label=cl if i == 0 else None)
            left += w
        ax.text(left + 0.2, i, f"{left:.1f}k", va="center", fontsize=7.5, color=INK2)
    ax.set_yticks(y, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel("Weeks remote repairs spent waiting, by the reason written down (thousands)")
    ax.grid(axis="y", visible=False)
    ax.legend(ncol=4, fontsize=7, loc="upper center", bbox_to_anchor=(0.45, -0.38))
    fig.tight_layout()
    fig.savefig(FIG / "fig4_reasons.png", bbox_inches="tight")
    plt.close(fig)


def context_map(N: dict):
    geo = json.loads((RAW / "nt_outline.json").read_text())
    com = load_communities()
    from .config import params
    fig, ax = plt.subplots(figsize=(6.4, 5.0))
    band_col = {"Near town (road)": "#9ec5f4", "Remote (road)": BLUE, "Very remote (road)": "#0d366b",
                "Remote, cut in the wet": YELLOW, "Island (fly-in)": "#4a3aa7"}
    for poly in geo["coast"]:
        xs, ys = zip(*poly[0]) if isinstance(poly[0][0], list) else zip(*poly)
        ax.fill(xs, ys, color="#f0efec", ec=MUTED, lw=0.4)
    for seg in geo["highways"]:
        xs, ys = zip(*seg)
        ax.plot(xs, ys, color="#c9c8c3", lw=0.5)
    import h3
    from .geo import run_pairs
    cid = com.set_index("cid")
    for r in com.itertuples():                       # each community's H3 resolution-4 cell
        ring = h3.cell_to_boundary(r.h3_r4)
        ys, xs = zip(*ring)
        ax.fill(list(xs) + [xs[0]], list(ys) + [ys[0]], facecolor=(0.39, 0.82, 1, 0.10), edgecolor=(0.05, 0.56, 0.72, 0.8), lw=0.5, zorder=2)
    for pr in run_pairs(com).itertuples():          # run zones: within 2 rings at resolution 4
        a, b = cid.loc[pr.a], cid.loc[pr.b]
        ax.plot([a.lon, b.lon], [a.lat, b.lat], color="#0e8fb8", lw=1.1, alpha=0.9, zorder=2.5)
    ax.plot([], [], color="#0e8fb8", lw=1.2, label="H3 run zone (one trip, two communities)")
    bands = [b for b in BAND_ORDER if b != "Town"]
    for i, b in enumerate(bands):
        c = com[com.band == b]
        ax.scatter(c.lon, c.lat, s=10 + c.houses_est / 5, color=band_col[b], edgecolor=INK2, lw=0.5,
                   label=f"{b} ({len(c)})", zorder=3)
    for h, v in params()["hubs"].items():
        ax.scatter([v["lon"]], [v["lat"]], marker="s", s=28, color=INK, zorder=4)
        ax.annotate(h, (v["lon"], v["lat"]), textcoords="offset points", xytext=(5, 3), fontsize=7.5, color=INK)
    ax.set_aspect(1 / np.cos(np.radians(19)))
    ax.set_xlim(128.8, 138.3); ax.set_ylim(-26.2, -10.8)
    ax.axis("off")
    ax.legend(loc="lower left", fontsize=8, title="Communities by access\n(dot size = houses; hexagon = H3 res 4)", title_fontsize=8.5,
              bbox_to_anchor=(1.0, 0.02), alignment="left", markerscale=0.9)
    fig.tight_layout()
    fig.savefig(FIG / "fig1_map.png")
    plt.close(fig)


def reader_quality(Q: dict) -> None:
    """Appendix figure: can the reader spot a dangerous fault, and can its confidence be trusted?"""
    R = Q["reader"]
    fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.6))
    for name, colr, lab in [("seen", GREY, "Familiar"), ("heldout", BLUE, "New wording")]:
        d, c = R[name]["danger"], R[name]["curves"]
        axes[0].plot(*c["roc"], color=colr, lw=1.8, label=f"{lab} (AUC {d['roc_auc']:.2f})")
        axes[1].plot(*c["pr"], color=colr, lw=1.8, label=f"{lab} (AUC {d['pr_auc']:.2f})")
        rel = np.array(c["reliability"])
        axes[2].plot(rel[:, 0], rel[:, 1], color=colr, lw=1.8, marker="o", ms=3.5, label=lab)
    axes[0].plot([0, 1], [0, 1], color=MUTED, lw=0.8, ls="--")
    d = R["heldout"]["danger"]   # the whole safety net, not just the model's score
    axes[0].scatter([1 - d["net_specificity"]], [d["net_recall"]], s=55, marker="*", color=VIOLET, zorder=5,
                    label="New + person checks")
    axes[0].set(xlabel="Safe reports wrongly flagged", ylabel="Dangerous reports caught", title="Spotting danger (ROC)")
    base = R["heldout"]["danger"]["pr_auc_baseline"]
    axes[1].axhline(base, color=MUTED, lw=0.8, ls="--")
    axes[1].annotate(f"guessing: {base:.2f}", (0.02, base), xytext=(0, 3), textcoords="offset points", fontsize=7, color=INK2)
    axes[1].set(xlabel="Dangerous reports caught", ylabel="Flagged reports truly dangerous", title="Spotting danger (PR)")
    axes[2].plot([0, 1], [0, 1], color=MUTED, lw=0.8, ls="--")
    axes[2].set(xlabel="How sure the model says it is", ylabel="How often it is right", title="Is its confidence honest?")
    for ax in axes:
        ax.set(xlim=(0, 1), ylim=(0, 1.02))
        ax.title.set_fontsize(8.5)
        ax.legend(fontsize=6.8, loc="lower right" if ax is not axes[1] else "lower left")
    fig.tight_layout()
    fig.savefig(FIG / "fig5_reader_quality.png", bbox_inches="tight")
    plt.close(fig)


def build_all(N: dict) -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    _style()
    context_map(N)
    frontier(N)
    band_waits(N)
    reasons(N)
    if "quality" in N:
        reader_quality(N["quality"])
