"""Google Earth Engine exports for ReachNT (optional). Needs your own Earth Engine account and a Cloud project.

    pip install earthengine-api
    earthengine authenticate
    python scripts/gee_satellite.py --project YOUR_CLOUD_PROJECT --bucket YOUR_PUBLIC_BUCKET

What it does
1. basemap: a cloud-free Sentinel-2 dry-season mosaic of the NT, exported once as map tiles to your Cloud Storage
   bucket. Set the printed URL as SAT_TILE_URL in Vercel. The portal then loads tiles straight from the bucket:
   no Earth Engine call, no key and no token at run time, and the tiles can be cached on phones for offline use.
2. wet: for each community, how much of the land within 15 km was under water in each wet-season month
   (Sentinel-1 radar sees through cloud). This is evidence for the access calendar, which today relies on the
   NT road-restriction register plus an assumed share of cut weeks.

Sentinel-2 is 10 m per pixel: good for the territory and community views, not sharp enough to see one house.
For house-level zoom keep Esri or MapTiler (30-50 cm imagery). Earth Engine is free for research and
non-commercial use; operational government use may need a commercial Earth Engine licence.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NT = [128.9, -26.1, 138.2, -10.8]


def basemap(ee, bucket: str, prefix: str = "reachnt/s2"):
    region = ee.Geometry.Rectangle(NT)

    def mask(img):
        scl = img.select("SCL")
        clear = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
        return img.updateMask(clear)

    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(region)
          .filterDate("2025-05-01", "2025-09-30").filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30)).map(mask))
    rgb = s2.median().select(["B4", "B3", "B2"]).visualize(min=200, max=2600, gamma=1.25)
    task = ee.batch.Export.map.toCloudStorage(image=rgb, description="reachnt_s2_basemap", bucket=bucket, path=prefix,
                                             fileFormat="jpg", minZoom=4, maxZoom=14, region=region, writePublicTiles=True,
                                             skipEmptyTiles=True)
    task.start()
    url = f"https://storage.googleapis.com/{bucket}/{prefix}/{{z}}/{{x}}/{{y}}"
    print("Started basemap export. When it finishes, set SAT_TILE_URL =", url)


def wet(ee, out=ROOT / "data" / "processed" / "wet_season_water.csv"):
    import pandas as pd
    com = pd.read_csv(ROOT / "data" / "processed" / "communities.csv")
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([r.lon, r.lat]).buffer(15000), {"cid": r.cid}) for r in com.itertuples()])
    rows = []
    for year, month in [(2025, 12), (2026, 1), (2026, 2), (2026, 3), (2026, 4)]:
        start = ee.Date.fromYMD(year, month, 1)
        s1 = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(fc).filterDate(start, start.advance(1, "month"))
              .filter(ee.Filter.eq("instrumentMode", "IW")).select("VV"))
        water = s1.median().lt(-16).rename("water")            # smooth open water returns very little radar signal
        stats = water.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=30).getInfo()
        for f in stats["features"]:
            rows.append(dict(cid=f["properties"]["cid"], month=f"{year}-{month:02d}", water_share=f["properties"].get("mean")))
    pd.DataFrame(rows).to_csv(out, index=False)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--bucket", help="public Cloud Storage bucket for the basemap tiles")
    ap.add_argument("--only", choices=["basemap", "wet"])
    a = ap.parse_args()
    import ee
    ee.Initialize(project=a.project)
    if a.only in (None, "basemap") and a.bucket:
        basemap(ee, a.bucket)
    if a.only in (None, "wet"):
        wet(ee)


if __name__ == "__main__":
    main()
