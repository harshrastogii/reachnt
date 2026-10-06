"""Pick the tenant example shown on the deck from the prototype data (Katherine hub, wet-season week, cheapest-first)."""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
t = (ROOT / "web" / "data" / "app.js").read_text()
D = json.loads(t[t.index("{"): t.rstrip().rstrip(";").rindex("}") + 1])
rows = D["demo"]["cheapest_1"]["weeks"]["30"]
cands = [r for r in rows if r["site"] != "TOWN" and not r["done"] and r["category"] == "urgent"
         and any(x[1] == "travel_cost" for x in r["reasons"]) and len(r["short"]) < 120]
cands.sort(key=lambda r: -r["wait"])
r = cands[len(cands) // 3]
why = dict(r["sections"])
why = why.get("Why it is not fixed yet") or why.get("What held it up")
sents = re.split(r"(?<=\.) ", why)
keep = [x for x in sents if "no " in x.lower() and "sent" in x.lower() or "costs about" in x or "cost decision" in x or "signed" in x.lower()]
why = why.replace(r["place"], "your community")
keep = [k.replace(r["place"], "your community") for k in keep]
out = dict(id=r["id"], short=r["short"].replace(" Ask why", "\nAsk why"), why=" ".join(keep[:4]) or why)
(ROOT / "outputs" / "deck_example.json").write_text(json.dumps(out, indent=1))
print(out)
