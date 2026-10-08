"""Save a snapshot of roads and weather for the portal's "Roads and weather now" prompts.

The portal's server function (web/api/warnings.js) reads both feeds live. This snapshot is what it shows when a feed
can't be reached (and what the portal shows when served without the function, e.g. from a plain web server).

    python scripts/warnings_snapshot.py --weather-db ../terraiq/nt_weather.db     # from TerraIQ's collector database
    python scripts/warnings_snapshot.py --live                                     # fetch both feeds now

Roads: NT Road Report obstructions (roadreport.nt.gov.au/api/Obstruction/GetAll), read only. Saved copy in
data/raw/roadreport_live.json. Weather: Bureau of Meteorology station observations (IDD60801), fetched the way
TerraIQ's collector does: one JSON per station, with a User-Agent whose contact field is empty (BoM refused a
filled-in contact string when TerraIQ tested it on 10 Jul 2026).
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from reachnt.geo import load_communities  # noqa: E402

HUB = "Katherine"
ROADS_URL = "https://roadreport.nt.gov.au/api/Obstruction/GetAll"
BOM_URL = "http://www.bom.gov.au/fwo/IDD60801/IDD60801.{wmo}.json"
UA = "ReachNT/1.0 (data collection; contact: )"


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def roads(payload: dict) -> list[dict]:
    """Closures and flooding only: what changes whether a trip can go."""
    out = []
    for x in payload.get("response", []):
        kind = f"{x.get('restrictionType') or ''} {x.get('obstructionType') or ''}"
        if x.get("status") == "CURRENT" and any(w in kind.lower() for w in ("closed", "impassable", "flood")):
            out.append(dict(road=x.get("roadName"), restriction=x.get("restrictionType"), type=x.get("obstructionType"),
                            where=x.get("locationComment"), comment=(x.get("comment") or "")[:240],
                            start=x.get("startPoint"), end=x.get("endPoint"), updated=x.get("dateLastUpdated")))
    return out


def stations_near_hub(all_stations: dict[int, tuple[str, float, float]], per_community: int = 1) -> list[dict]:
    com = load_communities()
    com = com[com.hub == HUB]
    picked = {}
    for r in com.itertuples():
        near = sorted(all_stations.items(), key=lambda kv: km((r.lat, r.lon), kv[1][1:]))[:per_community]
        for wmo, (name, lat, lon) in near:
            picked[wmo] = dict(wmo=wmo, station=name, lat=lat, lon=lon)
    return sorted(picked.values(), key=lambda d: d["wmo"])


def from_db(path: str) -> tuple[list[dict], list[dict]]:
    db = sqlite3.connect(path)
    rows = db.execute("""SELECT o.wmo, o.station, o.lat, o.lon, o.local_time, o.air_temp, o.apparent_t, o.rain_trace
                         FROM obs o JOIN (SELECT wmo, MAX(local_time) t FROM obs GROUP BY wmo) m ON o.wmo = m.wmo AND o.local_time = m.t""").fetchall()
    allst = {r[0]: (r[1], r[2], r[3]) for r in rows if r[2] is not None}
    chosen = stations_near_hub(allst)
    latest = {r[0]: r for r in rows}
    obs = []
    for s in chosen:
        r = latest[s["wmo"]]
        obs.append(dict(s, time=r[4], air_temp=r[5], apparent_t=r[6], rain_since_9am=float(r[7] or 0)))
    return chosen, obs


def from_live(stations: list[dict]) -> list[dict]:
    obs = []
    for s in stations:
        req = urllib.request.Request(BOM_URL.format(wmo=s["wmo"]), headers={"User-Agent": UA})
        d = json.loads(urllib.request.urlopen(req, timeout=30).read())["observations"]["data"][0]
        obs.append(dict(s, time=d.get("local_date_time_full"), air_temp=d.get("air_temp"), apparent_t=d.get("apparent_t"),
                        rain_since_9am=float(d.get("rain_trace") or 0)))
    return obs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weather-db", help="TerraIQ's nt_weather.db (latest observation per station)")
    ap.add_argument("--live", action="store_true", help="fetch both feeds now")
    a = ap.parse_args()
    out_path = ROOT / "web" / "data" / "warnings_snapshot.json"
    old = json.loads(out_path.read_text()) if out_path.exists() else {}
    if a.live:
        req = urllib.request.Request(ROADS_URL, headers={"User-Agent": UA})
        road_payload = json.loads(urllib.request.urlopen(req, timeout=30).read())
        stations = old.get("stations") or []
        weather = from_live(stations)
    else:
        road_payload = json.loads((ROOT / "data" / "raw" / "roadreport_live.json").read_text())
        stations, weather = from_db(a.weather_db) if a.weather_db else (old.get("stations", []), old.get("weather", []))
    snap = dict(source="snapshot", roads_note="NT Road Report (NTG), read only", weather_note="Bureau of Meteorology station observations",
                roads_saved=max((x.get("dateLastUpdated") or "" for x in road_payload.get("response", [])), default=""),
                weather_saved=max((w.get("time") or "" for w in weather), default=""),
                stations=stations, roads=roads(road_payload), weather=weather)
    out_path.write_text(json.dumps(snap, indent=1))
    print(f"wrote {out_path.relative_to(ROOT)}: {len(snap['roads'])} closures, {len(weather)} stations")


if __name__ == "__main__":
    main()
