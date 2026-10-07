"""Score the report reader on real tenant reports, by language. See docs/REAL_LANGUAGE_TEST_PROTOCOL.md first.

    python scripts/evaluate_real_reports.py reports.csv            # writes reports_results.md next to the CSV

The CSV has one row per report, with no names, phone numbers or addresses:
    text            what the tenant said, as written down (or as transcribed and checked)
    true_hazard     the fault a person decided on, using the keys in config/taxonomy.yaml (e.g. toilet_blocked)
    language        e.g. English, Aboriginal English, Kriol, Yolngu Matha, Warlpiri, other
    reviewed_by     role of who labelled it, e.g. "AIS interpreter + housing officer"
Rows whose true_hazard is not in the taxonomy are listed separately: they are faults the reader has no word for yet.

It reports, for each language and overall: how many dangerous reports the whole system caught (labelled Immediate or
sent to a person), how many it labelled Immediate straight away, category accuracy, macro-F1, and the share sent to a
person. The pass mark for a pilot (agreed in the protocol) is that the system catches every dangerous report.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import f1_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from reachnt import intake, synth  # noqa: E402
from reachnt.config import taxonomy  # noqa: E402

REQUIRED = ["text", "true_hazard", "language"]
PII_HINTS = r"\b(?:04\d{2}\s?\d{3}\s?\d{3}|\d{2,4} [A-Z][a-z]+ (?:Street|St|Road|Rd|Avenue|Ave))\b"   # mobile numbers, street addresses


def main(path: str) -> None:
    H = taxonomy()["hazards"]
    df = pd.read_csv(path)
    missing = [c for c in REQUIRED if c not in df]
    if missing:
        sys.exit(f"Missing columns: {', '.join(missing)}")
    pii = df.text.str.contains(PII_HINTS, regex=True, na=False)
    if pii.any():
        sys.exit(f"{int(pii.sum())} rows look like they contain a phone number or street address. Remove them first (rows {list(df.index[pii][:10])}).")
    unknown = df[~df.true_hazard.isin(H.keys())]
    df = df[df.true_hazard.isin(H.keys())].copy()
    tr = synth.labelled_corpus(60, "train", 1)
    clf = intake.Classifier().fit(tr.text, tr.hazard)
    reads = [intake.read(t, clf) for t in df.text]
    cat = lambda h: H[h]["category"] if h else "routine"
    df["true_cat"] = df.true_hazard.map(cat)
    df["read_cat"] = [cat(r.hazard) for r in reads]
    df["to_person"] = [r.needs_human for r in reads]
    df["danger"] = df.true_cat == "immediate"
    df["caught"] = (df.read_cat == "immediate") | df.to_person

    def row(g, name):
        d = g[g.danger]
        return dict(language=name, reports=len(g), dangerous=int(d.danger.sum()),
                    caught=f"{int(d.caught.sum())} of {len(d)}" if len(d) else "-",
                    straight_away=f"{int((d.read_cat == 'immediate').sum())} of {len(d)}" if len(d) else "-",
                    category_right=f"{(g.read_cat == g.true_cat).mean():.0%}",
                    macro_f1=f"{f1_score(g.true_cat, g.read_cat, average='macro', labels=['immediate', 'urgent', 'routine'], zero_division=0):.2f}",
                    to_person=f"{g.to_person.mean():.0%}")
    out = pd.DataFrame([row(g, lang) for lang, g in df.groupby("language")] + [row(df, "All")])
    missed = df[df.danger & ~df.caught]
    table = ["| " + " | ".join(out.columns) + " |", "|" + "---|" * len(out.columns)] + \
            ["| " + " | ".join(str(v) for v in r) + " |" for r in out.itertuples(index=False)]
    lines = ["# Reader on real reports", "", f"Source: {Path(path).name}, {len(df)} reports scored.", ""] + table + [""]
    lines += ["## Dangerous reports the system missed (the pass mark is none)", ""] + (
        [f"- [{r.language}] \"{r.text}\" (read as {r.read_cat}, should be {r.true_hazard})" for r in missed.itertuples()] or ["None."])
    lines += ["", "## Faults with no category yet", ""] + (
        [f"- [{r.language}] \"{r.text}\" (labelled {r.true_hazard})" for r in unknown.itertuples()] or ["None."])
    dest = Path(path).with_name(Path(path).stem + "_results.md")
    dest.write_text("\n".join(lines) + "\n")
    print(out.to_string(index=False))
    print(f"\n{len(missed)} dangerous reports missed. Full results: {dest}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
