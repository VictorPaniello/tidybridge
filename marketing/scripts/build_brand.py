"""Builds the brand assets in public/brand/ (plus public/og-image.*) from
the brand's few constants below - one place to change a color or the
tagline and regenerate everything.

Text is converted to outlines from the Geist font the site already ships,
so the logo renders identically where Geist isn't installed (email
clients, LinkedIn, image viewers).

Run from marketing/:
    uv run --with fonttools --with brotli --with uharfbuzz python scripts/build_brand.py
Needs rsvg-convert on PATH for the PNG copies.
"""

from __future__ import annotations

import io
import subprocess
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "brand"
FONTS = ROOT / "node_modules" / "@fontsource-variable"

# Same values as src/index.css - the site is the source these come from.
LIGHT = {"bg": "#fafaf9", "fg": "#1c1917", "muted": "#57534e", "accent": "#047857"}
DARK = {"bg": "#0c0a09", "fg": "#fafaf9", "muted": "#a8a29e", "accent": "#34d399"}
TAGLINE = "Clean client data in, a working integration out."
TRACKING = -0.025  # Tailwind's tracking-tight, as the site's wordmark uses


def _num(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def _font(file: str, weight: int):
    tt = instantiateVariableFont(TTFont(FONTS / file), {"wght": weight})
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    data = buf.getvalue()
    return TTFont(io.BytesIO(data)), hb.Font(hb.Face(data))


SANS_600 = _font("geist/files/geist-latin-wght-normal.woff2", 600)
SANS_400 = _font("geist/files/geist-latin-wght-normal.woff2", 400)


def text(font, s: str, size: float, x: float, baseline: float, tracking: float = 0.0):
    """Outlined text as an SVG path `d`, plus its width and ink bounds."""
    tt, hbfont = font
    upem = tt["head"].unitsPerEm
    scale = size / upem
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {})
    glyphs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    pen, bounds = SVGPathPen(glyphs, ntos=_num), BoundsPen(glyphs)
    cursor = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions, strict=True):
        dx, dy = x + (cursor + pos.x_offset) * scale, baseline - pos.y_offset * scale
        t = (scale, 0, 0, -scale, dx, dy)
        glyphs[order[info.codepoint]].draw(TransformPen(pen, t))
        glyphs[order[info.codepoint]].draw(TransformPen(bounds, t))
        cursor += pos.x_advance + tracking * upem
    width = (cursor - tracking * upem) * scale
    return pen.getCommands(), width, bounds.bounds


def wordmark(colors: dict, size: float, x: float, baseline: float):
    """The "tidy" + "bridge" wordmark as two paths; returns (svg, width, bounds)."""
    tidy, w1, b1 = text(SANS_600, "tidy", size, x, baseline, TRACKING)
    bridge, w2, b2 = text(SANS_600, "bridge", size, x + w1 + TRACKING * size, baseline, TRACKING)
    svg = f'<path d="{tidy}" fill="{colors["fg"]}"/><path d="{bridge}" fill="{colors["accent"]}"/>'
    bounds = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
    return svg, w1 + TRACKING * size + w2, bounds


def mark(color: str, x: float, y: float, size: float) -> str:
    """The bridge arc, drawn on the favicon's 32-unit grid and scaled."""
    s = size / 32
    return (
        f'<g transform="translate({_num(x)} {_num(y)}) scale({_num(s)})">'
        f'<path d="M8 20c2-6 4-9 8-9s6 3 8 9" stroke="{color}" stroke-width="2.5" '
        f'fill="none" stroke-linecap="round"/>'
        f'<circle cx="8" cy="20" r="2.2" fill="{color}"/>'
        f'<circle cx="24" cy="20" r="2.2" fill="{color}"/></g>'
    )


def lockup(colors: dict, size: float, x: float, baseline: float):
    """Mark + wordmark, the logo itself; returns (svg, width, bounds). The
    mark runs from the top of the letters to the baseline, so its dots sit
    on the same line as the text - every place the logo appears uses this."""
    _, _, (_, y0, _, _) = wordmark(colors, size, 0, baseline)
    k = (baseline - y0) / 14.5  # mark-on-* is 14.5 units tall on the 32-unit grid
    mark_w, gap = 22 * k, 14.5 * k * 0.3
    word, word_w, (_, _, _, y1) = wordmark(colors, size, x + mark_w + gap, baseline)
    body = mark(colors["accent"], x - 5 * k, y0 - 8.75 * k, 32 * k) + word
    return body, mark_w + gap + word_w, (x, y0, x + mark_w + gap + word_w, y1)


def svg(width: float, height: float, body: str, bg: str | None = None) -> str:
    fill = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_num(width)}" height="{_num(height)}" '
        f'viewBox="0 0 {_num(width)} {_num(height)}">{fill}{body}</svg>\n'
    )


def build() -> dict[str, tuple[str, list[int]]]:
    """name -> (svg source, PNG widths to export)."""
    files: dict[str, tuple[str, list[int]]] = {}

    # App icon: the favicon itself, mark on a dark rounded tile.
    tile = f'<rect width="32" height="32" rx="7" fill="{DARK["bg"]}"/>'
    tile += mark(DARK["accent"], 0, 0, 32)
    files["mark-tile"] = (svg(32, 32, tile), [64, 512])

    for name, c in (("on-light", LIGHT), ("on-dark", DARK)):
        # Mark alone, cropped to its ink (the arc spans x 5.8-26.2, y 9.75-22.2).
        files[f"mark-{name}"] = (
            svg(22, 14.5, mark(c["accent"], -5, -8.75, 32)),
            [256],
        )

        size, pad = 64, 8
        body, width, (x0, y0, x1, y1) = wordmark(c, size, pad, size)
        files[f"wordmark-{name}"] = (
            svg(width + 2 * pad, y1 + pad, body),
            [480, 960],
        )

        body, width, (_, _, _, y1) = lockup(c, size, pad, size)
        files[f"lockup-{name}"] = (svg(width + 2 * pad, y1 + pad, body), [600, 1200])

    # Avatar for LinkedIn / Google profile: shown cropped to a circle.
    files["avatar"] = (svg(400, 400, mark(DARK["accent"], -5, -5, 410), DARK["bg"]), [400])

    # Social preview (og:image): the logo and tagline, left-aligned like the site's hero.
    body, _, _ = lockup(DARK, 88, 80, 290)
    tag, _, _ = text(SANS_400, TAGLINE, 34, 80, 360)
    og = body + f'<path d="{tag}" fill="{DARK["muted"]}"/>'
    files["og-image"] = (svg(1200, 630, og, DARK["bg"]), [1200])

    # LinkedIn banner (1584x396). The profile photo covers the bottom-left
    # on desktop and the centre-left on mobile, so content sits right.
    right = 1584 - 96
    _, logo_w, _ = lockup(DARK, 72, 0, 0)
    _, tag_w, _ = text(SANS_400, TAGLINE, 30, 0, 0)
    body, _, _ = lockup(DARK, 72, right - logo_w, 190)
    tag_d, _, _ = text(SANS_400, TAGLINE, 30, right - tag_w, 246)
    banner = body + f'<path d="{tag_d}" fill="{DARK["muted"]}"/>'
    files["linkedin-banner"] = (svg(1584, 396, banner, DARK["bg"]), [1584])
    return files


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (source, widths) in build().items():
        # The social preview lives at the site root, where index.html points.
        target = ROOT / "public" if name == "og-image" else OUT
        (target / f"{name}.svg").write_text(source)
        for w in widths:
            suffix = "" if len(widths) == 1 else f"-{w}"
            png = target / f"{name}{suffix}.png"
            subprocess.run(
                ["rsvg-convert", "-w", str(w), "-o", str(png), str(target / f"{name}.svg")],
                check=True,
            )
        print(f"built {name}")


if __name__ == "__main__":
    main()
