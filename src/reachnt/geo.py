"""Geography: the 70 remote communities, the five crew hubs, travel and access.

Inputs (all public):
  data/processed/niaa_communities.csv   NIAA/PwC-IC 2023 review, Appendix B (houses estimated)
  data/raw/ntg_places_underlink.csv     NTG 2021 remote communities list with distance to sealed road
  data/raw/ourairports.csv              airstrips
  config/params.yaml                    hubs, closures from the NT restriction register, travel assumptions

Writes data/processed/communities.csv.
"""
from __future__ import annotations

import math
import zlib

import h3
import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process

from .config import PROCESSED, RAW, params


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def road_hours(straight_km: float) -> float:
    """One-way driving hours at a blended road speed (see params.travel)."""
    T = params()["travel"]
    return straight_km * T["circuity"] / T["road_speed_kmh"]


def flight_hours(straight_km: float) -> float:
    return straight_km / params()["travel"]["flight_speed_kmh"]


def _match_places(names: pd.Series, places: pd.DataFrame) -> pd.DataFrame:
    pool = places[places.ntg_type.isin(["Major", "Minor", "Town", "Village", "City"])].reset_index(drop=True)
    rows = []
    for n in names:
        q = n.split("(")[0].strip().title()
        alt = n.split("(")[1].rstrip(")").title() if "(" in n else None
        best = process.extractOne(q, pool.name.tolist(), scorer=fuzz.WRatio)
        if alt:
            b2 = process.extractOne(alt, pool.name.tolist(), scorer=fuzz.WRatio)
            best = max(best, b2, key=lambda x: x[1])
        hit = pool.iloc[best[2]]
        rows.append(dict(community=n, ntg_name=hit["name"], match_score=round(best[1], 1), lat=hit.lat, lon=hit.lon,
                         dist_sealed_km=hit.dist_sealed_km, ntg_type=hit.ntg_type, land_council=hit.land_council,
                         population_2020=hit.population_2020))
    return pd.DataFrame(rows)


def build_communities() -> pd.DataFrame:
    P = params()
    c = pd.read_csv(PROCESSED / "niaa_communities.csv")
    places = pd.read_csv(RAW / "ntg_places_underlink.csv")
    m = _match_places(c.community, places)
    df = c.merge(m, on="community")
    assert (df.match_score >= 85).all(), df[df.match_score < 85]

    hubs = P["hubs"]
    islands = set(P["islands"])
    df["island"] = df.community.isin(islands)

    # nearest hub by one-way travel hours (road for mainland, flight for islands)
    best_hub, best_h, best_km = [], [], []
    for r in df.itertuples():
        opts = []
        for h, v in hubs.items():
            km = float(haversine_km(r.lat, r.lon, v["lat"], v["lon"]))
            hrs = flight_hours(km) if r.island else road_hours(km)
            opts.append((hrs, h, km))
        hrs, h, km = min(opts)
        best_hub.append(h); best_h.append(hrs); best_km.append(km)
    df["hub"], df["oneway_hours"], df["straight_km"] = best_hub, best_h, best_km
    df["road_km"] = np.where(df.island, np.nan, df.straight_km * P["travel"]["circuity"])

    # airstrip within radius (fly-in option when the road is cut)
    air = pd.read_csv(RAW / "ourairports.csv")
    air = air[(air.iso_region == "AU-NT") & air.type.isin(["small_airport", "medium_airport", "large_airport"])]
    d = haversine_km(df.lat.values[:, None], df.lon.values[:, None], air.latitude_deg.values[None, :], air.longitude_deg.values[None, :])
    df["airstrip_km"] = d.min(axis=1).round(1)
    df["airstrip"] = air.name.values[d.argmin(axis=1)]
    # every inhabited island community has an airstrip; Umbakumba's is missing from OurAirports (ASSUMPTION)
    df["has_airstrip"] = (df.airstrip_km <= P["travel"]["airstrip_radius_km"]) | df.island
    df["flight_hours_oneway"] = [flight_hours(float(haversine_km(r.lat, r.lon, hubs[r.hub]["lat"], hubs[r.hub]["lon"]))) for r in df.itertuples()]

    # access
    A = P["access"]
    reg = A["register_closures"]
    df["closure_road"] = df.community.map(lambda n: reg.get(n, {}).get("road", ""))
    df["closure_months"] = df.community.map(lambda n: ",".join(str(m) for m in reg.get(n, {}).get("months", [])))
    df["wet_risk"] = (~df.island) & (df.oneway_hours > A["wet_min_hours"]) & (df.lat > A["wet_lat_north_of"]) & (df.closure_road == "")

    # bands (Nous 2017 thresholds on one-way travel from the regional centre)
    T = P["travel"]
    def band(r):
        if r.island:
            return "Island (fly-in)"
        if r.closure_road or r.wet_risk:
            return "Remote, cut in the wet"
        if r.oneway_hours > T["very_remote_band_hours"]:
            return "Very remote (road)"
        if r.oneway_hours > T["remote_band_hours"]:
            return "Remote (road)"
        return "Near town (road)"
    df["band"] = df.apply(band, axis=1)
    df = df.sort_values(["hub", "oneway_hours"]).reset_index(drop=True)
    df["cid"] = [f"C{i:02d}" for i in range(len(df))]
    for res in (3, 4, 5, 6, 7):
        df[f"h3_r{res}"] = [h3.latlng_to_cell(a, b, res) for a, b in zip(df.lat, df.lon)]
    df.to_csv(PROCESSED / "communities.csv", index=False)
    return df


def run_pairs(com: pd.DataFrame) -> pd.DataFrame:
    """Pairs of communities served by the same hub whose H3 run-resolution cells are within run_k rings.

    One tradesperson can do both in one trip: hub -> A -> B -> hub."""
    H = params()["h3"]
    col = f"h3_r{H['run_res']}"
    rows = []
    for hub, g in com.groupby("hub"):
        g = g.reset_index(drop=True)
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                a, b = g.iloc[i], g.iloc[j]
                try:
                    d = h3.grid_distance(a[col], b[col])
                except Exception:
                    continue
                if d <= H["run_k"]:
                    km = h3.great_circle_distance((a.lat, a.lon), (b.lat, b.lon), unit="km")
                    rows.append(dict(hub=hub, a=a.cid, b=b.cid, grid_distance=d, km=km))
    return pd.DataFrame(rows)


def house_cell(site: str, house_no: int, centre: tuple[float, float], town: bool, building_cells: list[str] | None = None) -> str:
    """A synthetic house's H3 cell, fixed for that house.

    When enough OpenStreetMap buildings are mapped (scripts/osm_settlements.py), the house goes on a cell that
    contains a building; otherwise on a cell within a few rings of the settlement point. Real houses would be
    indexed from the asset register; the address stays in the PII vault."""
    H = params()["h3"]
    rng = np.random.default_rng(zlib.crc32(site.encode()) + house_no)
    if building_cells and len(building_cells) >= H["min_building_cells"]:
        cells = sorted(building_cells)
        return cells[int(rng.integers(len(cells)))]
    c = h3.latlng_to_cell(centre[0], centre[1], H["house_res"])
    disk = sorted(h3.grid_disk(c, H["town_ring_k"] if town else H["house_ring_k"]))
    return disk[int(rng.integers(len(disk)))]


def load_communities() -> pd.DataFrame:
    path = PROCESSED / "communities.csv"
    return pd.read_csv(path) if path.exists() else build_communities()


def road_open(row, month: int, week_index: int, rng: np.random.Generator | None = None) -> bool:
    """Is the community reachable by road this week? Islands never are.

    Register closures are certain for their months; other unsealed Top End access is cut on a share of
    wet-season weeks (an assumption, drawn once per community-week from a seeded generator)."""
    if bool(row["island"]):
        return False
    months = [int(m) for m in str(row["closure_months"]).split(",") if m and m != "nan"]
    if month in months:
        return False
    A = params()["access"]
    if bool(row["wet_risk"]) and month in A["wet_months"]:
        g = rng if rng is not None else np.random.default_rng(hash((row["cid"], week_index)) % 2**32)
        return g.random() > A["wet_cut_week_share"]
    return True


if __name__ == "__main__":
    d = build_communities()
    print(d.groupby(["hub", "band"]).agg(communities=("community", "count"), houses=("houses_est", "sum")))
