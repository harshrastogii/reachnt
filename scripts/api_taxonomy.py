"""Write the fault list the server function and the database check against, from config/taxonomy.yaml and config/params.yaml.

    python scripts/api_taxonomy.py           # write web/api/_taxonomy.js and the ops.hazard rows in docs/schema.sql
    python scripts/api_taxonomy.py --check   # exit 1 if either is out of date (for CI)

web/api/_taxonomy.js: hazard id -> FS17 category and trade, plus the lifeline faults (triage.lifeline_faults) that are
Immediate for a Tier 1 household. Vercel bundles only files inside web/api with a function, so the API cannot read the
YAML at run time; this module is the copy it imports (the same way _warnings_snapshot.js is bundled).
docs/schema.sql: the rows between "-- BEGIN hazards" and "-- END hazards" fill ops.hazard, which ops.job and
ops.urgency_check reference, so the database refuses a fault id the taxonomy doesn't have.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "web" / "api" / "_taxonomy.js"
SQL = ROOT / "docs" / "schema.sql"
BLOCK = re.compile(r"(-- BEGIN hazards[^\n]*\n)(.*?)(-- END hazards)", re.S)


def load() -> tuple[dict, list[str]]:
    hazards = yaml.safe_load((ROOT / "config" / "taxonomy.yaml").read_text())["hazards"]
    lifeline = list(yaml.safe_load((ROOT / "config" / "params.yaml").read_text())["triage"]["lifeline_faults"])
    missing = [h for h in lifeline if h not in hazards]
    if missing:
        sys.exit(f"triage.lifeline_faults names faults the taxonomy doesn't have: {missing}")
    return hazards, lifeline


def js(hazards: dict, lifeline: list[str]) -> str:
    cat = {k: v["category"] for k, v in hazards.items()}
    trade = {k: v["trade"] for k, v in hazards.items()}
    return ("// Written by scripts/api_taxonomy.py from config/taxonomy.yaml and config/params.yaml. Do not edit by hand.\n"
            "// Files starting with \"_\" are not routes on Vercel; sync.js imports this to check fault ids and categories.\n"
            f"export const CATEGORY = {json.dumps(cat, indent=1)};\n"
            f"export const TRADE = {json.dumps(trade, indent=1)};\n"
            "// A Tier 1 household (life-preservation) losing one of these is Immediate, whatever the fault's own category.\n"
            f"export const LIFELINE = {json.dumps(lifeline)};\n")


def sql_rows(hazards: dict, lifeline: list[str]) -> str:
    rows = [f"  ('{k}', '{v['category']}', '{v['trade']}', {'true' if k in lifeline else 'false'})" for k, v in hazards.items()]
    return "INSERT INTO ops.hazard (hazard_id, category, trade, lifeline) VALUES\n" + ",\n".join(rows) + ";\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="only check that both outputs are up to date")
    args = ap.parse_args()
    hazards, lifeline = load()
    want_js = js(hazards, lifeline)
    sql = SQL.read_text()
    m = BLOCK.search(sql)
    if not m:
        sys.exit(f"{SQL} has no '-- BEGIN hazards' ... '-- END hazards' block")
    want_sql = sql[:m.start(2)] + sql_rows(hazards, lifeline) + sql[m.end(2):]
    stale = [p for p, want, have in ((JS, want_js, JS.read_text() if JS.exists() else ""), (SQL, want_sql, sql)) if want != have]
    if args.check:
        for p in stale:
            print(f"out of date: {p.relative_to(ROOT)} (run python scripts/api_taxonomy.py)")
        return 1 if stale else 0
    JS.write_text(want_js)
    SQL.write_text(want_sql)
    print(f"wrote {JS.relative_to(ROOT)} ({len(hazards)} faults, lifeline {lifeline}) and the ops.hazard rows in {SQL.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
