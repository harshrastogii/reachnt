"""Shrink the deck's screenshots after build_deck.js: at most 1400 px on the long side, 256-colour PNG.
The full-size shots make an 18 MB deck; this brings it to about 3 MB with no visible change on a projector.

    python docs/deck/compress_media.py "docs/deck/DataChallenge_Team AIC015_Slides.pptx"
"""
import io
import shutil
import sys
import zipfile

from PIL import Image

path = sys.argv[1]
tmp = path + ".tmp"
with zipfile.ZipFile(path) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
    for item in src.infolist():
        data = src.read(item.filename)
        if item.filename.startswith("ppt/media/") and item.filename.endswith(".png"):
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((1400, 1400), Image.LANCZOS)
            buf = io.BytesIO()
            im.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(buf, "PNG", optimize=True)
            data = buf.getvalue()
        out.writestr(item, data)
shutil.move(tmp, path)
print("compressed", path)
