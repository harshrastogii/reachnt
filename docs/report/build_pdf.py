"""Render the challenge report PDF from reachnt_report.md with reportlab.

Organiser rules: A4, Arial, title 20 pt bold, section headings 14 pt bold, body 11 pt,
captions and references 10 pt, team number and page number in both the header
and the footer, continuous page numbering. Arial is embedded.

    python docs/report/build_pdf.py
"""
from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

import yaml
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = HERE / "reachnt_report.md"
def _team() -> str:
    """Team label from the report front matter, e.g. 'Team 12'. Edit it there, once."""
    fm = SRC.read_text().split("---", 2)[1]
    return yaml.safe_load(fm)["team"].replace("[", "").replace("]", "").strip()


TEAM = _team()
OUT = HERE / f"DataChallenge_{TEAM}_Report.pdf"   # organiser rule: DataChallenge_Team xx(number)_Report.pdf

FD = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("Arial", FD + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", FD + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", FD + "Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", FD + "Arial Bold Italic.ttf"))
pdfmetrics.registerFont(TTFont("CourierNew", FD + "Courier New.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic", boldItalic="Arial-BoldItalic")

INK = colors.HexColor("#1a1a1a"); MUTED = colors.HexColor("#555555"); ACCENT = colors.HexColor("#2a5b9a")
RULE = colors.HexColor("#bfc5cc"); HEAD_FILL = colors.HexColor("#e6edf5")
W, H = A4
MARGIN = 2.0 * cm
CONTENT_W = W - 2 * MARGIN

S = {
    "body": ParagraphStyle("body", fontName="Arial", fontSize=11, leading=13.8, textColor=INK, spaceAfter=5, alignment=TA_LEFT),
    "h1": ParagraphStyle("h1", fontName="Arial-Bold", fontSize=14, leading=17, textColor=INK, spaceBefore=10, spaceAfter=6, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=6, spaceAfter=3, keepWithNext=1),
    "cap": ParagraphStyle("cap", fontName="Arial", fontSize=10, leading=12.5, textColor=MUTED, spaceAfter=10),
    "tcap": ParagraphStyle("tcap", fontName="Arial", fontSize=10, leading=12.5, textColor=MUTED, spaceAfter=3, keepWithNext=1),
    "cell": ParagraphStyle("cell", fontName="Arial", fontSize=9, leading=10.8, textColor=INK),
    "cellh": ParagraphStyle("cellh", fontName="Arial-Bold", fontSize=9, leading=10.8, textColor=INK),
    "ref": ParagraphStyle("ref", fontName="Arial", fontSize=10, leading=12.5, textColor=INK, leftIndent=0.8 * cm, firstLineIndent=-0.8 * cm, spaceAfter=3),
    "num": ParagraphStyle("num", fontName="Arial", fontSize=11, leading=13.8, textColor=INK, leftIndent=0.7 * cm, firstLineIndent=-0.7 * cm, spaceAfter=4),
    "code": ParagraphStyle("code", fontName="Arial", fontSize=10, leading=12.5, textColor=INK),
    "title": ParagraphStyle("title", fontName="Arial-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=4),
    "subtitle": ParagraphStyle("subtitle", fontName="Arial-Bold", fontSize=14, leading=18, textColor=ACCENT, spaceAfter=24),
    "ack": ParagraphStyle("ack", fontName="Arial-Italic", fontSize=10, leading=13, textColor=MUTED),
}


def inline(text: str) -> str:
    """Escape XML, then turn **bold** into <b> and bare URLs into links."""
    t = escape(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(https?://[^\s<]+)", lambda m: f'<link href="{m.group(1)}" color="#2a5b9a">{m.group(1)}</link>', t)
    return t


def img(path: Path, width_cm: float) -> Image:
    im = Image(str(path))
    ratio = im.imageHeight / im.imageWidth
    im.drawWidth = width_cm * cm; im.drawHeight = width_cm * cm * ratio
    return im


def data_table(rows):
    ncol = len(rows[0])
    # Column widths proportional to the longest text in each column, within limits.
    lens = [max(len(r[c].strip()) for r in rows) for c in range(ncol)]
    lens = [min(max(l, 8), 70) for l in lens]
    widths = [CONTENT_W * l / sum(lens) for l in lens]
    body = [[Paragraph(inline(c.strip()), S["cellh"] if r == 0 else S["cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(body, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Arial"), ("GRID", (0, 0), (-1, -1), 0.4, RULE), ("BACKGROUND", (0, 0), (-1, 0), HEAD_FILL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def on_page(canvas, doc):
    """Header and footer: both carry the team number and the page number."""
    canvas.saveState()
    canvas.setFont("Arial", 9); canvas.setFillColor(MUTED)
    n = canvas.getPageNumber()
    canvas.drawString(MARGIN, H - 1.2 * cm, "ReachNT: remote repair triage")
    canvas.drawRightString(W - MARGIN, H - 1.2 * cm, f"{TEAM}  |  Page {n}")
    canvas.drawString(MARGIN, 1.1 * cm, "CDU IT Code Fair 2026, Artificial Intelligence Challenge · Team Top Enders")
    canvas.drawRightString(W - MARGIN, 1.1 * cm, f"{TEAM}  |  Page {n}")
    canvas.setStrokeColor(RULE); canvas.setLineWidth(0.4)
    canvas.line(MARGIN, H - 1.4 * cm, W - MARGIN, H - 1.4 * cm)
    canvas.line(MARGIN, 1.5 * cm, W - MARGIN, 1.5 * cm)
    canvas.restoreState()


def build():
    from fill import filled
    _, fm, body = filled(SRC.read_text()).split("---", 2)
    meta = yaml.safe_load(fm)
    story = [Spacer(1, 3.2 * cm), Paragraph(inline(meta["title"]), S["title"]), Paragraph(inline(meta["subtitle"]), S["subtitle"]),
             Paragraph(inline(meta["kind"]), S["body"]), Paragraph(inline(meta["event"]), S["body"]), Spacer(1, 0.6 * cm),
             Paragraph(f"<b>{inline(meta['team'])} · {inline(meta.get('team_name', ''))}</b>", S["body"])]
    story += [Paragraph(inline(m), S["body"]) for m in meta["members"]]
    story += [Spacer(1, 0.4 * cm), Paragraph(inline(meta["date"]), S["body"]), Spacer(1, 7.5 * cm),
              Paragraph(inline(meta["acknowledgement"]), S["ack"]), PageBreak()]

    lines = body.strip("\n").splitlines()
    in_refs = False
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            i += 1; continue
        if line.startswith("# "):
            title = line[2:].strip()
            if title == "References" or title.startswith("Appendix A"):
                story.append(PageBreak())
            in_refs = title == "References"
            story.append(Paragraph(inline(title), S["h1"]))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:].strip()), S["h2"]))
        elif line.startswith("TABLE:"):
            cap = line[len("TABLE:"):].strip(); rows = []
            i += 1
            while i < len(lines) and lines[i].startswith("|"):
                cells = lines[i].strip().strip("|").split("|")
                if not set("".join(cells).strip()) <= set("-: "):
                    rows.append(cells)
                i += 1
            story += [Paragraph(inline(cap), S["tcap"]), data_table(rows), Spacer(1, 8)]
            continue
        elif line.startswith("FIGURES:"):
            left, right, width, cap = [x.strip() for x in line[len("FIGURES:"):].split("|", 3)]
            w = float(width)
            pair = Table([[img(ROOT / left, w), img(ROOT / right, w)]], colWidths=[CONTENT_W / 2] * 2)
            pair.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Arial"), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
            story.append(KeepTogether([pair, Spacer(1, 3), Paragraph(inline(cap), S["cap"])]))
        elif line.startswith("FIGURE:"):
            path, width, cap = [x.strip() for x in line[len("FIGURE:"):].split("|", 2)]
            story.append(KeepTogether([img(ROOT / path, float(width)), Spacer(1, 3), Paragraph(inline(cap), S["cap"])]))
        elif line.startswith("CODE:"):
            i += 1
            while i < len(lines) and lines[i].strip():
                story.append(Paragraph(escape(lines[i]), S["code"])); i += 1
            story.append(Spacer(1, 6)); continue
        elif re.match(r"^\d+\. ", line):
            n, rest = line.split(" ", 1)
            if in_refs:
                story.append(Paragraph(f"[{n[:-1]}]&nbsp;&nbsp;{inline(rest)}", S["ref"]))
            else:
                story.append(Paragraph(f"{n}&nbsp;&nbsp;{inline(rest)}", S["num"]))
        else:
            story.append(Paragraph(inline(line), S["body"]))
        i += 1

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
                            title="ReachNT: remote repair triage", author=TEAM,
                            subject="CDU IT Code Fair 2026, Artificial Intelligence Challenge · Team Top Enders")
    doc.initialFontName, doc.initialFontSize = "Arial", 11   # no stray Helvetica in the PDF
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
