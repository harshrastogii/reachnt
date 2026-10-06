"""Make a publishable copy of the ReachNT portal in outputs/artifact/.

The publisher wraps the page in its own <html>/<head>/<body>, so the copy drops those tags and the cache-busting
query strings. Supporting files (styles, script, data, bundled satellite tiles, offline library copies) are copied
alongside under the same relative paths."""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = ROOT / "outputs" / "artifact"
if OUT.exists():
    shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True, exist_ok=True)
src = (WEB / "index.html").read_text()
head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", src, re.S).group(1)
head = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", head)
page = re.sub(r"\?v=\d+", "", head.strip() + "\n" + body.strip() + "\n")
(OUT / "index.html").write_text(page)
files = ["styles.css", "app.js", "data/app.js", "tiles/dea_z5_8.js", "tiles/dea_z9.js", "tiles/dea_z10.js",
         "vendor/maplibre-gl.css", "vendor/maplibre-gl.js", "vendor/h3-js.umd.js"]
for f in files:
    (OUT / f).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(WEB / f, OUT / f)
print("wrote", OUT, sum((OUT / f).stat().st_size for f in files) // 1_000_000, "MB of supporting files")
