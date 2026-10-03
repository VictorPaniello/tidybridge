"""Builds the gestoría one-pager as A4 PDFs, English and Spanish, into
public/brand/tidybridge-pilot-{en,es}.pdf (served at tidybridge.dev/brand/).

The copy for both languages lives in COPY below; change it there and re-run.
Only claim what the product does today (see public/brand/README.md, Voice).

Run from marketing/:
    uv run --with weasyprint python scripts/build_onepager.py
"""

from __future__ import annotations

from html import escape
from pathlib import Path

from weasyprint import HTML

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "brand"
FONTS = ROOT / "node_modules" / "@fontsource-variable"

COPY = {
    "en": {
        "eyebrow": "For gestorías and accounting firms",
        "title": "Stop typing in supplier invoices.",
        "lead": "Send photos or PDFs of a client's invoices. Get them back as clean rows, "
        "checked and ready to import into your accounting software.",
        "get": "What you get back",
        "features": [
            (
                "Every field, one row per invoice",
                "Supplier, tax ID (NIF/CIF), invoice number, date, currency, net, VAT, "
                "IRPF withholding and total.",
            ),
            (
                "Doubtful values flagged, not guessed",
                "Totals that don't add up (net + VAT − IRPF), tax IDs whose check "
                "character doesn't match, and anything hard to read.",
            ),
            (
                "No duplicates",
                "The same invoice sent twice is counted once, even if the tax ID is "
                "written differently.",
            ),
        ],
        "example": "Example",
        "cols": ["Supplier", "NIF/CIF", "Number", "Date", "Net", "VAT", "IRPF", "Total"],
        "rows": [
            [
                "Papelería Ruiz S.L.",
                "B12345674",
                "F-0412",
                "03/09/2026",
                "120.00",
                "25.20",
                "",
                "145.20",
            ],
            [
                "Marta Gil",
                "12345678Z",
                "2026-031",
                "15/09/2026",
                "800.00",
                "168.00",
                "120.00",
                "858.00",
            ],
        ],
        "flag": "check: net + VAT − IRPF = 848.00, not 858.00",
        "pilot": "How the free pilot works",
        "steps": [
            "Send me last quarter's invoices for one client: PDFs, scans or phone photos.",
            "Within 24 hours you get them back in a file ready to import, with the "
            "doubtful ones flagged.",
            "You check the flagged invoices and import the rest.",
        ],
        "free": "Free, no signup, no commitment.",
        "data_title": "Your clients' data",
        "data": "Documents are used only to prepare your file. Data is deleted on request, "
        "and automatically after a year.",
        "cta": "Join the free pilot",
        "write": "Write to",
        "more": "More at",
    },
    "es": {
        "eyebrow": "Para gestorías y asesorías",
        "title": "Deje de teclear facturas de proveedores.",
        "lead": "Envíe fotos o PDF de las facturas de un cliente. Se las devuelvo como "
        "filas limpias, revisadas y listas para importar en su programa de contabilidad.",
        "get": "Qué recibe",
        "features": [
            (
                "Todos los campos, una fila por factura",
                "Proveedor, NIF/CIF, número de factura, fecha, moneda, base imponible, "
                "IVA, retención de IRPF y total.",
            ),
            (
                "Lo dudoso se marca, no se inventa",
                "Totales que no cuadran (base + IVA − IRPF), NIF/CIF cuyo carácter de "
                "control no coincide y todo lo que sea difícil de leer.",
            ),
            (
                "Sin duplicados",
                "Una factura enviada dos veces cuenta una sola vez, aunque el NIF esté "
                "escrito de otra forma.",
            ),
        ],
        "example": "Ejemplo",
        "cols": ["Proveedor", "NIF/CIF", "Número", "Fecha", "Base", "IVA", "IRPF", "Total"],
        "rows": [
            [
                "Papelería Ruiz S.L.",
                "B12345674",
                "F-0412",
                "03/09/2026",
                "120,00",
                "25,20",
                "",
                "145,20",
            ],
            [
                "Marta Gil",
                "12345678Z",
                "2026-031",
                "15/09/2026",
                "800,00",
                "168,00",
                "120,00",
                "858,00",
            ],
        ],
        "flag": "revisar: base + IVA − IRPF = 848,00, no 858,00",
        "pilot": "Cómo funciona el piloto gratuito",
        "steps": [
            "Envíeme las facturas del último trimestre de un cliente: PDF, escaneos o "
            "fotos del móvil.",
            "En 24 horas las recibe en un archivo listo para importar, con las dudosas marcadas.",
            "Usted revisa las facturas marcadas e importa el resto.",
        ],
        "free": "Gratis, sin registro y sin compromiso.",
        "data_title": "Los datos de sus clientes",
        "data": "Los documentos solo se usan para preparar su archivo. Los datos se borran "
        "cuando lo pida y, en cualquier caso, al cabo de un año.",
        "cta": "Únase al piloto gratuito",
        "write": "Escriba a",
        "more": "Más en",
    },
}

# Light-theme tokens from src/index.css: this is a printed page.
CSS = f"""
@font-face {{ font-family: Geist; font-weight: 100 900;
  src: url("{FONTS / "geist/files/geist-latin-wght-normal.woff2"}"); }}
@font-face {{ font-family: "Geist Mono"; font-weight: 100 900;
  src: url("{FONTS / "geist-mono/files/geist-mono-latin-wght-normal.woff2"}"); }}
:root {{ --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --primary: #047857;
  --accent: #d1fae5; --accent-fg: #065f46; --border: #e7e5e4; --card: #ffffff; }}
@page {{ size: A4; margin: 0; background: var(--bg); }}
body {{ margin: 0; padding: 16mm 18mm 14mm; font-family: Geist, Arial, sans-serif;
  font-size: 9.5pt; line-height: 1.45; color: var(--fg); }}
header {{ display: flex; justify-content: space-between; align-items: center; }}
header img {{ height: 8mm; }}
header span, .muted {{ color: var(--muted); }}
.eyebrow {{ margin: 13mm 0 0; font-size: 9pt; font-weight: 600; color: var(--primary); }}
h1 {{ margin: 2mm 0 0; font-size: 27pt; line-height: 1.1; font-weight: 600;
  letter-spacing: -0.025em; }}
.lead {{ margin: 4mm 0 0; max-width: 150mm; font-size: 12pt; line-height: 1.5;
  color: var(--muted); }}
h2 {{ margin: 0 0 4mm; font-size: 12pt; font-weight: 600; letter-spacing: -0.015em; }}
section {{ margin-top: 10mm; padding-top: 7mm; border-top: 0.3mm solid var(--border); }}
.features {{ display: flex; gap: 7mm; }}
.features div {{ flex: 1; }}
h3 {{ margin: 0; font-size: 10pt; font-weight: 600; }}
.features p {{ margin: 1.5mm 0 0; color: var(--muted); }}
.table {{ margin-top: 7mm; border: 0.3mm solid var(--border); border-radius: 2mm;
  background: var(--card); overflow: hidden; }}
.table .label {{ padding: 2mm 3mm; font-size: 8pt; color: var(--muted);
  border-bottom: 0.3mm solid var(--border); }}
table {{ width: 100%; border-collapse: collapse; font-size: 8pt; }}
th {{ text-align: left; font-weight: 600; padding: 2mm 3mm 1mm; }}
td {{ padding: 1mm 3mm 2mm; font-family: "Geist Mono", monospace; font-size: 7.5pt;
  white-space: nowrap; }}
td.name {{ font-family: Geist, Arial, sans-serif; font-size: 8pt; }}
th.num, td.num {{ text-align: right; }}
td.flagged {{ background: var(--accent); color: var(--accent-fg); font-weight: 600; }}
.flag {{ padding: 0 3mm 2.5mm; text-align: right; font-size: 7.5pt; color: var(--accent-fg); }}
ol {{ margin: 0; padding: 0; list-style: none; display: flex; gap: 7mm; }}
li {{ flex: 1; }}
li b {{ display: block; font-family: "Geist Mono", monospace; font-weight: 400;
  color: var(--primary); margin-bottom: 1mm; }}
.free {{ margin: 4mm 0 0; font-weight: 600; }}
footer {{ position: absolute; left: 18mm; right: 18mm; bottom: 14mm;
  padding-top: 6mm; border-top: 0.3mm solid var(--border);
  display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }}
footer .data {{ max-width: 85mm; }}
footer .data h3 {{ font-size: 9pt; }}
footer .data p {{ margin: 1mm 0 0; font-size: 8.5pt; color: var(--muted); }}
.cta {{ text-align: right; }}
.cta .big {{ font-size: 15pt; font-weight: 600; letter-spacing: -0.015em; }}
.cta .mail {{ font-size: 12pt; font-weight: 600; color: var(--primary); }}
.cta p {{ margin: 1mm 0 0; }}
"""


def page(lang: str, c: dict) -> str:
    e = escape
    features = "".join(f"<div><h3>{e(t)}</h3><p>{e(b)}</p></div>" for t, b in c["features"])
    num = {4, 5, 6, 7}
    head = "".join(
        f'<th class="{"num" if i in num else ""}">{e(h)}</th>' for i, h in enumerate(c["cols"])
    )
    rows = ""
    for r, row in enumerate(c["rows"]):
        cells = ""
        for i, v in enumerate(row):
            cls = "name" if i == 0 else ("num" if i in num else "")
            if r == 1 and i == 7:
                cls += " flagged"
            cells += f'<td class="{cls}">{e(v) or "—"}</td>'
        rows += f"<tr>{cells}</tr>"
    steps = "".join(f"<li><b>{i:02d}</b>{e(s)}</li>" for i, s in enumerate(c["steps"], 1))
    logo = OUT / "lockup-on-light.svg"
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<style>{CSS}</style></head><body>
<header><img src="{logo}" alt="tidybridge"><span>tidybridge.dev</span></header>
<p class="eyebrow">{e(c["eyebrow"])}</p>
<h1>{e(c["title"])}</h1>
<p class="lead">{e(c["lead"])}</p>
<section><h2>{e(c["get"])}</h2><div class="features">{features}</div>
<div class="table"><div class="label">{e(c["example"])}</div>
<table><tr>{head}</tr>{rows}</table><div class="flag">{e(c["flag"])}</div></div></section>
<section><h2>{e(c["pilot"])}</h2><ol>{steps}</ol><p class="free">{e(c["free"])}</p></section>
<footer><div class="data"><h3>{e(c["data_title"])}</h3><p>{e(c["data"])}</p></div>
<div class="cta"><div class="big">{e(c["cta"])}</div>
<p class="muted">{e(c["write"])} <span class="mail">hello@tidybridge.dev</span></p>
<p class="muted">{e(c["more"])} tidybridge.dev/#gestorias · Victor Paniello</p></div></footer>
</body></html>"""


def main() -> None:
    for lang, copy in COPY.items():
        target = OUT / f"tidybridge-pilot-{lang}.pdf"
        HTML(string=page(lang, copy), base_url=str(ROOT)).write_pdf(target)
        print(f"built {target.name}")


if __name__ == "__main__":
    main()
