"""Read a free-text fault report.

Two readers, combined:
  1. Rules: the hazard phrases in config/taxonomy.yaml (shared with the web prototype). Every match is a
     quotable phrase, so the explanation can say "you wrote 'sparking'".
  2. A TF-IDF + logistic regression model trained on synthetic reports. It catches wording the rules miss.

If the two disagree on category, or the model is unsure and no rule fired, the report goes to a person
(`needs_human`). A person also confirms every Immediate job by phone before a trade is sent.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline

from .config import params, taxonomy

CAT_RANK = {"immediate": 0, "urgent": 1, "routine": 2}


def _compile():
    T = taxonomy()
    hz = {k: [re.compile(p) for p in v["patterns"]] for k, v in T["hazards"].items()}
    mods = {k: [re.compile(p) for p in v["patterns"]] for k, v in T["modifiers"].items()}
    return hz, mods


_HZ, _MODS = _compile()


def normalise(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[’`]", "'", t)
    t = re.sub(r"\bpls\b|\bplz\b", "please", t)
    t = re.sub(r"\bu\b", "you", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def rule_hits(text: str) -> dict[str, str]:
    """hazard -> the phrase that matched."""
    t = normalise(text)
    hits = {}
    for k, pats in _HZ.items():
        for p in pats:
            m = p.search(t)
            if m:
                hits[k] = m.group(0)
                break
    return hits


def modifier_hits(text: str) -> dict[str, str]:
    t = normalise(text)
    out = {}
    for k, pats in _MODS.items():
        for p in pats:
            m = p.search(t)
            if m:
                out[k] = m.group(0)
                break
    return out


def most_severe(hazards) -> str | None:
    H = taxonomy()["hazards"]
    hs = list(hazards)
    if not hs:
        return None
    return min(hs, key=lambda k: (CAT_RANK[H[k]["category"]], -H[k]["harm"]))


class Classifier:
    def __init__(self):
        self.pipe = Pipeline([
            ("feats", FeatureUnion([
                ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
                ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True)),
            ])),
            ("lr", LogisticRegression(max_iter=2000, C=6.0)),
        ])

    def fit(self, texts, labels):
        self.pipe.fit([normalise(t) for t in texts], labels)
        return self

    def predict_proba(self, text: str) -> tuple[str, float]:
        p = self.pipe.predict_proba([normalise(text)])[0]
        i = int(np.argmax(p))
        return self.pipe.classes_[i], float(p[i])

    def probs(self, text: str) -> dict[str, float]:
        p = self.pipe.predict_proba([normalise(text)])[0]
        return dict(zip(self.pipe.classes_, map(float, p)))


@dataclass
class Reading:
    text: str
    hazard: str | None
    hazards: list[str]
    phrases: dict[str, str]
    model_hazard: str | None
    model_conf: float
    modifiers: dict[str, str]
    source: str                       # "rules", "model", "rules+model", "none"
    needs_human: bool
    reasons: list[str] = field(default_factory=list)


def read(text: str, clf: Classifier | None) -> Reading:
    """Combine rules and model. Asymmetric on purpose: when in doubt about danger, ask a person."""
    H = taxonomy()["hazards"]
    thr = params()["triage"]["confidence_threshold"]
    hits = rule_hits(text)
    mods = modifier_hits(text)
    danger_word = mods.pop("danger_words", None)
    probs = clf.probs(text) if clf else {}
    mh, mc = (max(probs, key=probs.get), max(probs.values())) if probs else (None, 0.0)
    p_immediate = sum(p for k, p in probs.items() if H[k]["category"] == "immediate")
    reasons: list[str] = []
    rule_primary = most_severe(hits)
    candidates = [h for h in (rule_primary, mh if mc >= thr else None) if h]
    primary = most_severe(candidates) if candidates else mh
    source = ("rules+model" if rule_primary and mh == primary and mc >= thr else
              "rules" if rule_primary and primary == rule_primary else
              "model" if primary == mh and mc >= thr else "none")
    needs_human = False
    if not rule_primary and mc < thr:
        needs_human = True
        reasons.append("We could not read this report with confidence. A person will call back.")
    elif rule_primary and mc >= thr and H[mh]["category"] != H[rule_primary]["category"]:
        needs_human = True
        reasons.append(f"The phrases and the model disagree ('{H[rule_primary]['label']}' vs '{H[mh]['label']}'). A person will check.")
    if primary and H[primary]["category"] != "immediate":
        if p_immediate >= 0.25:
            needs_human = True
            reasons.append("This might be dangerous. A person will call to check today.")
        elif danger_word:
            needs_human = True
            reasons.append(f"You wrote '{danger_word}'. A person will call to check it is safe.")
    if primary and H[primary]["category"] == "immediate" and "negation" in mods:
        # "no sparks, the power point just doesn't work": never downgrade danger on our own reading of a negation;
        # keep it Immediate and have a person confirm by phone
        needs_human = True
        reasons.append(f"You also wrote '{mods['negation']}'. A person will call to check whether it is still dangerous.")
    if source == "model":
        # no percentage: on unfamiliar wording the model's confidence runs ahead of its accuracy (evaluate.py, calibration)
        reasons.append(f"No listed phrase matched. The model's best guess is '{H[mh]['label']}'.")
    if primary and H[primary]["category"] == "immediate":
        reasons.append("Immediate jobs are confirmed by phone and made safe by the local Housing Maintenance Officer.")
    hazards = sorted(set(hits) | ({primary} if primary else set()), key=lambda k: (CAT_RANK[H[k]["category"]], -H[k]["harm"]))
    return Reading(text, primary, hazards, hits, mh, mc, mods, source, needs_human, reasons)
