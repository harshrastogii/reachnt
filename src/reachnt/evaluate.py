"""How good is each AI part of ReachNT? Standard quality measures, all on synthetic data.

1. Reader (intake.py). Can it spot a dangerous fault? ROC-AUC and PR-AUC of the model's danger score, recall and
   precision of the whole safety net (rules + model + "send to a person"), a three-way confusion matrix, macro-F1,
   quadratic-weighted kappa, calibration (Brier score, expected calibration error) and how accuracy trades against
   the share of reports sent to a person. 5-fold cross-validation checks the model is stable.
2. Ranking (urgency.py). Does a misread report land in the wrong place in the queue? Kendall's tau between the
   queue built from read reports and the queue built from the true faults, and how many truly dangerous reports
   reach the top of the queue.
3. Planner (planner.py). How close is each weekly plan to the best possible one? CP-SAT proves optimality or
   reports a bound; the gap is how far the plan could be from that bound.
4. Simulation. Do the headline results hold in other random years? Five request streams for each headline plan.
5. Inclusion. Does a household lose points because the tenant said less? The same households, described in full and
   in a few words, scored from the words alone and then with the standard intake questions (intake.household).

Honest limit: the reports are synthetic, written from our own phrase lists. "New wording" keeps phrasings out of
training, which is the fairer test, but neither tests Aboriginal English, Kriol or other languages.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.stats import kendalltau, spearmanr
from sklearn.base import clone
from sklearn.metrics import (average_precision_score, balanced_accuracy_score, cohen_kappa_score, confusion_matrix,
                             f1_score, log_loss, precision_recall_curve, roc_auc_score, roc_curve, top_k_accuracy_score)
from sklearn.model_selection import StratifiedKFold

from . import intake, simulate, synth, urgency
from .config import params, taxonomy

CATS = ["immediate", "urgent", "routine"]
HEADLINE = ["cheapest_1", "guarantee_0.2", "guarantee_0.2_h3"]
YEARS = [None, 11, 12, 13, 14]          # None is the main simulated year used everywhere else


def _boot_ci(y, s, fn, n=1000, seed=0):
    rng = np.random.default_rng(seed)
    y, s = np.asarray(y), np.asarray(s)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() != y[i].max():
            vals.append(fn(y[i], s[i]))
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def _ece(conf, correct, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    e, curve = 0.0, []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs(correct[m].mean() - conf[m].mean())
            curve.append([float(conf[m].mean()), float(correct[m].mean()), int(m.sum())])
    return float(e), curve


def _split(clf, df, H):
    texts = [intake.normalise(t) for t in df.text]
    classes = list(clf.pipe.classes_)
    P = clf.pipe.predict_proba(texts)
    cat_of = np.array([H[k]["category"] for k in classes])
    y_h = df.hazard.to_numpy()
    y_c = np.array([H[h]["category"] for h in y_h])
    danger = (y_c == "immediate").astype(int)
    p_imm = P[:, cat_of == "immediate"].sum(1)
    Pc = np.column_stack([P[:, cat_of == c].sum(1) for c in CATS])
    rd = [intake.read(t, clf) for t in df.text]
    pred_c = np.array([H[x.hazard]["category"] if x.hazard else "routine" for x in rd])
    sent = np.array([x.needs_human for x in rd])
    caught = (pred_c == "immediate") | sent
    rank = {c: i for i, c in enumerate(CATS)}
    top1 = np.array(classes)[P.argmax(1)]
    conf = P.max(1)
    onehot = (np.array(classes)[None, :] == y_h[:, None]).astype(float)
    ece, rel = _ece(conf, (top1 == y_h).astype(float))
    fpr, tpr, _ = roc_curve(danger, p_imm)
    pr, rc, _ = precision_recall_curve(danger, p_imm)
    tp = int((caught & (danger == 1)).sum())
    return dict(
        n=int(len(df)), dangerous=int(danger.sum()), prevalence=float(danger.mean()),
        danger=dict(roc_auc=float(roc_auc_score(danger, p_imm)), roc_auc_ci=_boot_ci(danger, p_imm, roc_auc_score),
                    pr_auc=float(average_precision_score(danger, p_imm)), pr_auc_ci=_boot_ci(danger, p_imm, average_precision_score),
                    pr_auc_baseline=float(danger.mean()),
                    net_recall=tp / max(int(danger.sum()), 1), net_precision=tp / max(int(caught.sum()), 1),
                    net_specificity=float(((~caught) & (danger == 0)).sum() / max(int((danger == 0).sum()), 1)),
                    direct_recall=float(((pred_c == "immediate") & (danger == 1)).sum() / max(int(danger.sum()), 1))),
        category=dict(model_roc_auc_macro=float(np.mean([roc_auc_score(y_c == c, Pc[:, i]) for i, c in enumerate(CATS)])),   # one-vs-rest
                      model_pr_auc_macro=float(np.mean([average_precision_score(y_c == c, Pc[:, i]) for i, c in enumerate(CATS)])),
                      combined_accuracy=float((pred_c == y_c).mean()),
                      combined_macro_f1=float(f1_score(y_c, pred_c, labels=CATS, average="macro")),
                      combined_balanced_acc=float(balanced_accuracy_score(y_c, pred_c)),
                      combined_kappa_quadratic=float(cohen_kappa_score([rank[c] for c in y_c], [rank[c] for c in pred_c], weights="quadratic")),
                      confusion=confusion_matrix(y_c, pred_c, labels=CATS).tolist(),
                      per_class={c: dict(precision=float(((pred_c == c) & (y_c == c)).sum() / max((pred_c == c).sum(), 1)),
                                         recall=float(((pred_c == c) & (y_c == c)).sum() / max((y_c == c).sum(), 1))) for c in CATS}),
        fault_type=dict(classes=len(classes), top1=float((top1 == y_h).mean()),
                        top3=float(top_k_accuracy_score(y_h, P, k=3, labels=classes)),
                        macro_f1=float(f1_score(y_h, top1, labels=classes, average="macro", zero_division=0)),
                        log_loss=float(log_loss(y_h, P, labels=classes)),
                        brier=float(((P - onehot) ** 2).sum(1).mean()), ece=ece),
        curves=dict(roc=[fpr.round(4).tolist(), tpr.round(4).tolist()], pr=[rc.round(4).tolist(), pr.round(4).tolist()], reliability=rel),
        _rd=rd,
    )


def _threshold_sweep(clf, df, H):
    T = params()["triage"]
    keep = T["confidence_threshold"]
    y_c = np.array([H[h]["category"] for h in df.hazard])
    out = []
    try:
        for thr in np.round(np.arange(0.30, 0.91, 0.05), 2):
            T["confidence_threshold"] = float(thr)
            rd = [intake.read(t, clf) for t in df.text]
            pc = np.array([H[x.hazard]["category"] if x.hazard else "routine" for x in rd])
            sent = np.array([x.needs_human for x in rd])
            auto = ~sent
            imm = y_c == "immediate"
            out.append(dict(threshold=float(thr), to_person=float(sent.mean()),
                            auto_accuracy=float((pc[auto] == y_c[auto]).mean()) if auto.any() else None,
                            danger_missed=float(((pc != "immediate") & auto & imm).sum() / max(imm.sum(), 1))))
    finally:
        T["confidence_threshold"] = keep
    return out


def _cross_validation(tr, H, folds=5):
    base = intake.Classifier().pipe
    X = np.array([intake.normalise(t) for t in tr.text])
    y = tr.hazard.to_numpy()
    f1s, aucs = [], []
    for a, b in StratifiedKFold(folds, shuffle=True, random_state=0).split(X, y):
        m = clone(base).fit(X[a], y[a])
        P = m.predict_proba(X[b])
        cat_of = np.array([H[k]["category"] for k in m.classes_])
        f1s.append(f1_score(y[b], m.classes_[P.argmax(1)], average="macro"))
        aucs.append(roc_auc_score([H[h]["category"] == "immediate" for h in y[b]], P[:, cat_of == "immediate"].sum(1)))
    return dict(folds=folds, macro_f1_mean=float(np.mean(f1s)), macro_f1_sd=float(np.std(f1s)),
                danger_roc_auc_mean=float(np.mean(aucs)), danger_roc_auc_sd=float(np.std(aucs)))


def _ranking(df, rd):
    """Queue from read reports vs queue from true faults. A report sent to a person is assumed read correctly."""
    def mods(r):   # the corpus flags a vulnerable household; its tier comes from what it lives with
        m = {k: 1 for k in ("crowded", "repeat") if getattr(r, k)}
        if r.vulnerable:
            m["tier1" if "tier1" in intake.modifier_hits(r.text) else "vulnerable"] = 1
        return m
    true = np.array([urgency.score(r.hazard, mods(r)).total for r in df.itertuples()])
    read = np.array([urgency.score(x.hazard, x.modifiers).total if x.hazard else 0 for x in rd])
    checked = np.where([x.needs_human for x in rd], true, read)
    danger = np.array([taxonomy()["hazards"][h]["category"] == "immediate" for h in df.hazard])
    k = int(danger.sum())

    def top_k(s):   # of the k reports placed highest, how many are truly dangerous (ties broken by report order)
        return float(danger[np.argsort(-s, kind="stable")[:k]].mean())
    return dict(kendall_tau_read=float(kendalltau(true, read).statistic), kendall_tau_checked=float(kendalltau(true, checked).statistic),
                spearman_read=float(spearmanr(true, read).statistic), spearman_checked=float(spearmanr(true, checked).statistic),
                top_k=k, dangerous_in_top_k_read=top_k(read), dangerous_in_top_k_checked=top_k(checked))


def reader_quality() -> dict:
    H = taxonomy()["hazards"]
    tr = synth.labelled_corpus(60, "train", 1)
    clf = intake.Classifier().fit(tr.text, tr.hazard)
    out = {}
    for name, df in [("seen", synth.labelled_corpus(15, "train", 2)), ("heldout", synth.labelled_corpus(30, "heldout", 3))]:
        r = _split(clf, df, H)
        rd = r.pop("_rd")
        r["ranking"] = _ranking(df, rd)
        out[name] = r
    out["threshold_sweep"] = _threshold_sweep(clf, synth.labelled_corpus(30, "heldout", 3), H)
    out["cross_validation"] = _cross_validation(tr, H)
    out["threshold"] = params()["triage"]["confidence_threshold"]
    return out


def _year(args):
    key, seed = args
    from .experiments import POLICIES, key as pkey
    pol = next(p for p in POLICIES if pkey(p) == key)
    stats = []
    real = simulate.plan_week

    def rec(*a, **k):
        r = real(*a, **k)
        if a[0]:
            stats.append((r.optimal, r.gap, r.solve_s))
        return r
    simulate.plan_week = rec
    try:
        s = simulate.summarise(simulate.run(pol, seed=seed))
    finally:
        simulate.plan_week = real
    return key, seed, {k: s[k] for k in ("cost_per_job", "urgent_p90_remote", "urgent_p90_town", "harm_days_total", "jobs_done")}, stats


def simulation_quality(workers: int = 8) -> dict:
    for s in YEARS:                 # build each year's requests once, before the workers race to write them
        simulate.prepare_requests(seed=s)
    tasks = [(k, s) for s in YEARS for k in HEADLINE]
    with ProcessPoolExecutor(workers) as ex:
        res = list(ex.map(_year, tasks))
    years = {}
    stats = []
    for k, s, summ, st in res:
        years.setdefault(k, []).append(dict(year="main" if s is None else s, **summ))
        stats += st
    spread = {k: {m: dict(mean=float(np.mean([y[m] for y in v])), sd=float(np.std([y[m] for y in v])),
                          min=float(min(y[m] for y in v)), max=float(max(y[m] for y in v)))
                  for m in ("cost_per_job", "urgent_p90_remote", "harm_days_total")} for k, v in years.items()}
    by_year = lambda k: {y["year"]: y for y in years[k]}
    c, g, r = by_year("cheapest_1"), by_year("guarantee_0.2"), by_year("guarantee_0.2_h3")
    paired = dict(
        fault_days_cut_vs_cheapest=[1 - r[y]["harm_days_total"] / c[y]["harm_days_total"] for y in r],
        cost_rise_vs_cheapest=[r[y]["cost_per_job"] / c[y]["cost_per_job"] - 1 for y in r],
        cost_saved_by_sharing=[g[y]["cost_per_job"] - r[y]["cost_per_job"] for y in r],
        fault_days_cut_by_sharing=[1 - r[y]["harm_days_total"] / g[y]["harm_days_total"] for y in r])
    paired = {k: dict(values=[float(v) for v in vs], min=float(min(vs)), max=float(max(vs))) for k, vs in paired.items()}
    opt = np.array([s[0] for s in stats]); gap = np.array([s[1] for s in stats]); t = np.array([s[2] for s in stats])
    limit = params()["planning"]["solver_time_limit_s"]
    planner = dict(plans=int(len(stats)), optimal_share=float(opt.mean()), gap_median=float(np.median(gap)),
                   gap_p95=float(np.percentile(gap, 95)), gap_max=float(gap.max()), solve_median_s=float(np.median(t)),
                   solve_p95_s=float(np.percentile(t, 95)), time_limit_s=float(limit), hit_limit_share=float((t >= limit * 0.98).mean()))
    return dict(years=years, spread=spread, paired=paired, planner=planner)


def inclusion(n: int = 3000, seed: int = 21) -> dict:
    """Same household, two tellings: "full" names the baby, the crowding and the earlier call; "short" names only the
    fault (a tenant with little English, a relayed message, or someone who just wants it fixed). The fault is the same,
    so any gap in points comes from how the household was described. Answers to the standard questions are assumed
    true when given; a share (1 - intake_answer_rate) is left "unknown" at random."""
    T = params()["triage"]
    rng = np.random.default_rng(seed)
    w = synth.hazard_weights()
    hz, pw = list(w), np.array(list(w.values()))
    rate = T["intake_answer_rate"]
    rows = []
    for _ in range(n):
        h = hz[rng.choice(len(hz), p=pw)]
        v, c, r = rng.random() < 0.3, rng.random() < 0.35, rng.random() < 0.12      # as synth.request_stream, remote
        base = synth.make_report(h, rng, "heldout" if rng.random() < 0.3 else "train")
        extra = [synth.MODIFIER_PHRASES[k][rng.integers(len(synth.MODIFIER_PHRASES[k]))] for k, on in
                 (("vulnerable", v), ("crowded", c), ("repeat", r)) if on]
        # the household's true tier: Tier 1 if what they live with is life-preservation (a newborn, dialysis), else Tier 2
        t1 = bool(v and "tier1" in intake.modifier_hits(extra[0]))
        vkey = "tier1" if t1 else "vulnerable"
        full = ", ".join([base] + extra)
        bedrooms = int(rng.integers(2, 5))
        people = int(bedrooms * (rng.uniform(2.1, 4) if c else rng.uniform(0.5, 2)))
        which = (rng.choice(list(intake.TIER1_QUESTIONS)) if t1 else intake.TIER2_QUESTIONS[0]) if v else None
        answers = {q: ("unknown" if rng.random() > rate else ("yes" if q == which else "no")) for q in intake.VULNERABLE_QUESTIONS}
        answers["before"] = "unknown" if rng.random() > rate else ("yes" if r else "no")
        record, history = dict(people=people, bedrooms=bedrooms), dict(same_fault_open_or_recent=bool(r and rng.random() < rate))
        true = urgency.score(h, {k: 1 for k, on in ((vkey, v), ("crowded", c), ("repeat", r)) if on}).total
        out = dict(true=true, v=v, c=c, r=r)
        for tell, text in (("full", full), ("short", base)):
            words = {k: x for k, x in intake.modifier_hits(text).items() if k in ("tier1", "vulnerable", "crowded", "repeat")}
            mods, _, _ = intake.household(words, answers, record, history)
            for m, mm in (("words", words), ("intake", mods)):
                out[f"{tell}_{m}"] = urgency.score(h, {k: 1 for k in mm}).total
                out[f"{tell}_{m}_vulnerable"] = "vulnerable" in mm or "tier1" in mm
        rows.append(out)
    import pandas as pd
    d = pd.DataFrame(rows)
    has = (d.v | d.c | d.r).to_numpy()
    res = {}
    for m in ("words", "intake"):
        gap = (d[f"full_{m}"] - d[f"short_{m}"]).to_numpy()
        pos = pd.concat([d[f"full_{m}"], d[f"short_{m}"]]).rank(ascending=False, pct=True).to_numpy()
        lost = pos[n:] - pos[:n]               # how much further down one shared queue the short telling sits (share of queue)
        res[m] = dict(gap_mean=float(gap[has].mean()), gap_max=int(gap.max()), short_ranked_lower=float((gap[has] > 0).mean()),
                      queue_places_lost_pct=float(lost[has].mean() * 100),
                      short_points_missed=float((d.true - d[f"short_{m}"]).to_numpy()[has].mean()),
                      vulnerable_recognised_short=float(d.loc[d.v, f"short_{m}_vulnerable"].mean()),
                      vulnerable_recognised_full=float(d.loc[d.v, f"full_{m}_vulnerable"].mean()))
    res.update(n=n, households_with_something_to_say=float(has.mean()), answer_rate=rate,
               note="Synthetic households. Answers are assumed true when given; unanswered questions earn no points.")
    return res


def build() -> dict:
    return dict(reader=reader_quality(), simulation=simulation_quality())
