"""Bundle an offline satellite basemap for the prototype.

Source: Digital Earth Australia, Landsat 8/9 annual geomedian 2024 (ga_ls8cls9c_gm_cyear_3), Geoscience Australia, CC BY 4.0,
served by the DEA OWS WMS. Fetches web-mercator z9 tiles for the NT (and z10 around the Katherine hub), builds z5-z8 by
downsampling, and writes web/tiles/dea_z{z}.js files that hold the tiles as base64 JPEG for MapLibre's custom protocol.
The live map uses Esri World Imagery when there is internet; these tiles are the offline and published fallback.
"""
from __future__ import annotations

import base64
import io
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "dea_tiles"
OUT = ROOT / "web" / "tiles"
NT = (128.9, -26.1, 138.2, -10.8)
KATHERINE = (129.6, -18.7, 135.7, -13.0)
SEA = (14, 30, 44)
URL = ("https://ows.dea.ga.gov.au/?service=WMS&version=1.3.0&request=GetMap&layers=ga_ls8cls9c_gm_cyear_3&styles=simple_rgb"
       "&crs=EPSG:3857&bbox={0},{1},{2},{3}&width=256&height=256&format=image/png&time=2024-01-01")


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_bbox(z, x, y):
    n, R = 2 ** z, 6378137

    def merc(xx, yy):
        lon = xx / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
        return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    a, b = merc(x, y + 1), merc(x + 1, y)
    return a[0], a[1], b[0], b[1]


def tiles_for(bbox, z):
    x0, y0 = tile_xy(bbox[3], bbox[0], z)
    x1, y1 = tile_xy(bbox[1], bbox[2], z)
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def fetch(t):
    z, x, y = t
    p = CACHE / f"{z}_{x}_{y}.png"
    if p.exists() and p.stat().st_size > 2000:
        return t, p
    for _ in range(3):
        try:
            r = requests.get(URL.format(*[f"{v:.3f}" for v in tile_bbox(z, x, y)]), timeout=120)
            if r.ok and r.headers.get("content-type", "").startswith("image"):
                p.write_bytes(r.content)
                return t, p
        except requests.RequestException:
            pass
    return t, None


def to_rgb(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, SEA + (255,))
    bg.alpha_composite(img)
    return bg.convert("RGB")


def jpeg_b64(img: Image.Image, q=72) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
    return base64.b64encode(buf.getvalue()).decode()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = tiles_for(NT, 9) + tiles_for(KATHERINE, 10)
    print("fetching", len(jobs), "tiles")
    with ThreadPoolExecutor(8) as ex:
        got = dict(ex.map(fetch, jobs))
    missing = [t for t, p in got.items() if p is None]
    print("missing", len(missing))
    imgs = {t: to_rgb(Image.open(p)) for t, p in got.items() if p is not None}
    levels = {9: {k: v for k, v in imgs.items() if k[0] == 9}, 10: {k: v for k, v in imgs.items() if k[0] == 10}}
    for z in range(8, 4, -1):          # build lower zooms by 2x2 downsampling
        child = levels[z + 1]
        parents = {(z, x // 2, y // 2) for (_, x, y) in child}
        lvl = {}
        for (_, px, py) in parents:
            canvas = Image.new("RGB", (512, 512), SEA)
            for dx in (0, 1):
                for dy in (0, 1):
                    c = child.get((z + 1, px * 2 + dx, py * 2 + dy))
                    if c:
                        canvas.paste(c, (dx * 256, dy * 256))
            lvl[(z, px, py)] = canvas.resize((256, 256), Image.LANCZOS)
        levels[z] = lvl
    meta = {}
    for z, lvl in levels.items():
        data = {f"{x}/{y}": jpeg_b64(im, 70 if z >= 9 else 78) for (_, x, y), im in lvl.items()}
        js = f"window.DEA_TILES=window.DEA_TILES||{{}};window.DEA_TILES[{z}]=" + json.dumps(data, separators=(",", ":")) + ";\n"
        (OUT / f"dea_z{z}.js").write_text(js)
        meta[z] = dict(tiles=len(data), mb=round(len(js) / 1e6, 2))
    # merge z5-z8 into one file to keep the file count low
    small = "".join((OUT / f"dea_z{z}.js").read_text() for z in (5, 6, 7, 8))
    (OUT / "dea_z5_8.js").write_text(small)
    for z in (5, 6, 7, 8):
        (OUT / f"dea_z{z}.js").unlink()
    (OUT / "ATTRIBUTION.txt").write_text("Digital Earth Australia, Landsat 8/9 annual geomedian 2024 (ga_ls8cls9c_gm_cyear_3). "
                                        "Geoscience Australia, CC BY 4.0. https://www.dea.ga.gov.au\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
