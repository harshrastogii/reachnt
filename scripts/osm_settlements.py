"""Where each community's houses actually are, from OpenStreetMap. Used only to draw the portal's map.

The NT Government community list gives coordinates to two decimal places (about 1 km), which is fine for
planning trips but puts a zoomed-in house in the bush. This script finds, for each community:
  1. its map position: the OSM settlement point (place=*) with the same name within 6 km. One exception, found by
     checking satellite photos: when that point is more than 1.2 km from the densest cluster of mapped buildings
     and the cluster is within 1 km of the government point, the OSM point is the one that is wrong (Jilkminggan),
     so the cluster's centre is used;
  2. the H3 resolution-10 cells that contain at least one mapped OSM building within 1.5 km of that position.
     Example houses in the portal are drawn on these cells, so a household's hexagon lands where houses are.

The simulation, trip costs and every number in the report still use the NT Government coordinates.

    python scripts/osm_settlements.py        # writes data/processed/settlements_osm.csv and building_cells_osm.json

Data © OpenStreetMap contributors, ODbL 1.0. The two output files are derived from it and carry the same licence.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

import h3
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from reachnt.config import PROCESSED, params  # noqa: E402

OVERPASS = "https://overpass-api.de/api/interpreter"


def _overpass(query: str, tries: int = 5) -> list[dict]:
    """Overpass is a shared free service; busy moments return 429/504, so back off and retry."""
    for i in range(tries):
        req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": query}).encode(),
                                     headers={"User-Agent": "ReachNT (CDU IT Code Fair 2026)"})
        try:
            return json.load(urllib.request.urlopen(req, timeout=240))["elements"]
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(15 * (i + 1))


def _km(a, b, c, d):
    return 6371 * 2 * math.asin(math.sqrt(math.sin(math.radians(c - a) / 2) ** 2 + math.cos(math.radians(a)) * math.cos(math.radians(c))
                                          * math.sin(math.radians(d - b) / 2) ** 2))


def main() -> None:
    com = pd.read_csv(PROCESSED / "communities.csv")
    places = _overpass("[out:json][timeout:180];(" + "".join(f'node["place"](around:6000,{r.lat},{r.lon});' for r in com.itertuples()) + ");out;")
    norm = lambda s: re.sub(r"[^a-z]", "", str(s).lower())
    rows = []
    for r in com.itertuples():
        want = {norm(r.ntg_name), norm(r.community)}
        best = None
        for p in places:
            d = _km(r.lat, r.lon, p["lat"], p["lon"])
            names = [p["tags"].get(k, "") for k in ("name", "alt_name", "old_name", "official_name")]
            score = max((SequenceMatcher(None, norm(n), w).ratio() for n in names if n for w in want), default=0)
            if d <= 6 and (best is None or score > best[0]):
                best = (score, p, d)
        if best and best[0] >= 0.75:
            rows.append(dict(cid=r.cid, lat=round(best[1]["lat"], 5), lon=round(best[1]["lon"], 5), osm_name=best[1]["tags"].get("name", ""),
                             osm_place=best[1]["tags"].get("place", ""), shift_km=round(best[2], 2), source="osm"))
        else:
            rows.append(dict(cid=r.cid, lat=r.lat, lon=r.lon, osm_name="", osm_place="", shift_km=0.0, source="ntg"))
    S = pd.DataFrame(rows).set_index("cid")

    res = params()["h3"]["house_res"]
    pts = []
    for i in range(0, len(com), 10):      # ten communities per request keeps each query small
        part = com.iloc[i:i + 10]
        bld = _overpass("[out:json][timeout:120];(" + "".join(f'way["building"](around:3500,{r.lat},{r.lon});' for r in part.itertuples()) + ");out center;")
        pts += [(e["center"]["lat"], e["center"]["lon"]) for e in bld if "center" in e]
    pts = sorted(set(pts))
    cells = {}
    for r in com.itertuples():
        o = S.loc[r.cid]
        near = [(la, lo) for la, lo in pts if _km(r.lat, r.lon, la, lo) < 3.5 or _km(o.lat, o.lon, la, lo) < 3.5]
        if near:   # densest cluster: the res-8 cell (about 0.7 km2) whose neighbourhood holds the most buildings
            per = {}
            for la, lo in near:
                per.setdefault(h3.latlng_to_cell(la, lo, 8), []).append((la, lo))
            best = max(per, key=lambda c: sum(len(per.get(n, [])) for n in h3.grid_disk(c, 1)))
            cl = [p for n in h3.grid_disk(best, 1) for p in per.get(n, [])]
            cy, cx = sum(p[0] for p in cl) / len(cl), sum(p[1] for p in cl) / len(cl)
            if len(cl) >= 3 and _km(cy, cx, o.lat, o.lon) > 1.2 and _km(cy, cx, r.lat, r.lon) < 1.0:
                S.loc[r.cid, ["lat", "lon", "source"]] = [round(cy, 5), round(cx, 5), "osm buildings"]
                S.loc[r.cid, "shift_km"] = round(_km(r.lat, r.lon, cy, cx), 2)
        c = S.loc[r.cid]
        cells[r.cid] = sorted({h3.latlng_to_cell(la, lo, res) for la, lo in near if _km(c.lat, c.lon, la, lo) <= 1.5})
    S.reset_index().to_csv(PROCESSED / "settlements_osm.csv", index=False)
    (PROCESSED / "building_cells_osm.json").write_text(json.dumps(cells))
    print(f"{(S.source != 'ntg').sum()} of {len(S)} communities placed from OSM ({(S.source == 'osm buildings').sum()} on their building cluster) "
          f"(median shift {S.shift_km.median():.2f} km, largest {S.shift_km.max():.2f} km); "
          f"{sum(1 for v in cells.values() if v)} have mapped buildings, {len(pts)} buildings in all.")


if __name__ == "__main__":
    main()
