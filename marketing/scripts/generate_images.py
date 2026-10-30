#!/usr/bin/env python3
"""Draws the landing's images: the 3 sample invoices (public/samples/) and
the app screens shown in "Cómo funciona" (public/screens/, light + dark).

Like Paney's docs/generate.py: the screens are drawn as HTML in the app's
tokens, Geist and Spanish labels (frontend/src/lib/i18n.ts), with the
made-up data in src/samples.json, and headless Chromium renders them. Keep
them in step with the app when those screens change.

Run from anywhere:  python3 -I marketing/scripts/generate_images.py [--chrome PATH]
(--chrome defaults to $CHROME, then chromium/chrome on PATH)
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # marketing/
FONTS = ROOT / "node_modules" / "@fontsource-variable" / "geist" / "files"
OUT = ROOT / "public"

# The app's tokens (frontend/src/index.css, same as marketing/src/index.css)
THEMES = {
    "light": dict(bg="#fafaf9", fg="#1c1917", card="#ffffff", muted="#f5f5f4", sub="#57534e",
                  border="#e7e5e4", primary="#047857", on_primary="#ecfdf5", accent="#d1fae5",
                  on_accent="#065f46", amber_bg="#fef3c7", amber="#b45309", amber_line="#fcd34d"),
    "dark": dict(bg="#0c0a09", fg="#fafaf9", card="#1c1917", muted="#292524", sub="#a8a29e",
                 border="#44403c", primary="#34d399", on_primary="#022c22", accent="#065f46",
                 on_accent="#d1fae5", amber_bg="#451a03", amber="#fbbf24", amber_line="#92400e"),
}

# Spanish labels exactly as the app shows them (frontend/src/lib/i18n.ts)
LABELS = {
    "supplier_name": "Proveedor", "supplier_tax_id": "NIF proveedor", "customer_name": "Cliente",
    "customer_tax_id": "NIF cliente", "invoice_number": "Nº factura", "invoice_date": "Fecha",
    "currency": "Moneda", "net_amount": "Base imponible", "vat_amount": "IVA",
    "withholding_amount": "Retención IRPF", "total_amount": "Total",
}
MONEY = {"net_amount", "vat_amount", "withholding_amount", "total_amount"}
TABLE_FIELDS = ["supplier_name", "supplier_tax_id", "invoice_number", "invoice_date",
                "net_amount", "vat_amount", "withholding_amount", "total_amount"]


def esc(text: object) -> str:
    return html.escape(str(text))


def load_samples() -> list[dict]:
    return json.loads((ROOT / "src" / "samples.json").read_text(encoding="utf-8"))


def euros(amount: float) -> str:
    """As printed on a Spanish invoice: 1.060,00 €."""
    return f"{amount:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def app_amount(amount: float) -> str:
    """As the app shows it (toLocaleString es-ES): no thousands dot below 10.000."""
    text = f"{amount:.2f}".replace(".", ",")
    return euros(amount)[:-2] if abs(amount) >= 10000 else text


def app_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{int(d)}/{int(m)}/{y}"


def app_value(field: str, value: object) -> str:
    if value is None:
        return "—"
    if field in MONEY:
        return app_amount(value)
    if field == "invoice_date":
        return app_date(value)
    return str(value)


def _fonts_css() -> str:
    faces = []
    for name in ("geist-latin-wght-normal.woff2", "geist-latin-ext-wght-normal.woff2"):
        faces.append(f"@font-face{{font-family:Geist;font-weight:100 900;"
                     f"src:url('{(FONTS / name).as_uri()}') format('woff2');}}")
    return "".join(faces)


def _page(body: str, css: str) -> str:
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{_fonts_css()}"
            f"*{{box-sizing:border-box}}body{{margin:0;font-family:Geist,sans-serif}}{css}"
            f"</style></head><body>{body}</body></html>")


def invoice_html(sample: dict) -> str:
    inv = sample["invoice"]
    withholding = (f"<tr><td>Retención IRPF (15%)</td><td>{euros(-inv['withholding_amount'])}</td></tr>"
                   if inv["withholding_amount"] else "")
    photo = sample["id"] == "photo"
    css = (".sheet{width:620px;background:#fff;color:#1c1917;padding:44px 48px;font-size:13px;"
           "line-height:1.45;" + ("transform:rotate(-2.2deg);margin:40px auto;"
           "box-shadow:0 18px 40px -12px rgba(0,0,0,.45);filter:contrast(.96) brightness(.98);"
           if photo else "margin:0;") + "}"
           "body{background:" + ("#8a7560" if photo else "#fff") + ";padding:" + ("30px" if photo else "0") + "}"
           ".top{display:flex;justify-content:space-between}h1{font-size:24px;letter-spacing:2px;"
           "color:#2f5d62;margin:0}.box{border:1px solid #ddd;padding:8px 10px;margin:18px 0;width:60%}"
           "table{width:100%;border-collapse:collapse}td{padding:4px 0}.t td:last-child{text-align:right}"
           ".lines th{background:#2f5d62;color:#fff;text-align:left;padding:6px;font-weight:500}"
           ".lines td{border-bottom:1px solid #eee;padding:6px}.grand td{font-weight:700;font-size:15px;"
           "border-top:2px solid #2f5d62}.muted{color:#777}")
    # The photo sample's flagged issue is a hard-to-read date, so it looks it
    date = app_date(inv["invoice_date"])
    if any(i["field"] == "invoice_date" for i in sample["issues"]):
        date = f'<span style="filter:blur(1.1px);opacity:.75">{date}</span>'
    body = f"""<div class="sheet">
<div class="top"><div><b style="font-size:15px">{esc(inv['supplier_name'])}</b><br>
NIF: {esc(inv['supplier_tax_id'])}<br>C/ Ejemplo, 1<br>00000 Ciudad Ejemplo</div>
<div style="text-align:right"><h1>FACTURA</h1><span class="muted">Nº</span> <b>{esc(inv['invoice_number'])}</b><br>
<span class="muted">Fecha</span> {date}</div></div>
<div class="box"><span class="muted">FACTURAR A</span><br><b>{esc(inv['customer_name'])}</b><br>
CIF: {esc(inv['customer_tax_id'])}</div>
<table class="lines"><tr><th>Concepto</th><th style="text-align:right">Importe</th></tr>
<tr><td>Servicios del periodo</td><td style="text-align:right">{euros(inv['net_amount'])}</td></tr></table>
<table class="t" style="width:50%;margin:14px 0 0 auto">
<tr><td>Base imponible</td><td>{euros(inv['net_amount'])}</td></tr>
<tr><td>IVA (21%)</td><td>{euros(inv['vat_amount'])}</td></tr>{withholding}
<tr class="grand"><td>TOTAL</td><td>{euros(inv['total_amount'])}</td></tr></table>
<p class="muted" style="font-size:10px;margin-top:28px">Factura de ejemplo. Datos inventados.</p></div>"""
    return _page(body, css)


def _app_css(t: dict) -> str:
    return (f"body{{background:{t['bg']};color:{t['fg']};font-size:13px}}"
            f".bar{{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;"
            f"border-bottom:1px solid {t['border']}}}.logo b{{color:{t['primary']}}}"
            f".wrap{{padding:22px 24px}}h1{{font-size:22px;margin:0;letter-spacing:-.02em}}"
            f".btn{{border:1px solid {t['border']};border-radius:6px;padding:7px 12px}}"
            f".pri{{background:{t['primary']};color:{t['on_primary']};border-color:{t['primary']}}}"
            f".card{{background:{t['card']};border:1px solid {t['border']};border-radius:8px;padding:12px 14px}}"
            f".sub{{color:{t['sub']}}}table{{width:100%;border-collapse:collapse}}"
            f"th{{background:{t['muted']};color:{t['sub']};text-align:left;font-weight:500;padding:9px 12px}}"
            f"td{{border-top:1px solid {t['border']};padding:9px 12px;color:{t['sub']}}}td.name{{color:{t['fg']};font-weight:500}}"
            f".pill{{border-radius:999px;padding:2px 8px;font-size:11px;background:{t['accent']};color:{t['on_accent']}}}"
            f".warn{{background:{t['amber_bg']};color:{t['amber']}}}"
            f".issue{{background:{t['amber_bg']};border:1px solid {t['amber_line']};color:{t['fg']};"
            f"border-radius:6px;padding:9px 12px}}")


def _app_bar() -> str:
    return ('<div class="bar"><span class="logo">tidy<b>bridge</b></span>'
            '<span class="sub">Historial de subidas</span></div>')


def _records_table(samples: list[dict]) -> str:
    head = "".join(f"<th>{LABELS[f]}</th>" for f in TABLE_FIELDS) + "<th>Estado</th>"
    rows = []
    for s in samples:
        inv = s["invoice"]
        cells = "".join(
            f"<td class='{'name' if f == 'supplier_name' else ''}'>{esc(app_value(f, inv[f]))}</td>"
            for f in TABLE_FIELDS)
        pill = ("<span class='pill warn'>Por revisar</span>" if s["issues"]
                else "<span class='pill'>Correcto</span>")
        rows.append(f"<tr>{cells}<td>{pill}</td></tr>")
    return f"<div class='card' style='padding:0;overflow:hidden'><table><tr>{head}</tr>{''.join(rows)}</table></div>"


def screen_html(name: str, theme: str) -> str:
    t = THEMES[theme]
    samples = load_samples()
    flagged = sum(1 for s in samples if s["issues"])
    header = ("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:16px'>"
              "<h1>Registros</h1><div style='display:flex;gap:8px'>"
              "<span class='btn'>Exportar CSV</span>"
              "<span class='btn pri'>Subir archivo o factura</span></div></div>")
    if name == "records":
        body = (header + "<div class='card' style='margin-bottom:14px'><b>3 filas procesadas</b><br>"
                f"<span style='color:{t['primary']}'>{3 - flagged}</span> correctas · "
                f"<span style='color:{t['amber']}'>{flagged}</span> por revisar · 0 duplicados omitidos</div>"
                + _records_table(samples))
    elif name == "review":
        s = next(x for x in samples if x["issues"])
        inv = s["invoice"]
        fields = "".join(f"<div><div class='sub'>{LABELS[f]}</div><b>{esc(app_value(f, inv[f]))}</b></div>"
                         for f in LABELS if f != "currency")
        body = (f"<span style='color:{t['primary']}'>← Volver a registros</span>"
                f"<h1 style='margin:12px 0 18px'>{esc(inv['supplier_name'])}</h1>"
                f"<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:14px'>{fields}</div>"
                "<h3 style='margin:22px 0 6px;font-size:14px'>Incidencias</h3>"
                "<p class='sub' style='font-size:12px;margin:0 0 8px'>No se envía a ningún sistema hasta que "
                "corrijas estas incidencias o apruebes el registro tal cual.</p>"
                "<div class='issue'><b>Fecha</b>: La extracción no está segura: compruébalo con el documento</div>"
                "<div style='margin-top:12px'><span class='btn pri'>Aprobar</span></div>")
    else:
        raise ValueError(name)
    return _page(_app_bar() + f"<div class='wrap'>{body}</div>", _app_css(t))


def find_chrome(explicit: str | None) -> str:
    for candidate in (explicit, os.environ.get("CHROME"), shutil.which("chromium"),
                      shutil.which("chromium-browser"), shutil.which("google-chrome"),
                      shutil.which("chrome")):
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit("No Chromium found: pass --chrome PATH or set CHROME")


def render(page: str, out: Path, size: tuple[int, int], chrome: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "page.html"
        src.write_text(page, encoding="utf-8")
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
             "--force-device-scale-factor=2", f"--window-size={size[0]},{size[1]}",
             f"--screenshot={out}", src.as_uri()],
            check=True, capture_output=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--chrome")
    chrome = find_chrome(parser.parse_args().chrome)
    for sample in load_samples():
        size = (760, 700) if sample["id"] == "photo" else (620, 620)
        render(invoice_html(sample), OUT / "samples" / f"{sample['id']}.png", size, chrome)
    for name, size in (("records", (1100, 430)), ("review", (900, 470))):
        for theme in THEMES:
            render(screen_html(name, theme), OUT / "screens" / f"{name}-{theme}.png", size, chrome)
    print(f"Images written to {OUT / 'samples'} and {OUT / 'screens'}")


if __name__ == "__main__":
    main()
