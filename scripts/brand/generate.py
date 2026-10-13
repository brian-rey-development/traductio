"""Builds the logo, icons and cover in assets/.

Needs rsvg-convert (brew install librsvg), the Inter font and Georgia installed,
and pip install uharfbuzz fonttools.
"""
import os
import subprocess
import tempfile

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets")
FONT_DIR = os.environ.get("INTER_DIR", os.path.expanduser("~/Library/Fonts"))
FONT = os.path.join(FONT_DIR, "Inter-SemiBold.ttf")
INK, SLATE, MUTED, MIST, BLUE, PAPER = "#0F172A", "#475569", "#94A3B8", "#E2E8F0", "#2563EB", "#F8FAFC"
TRACKING = -0.025


def wordmark(text, cap_height, x0=0.0, baseline=0.0):
    """Outlined, kerned text as one SVG path. Returns (d, width)."""
    font = TTFont(FONT)
    upem = font["head"].unitsPerEm
    scale = cap_height / font["OS/2"].sCapHeight
    blob = hb.Blob.from_file_path(FONT)
    hbfont = hb.Font(hb.Face(blob))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": True})
    glyphs = font.getGlyphSet()
    order = font.getGlyphOrder()
    pen = SVGPathPen(glyphs)
    cursor = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        transform = (scale, 0, 0, -scale, x0 + (cursor + pos.x_offset) * scale, baseline)
        glyphs[name].draw(TransformPen(pen, transform))
        cursor += pos.x_advance + TRACKING * upem
    return pen.getCommands(), (cursor - TRACKING * upem) * scale


# Open book seen from the front, drawn in a 120 x 100 box.
LEFT_PAGE = "M8 10C24 9 40 15 57.5 27V95C43 84 26 78 8 78Z"
RIGHT_PAGE = "M112 6C96 5 79 12 62.5 25V95C77 82 94 75 112 75Z"


def mark(left, right, x=0.0, y=0.0, size=100.0):
    s = size / 100
    return (
        f'<g transform="translate({x:.2f} {y:.2f}) scale({s:.4f})">'
        f'<path d="{LEFT_PAGE}" fill="{left}"/><path d="{RIGHT_PAGE}" fill="{right}"/></g>'
    )


def svg(width, height, body, background=None):
    bg = f'<rect width="{width}" height="{height}" fill="{background}"/>' if background else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{bg}{body}</svg>\n'
    )


def write(name, content, directory=OUT):
    path = os.path.join(directory, name)
    with open(path, "w") as handle:
        handle.write(content)
    return path


def png(svg_path, png_path, width):
    subprocess.run(["rsvg-convert", "-w", str(width), "-o", png_path, svg_path], check=True)


def logo(text_color, left, right):
    cap = 72
    d, text_width = wordmark("Traductio", cap, x0=152, baseline=104)
    body = mark(left, right, x=0, y=12, size=104) + f'<path d="{d}" fill="{text_color}"/>'
    return svg(round(152 + text_width + 4), 128, body)


def icon(background, left, right, border=None):
    stroke = f' stroke="{border}" stroke-width="2"' if border else ""
    body = f'<rect x="1" y="1" width="510" height="510" rx="114" fill="{background}"{stroke}/>'
    return svg(512, 512, body + mark(left, right, x=100, y=126, size=260))


def macos_icon():
    """Apple's grid puts an 824 px squircle inside the 1024 px canvas, with room for a soft shadow."""
    defs = (
        '<defs><filter id="drop" x="-10%" y="-10%" width="120%" height="125%">'
        '<feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.28"/></filter></defs>'
    )
    tile = f'<rect x="100" y="100" width="824" height="824" rx="185" fill="{BLUE}" filter="url(#drop)"/>'
    return svg(1024, 1024, defs + tile + mark("#BFDBFE", "#FFFFFF", x=286, y=324, size=376))


SERIF = "Georgia, serif"
SANS = "Inter, sans-serif"

EN_PAGE = (
    "CHAPTER I",
    "Down the Rabbit-Hole",
    [
        [("Alice was beginning to get ", ""), ("very", "i")],
        [("tired of sitting by her sister", "")],
        [("on the bank, and of having", "")],
        [("nothing to do. Once or twice", "")],
        [("she had peeped into the book", "")],
        [("her sister was reading.", ""), ("1", "sup")],
    ],
)
ES_PAGE = (
    "CAPÍTULO I",
    "La madriguera del conejo",
    [
        [("Alicia empezaba a cansarse ", ""), ("mucho", "i")],
        [("de estar sentada junto a su", "")],
        [("hermana en la orilla, sin nada", "")],
        [("que hacer. Una o dos veces se", "")],
        [("había asomado al libro que", "")],
        [("leía su hermana.", ""), ("1", "sup")],
    ],
)


def page_line(parts, x, y, accent):
    spans = []
    for text, style in parts:
        if style == "i":
            spans.append(f'<tspan font-style="italic">{text}</tspan>')
        elif style == "sup":
            spans.append(f'<tspan font-family="{SANS}" font-weight="700" font-size="12" dy="-7" fill="{accent}">{text}</tspan>')
        else:
            spans.append(text)
    return f'<text x="{x}" y="{y}" font-family="{SERIF}" font-size="17" fill="{INK}">{"".join(spans)}</text>'


def page_card(content, x, y, angle, accent, tag):
    label, title, lines = content
    w, h = 340, 440
    body = [
        f'<rect width="{w}" height="{h}" rx="18" fill="#FFFFFF" stroke="{MIST}" stroke-width="1.5" filter="url(#shadow)"/>',
        f'<text x="32" y="58" font-family="{SANS}" font-size="12" font-weight="600" letter-spacing="2.4" fill="{MUTED}">{label}</text>',
        f'<text x="32" y="92" font-family="{SERIF}" font-size="21" font-weight="700" fill="{INK}">{title}</text>',
        f'<rect x="32" y="110" width="36" height="3" rx="1.5" fill="{accent}"/>',
    ]
    body += [page_line(parts, 32, 152 + i * 28, accent) for i, parts in enumerate(lines)]
    body += [f'<rect x="32" y="{328 + i * 22}" width="{276 - (i % 3) * 38}" height="7" rx="3.5" fill="#EEF2F6"/>' for i in range(3)]
    body.append(
        f'<rect x="{w - 76}" y="{h - 52}" width="48" height="26" rx="13" fill="{accent}" fill-opacity="0.1"/>'
        f'<text x="{w - 52}" y="{h - 34}" text-anchor="middle" font-family="{SANS}" font-size="12" font-weight="700" fill="{accent}">{tag}</text>'
    )
    return f'<g transform="translate({x} {y}) rotate({angle} {w / 2} {h / 2})">{"".join(body)}</g>'


def text_width(text, size, path=os.path.join(FONT_DIR, "Inter-Medium.ttf")):
    hbfont = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True})
    return sum(pos.x_advance for pos in buf.glyph_positions) * size / hbfont.face.upem


def chip(x, y, text):
    width = 30 + text_width(text, 15) + 16
    return (
        f'<g transform="translate({x} {y})"><rect width="{width:.0f}" height="36" rx="18" fill="#FFFFFF" stroke="{MIST}"/>'
        f'<circle cx="18" cy="18" r="4" fill="{BLUE}"/>'
        f'<text x="30" y="23" font-family="{SANS}" font-size="15" font-weight="500" fill="{SLATE}">{text}</text></g>'
    ), width


def chips(x, y, labels):
    out, cursor = [], x
    for label in labels:
        markup, width = chip(cursor, y, label)
        out.append(markup)
        cursor += width + 10
    return "".join(out)


def cover():
    d, _ = wordmark("Traductio", 40, x0=174, baseline=138)
    defs = (
        '<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.10"/></filter>'
        '<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">'
        f'<circle cx="2" cy="2" r="1.3" fill="{MIST}"/></pattern></defs>'
    )
    headline = [
        f'<text x="96" y="{248 + i * 62}" font-family="{SANS}" font-size="54" font-weight="700" letter-spacing="-1.6" fill="{INK}">{line}</text>'
        for i, line in enumerate(["Read any book in", "your own language."])
    ]
    pitch = [
        f'<text x="96" y="{358 + i * 32}" font-family="{SANS}" font-size="21" fill="{SLATE}">{line}</text>'
        for i, line in enumerate(
            ["Whole EPUBs translated on your Mac with", "TranslateGemma and Ollama. Offline, free,", "with chapters, italics and footnotes intact."]
        )
    ]
    arrow = (
        f'<g transform="translate(852 516)"><circle r="30" fill="{BLUE}" filter="url(#shadow)"/>'
        '<path d="M-11 0H10M3 -8L11 0L3 8" stroke="#FFFFFF" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>'
    )
    body = (
        defs
        + f'<rect width="1280" height="640" fill="{PAPER}"/><rect x="640" width="640" height="640" fill="url(#dots)"/>'
        + mark("#CBD5E1", INK, x=96, y=94, size=50)
        + f'<path d="{d}" fill="{INK}"/>'
        + "".join(headline)
        + "".join(pitch)
        + chips(96, 486, ["EPUB in, EPUB out", "Resumable runs", "Review report"])
        + page_card(EN_PAGE, 664, 92, -5, MUTED, "EN")
        + page_card(ES_PAGE, 876, 116, 3.5, BLUE, "ES")
        + arrow
    )
    return svg(1280, 640, body)


os.makedirs(OUT, exist_ok=True)
# The cover's text depends on locally installed fonts, so only its PNG is kept.
with tempfile.TemporaryDirectory() as scratch:
    png(write("cover.svg", cover(), scratch), os.path.join(OUT, "cover.png"), 2560)
write("mark.svg", svg(120, 100, mark("#CBD5E1", INK)))
write("logo.svg", logo(INK, "#CBD5E1", INK))
write("logo-dark.svg", logo("#F1F5F9", "#64748B", "#F1F5F9"))
macos_path = write("icon-macos.svg", macos_icon())
png(macos_path, macos_path.replace(".svg", ".png"), 1024)
for name, args in {
    "icon.svg": (BLUE, "#BFDBFE", "#FFFFFF"),
    "icon-dark.svg": (INK, "#94A3B8", "#E2E8F0"),
    "icon-light.svg": ("#F1F5F9", "#CBD5E1", INK, MIST),
}.items():
    path = write(name, icon(*args))
    png(path, path.replace(".svg", ".png"), 1024)
