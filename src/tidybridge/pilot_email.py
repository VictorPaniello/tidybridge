"""The email hello@ gets for each pilot request from the landing form.

Table layout with inline styles, because that's what email clients render.
Every value from the form is HTML-escaped; the subject stays on one line.
"""

# The template lines are HTML; wrapping them only hurts reading them.
# ruff: noqa: E501

from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from tidybridge.schemas import PilotRequestIn

LOGO_URL = "https://tidybridge.dev/email-logo.png"  # public on purpose (email signature)
EMERALD, INK, MUTED, LINE = "#047857", "#1c1917", "#57534e", "#e7e5e4"
VOLUME = {"<100": "Menos de 100", "100-500": "100–500", "500+": "Más de 500"}


def pilot_request_email(body: PilotRequestIn, received: datetime) -> tuple[str, str]:
    """Returns (subject, html)."""
    subject = " ".join(f"Solicitud de piloto: {body.firm}".split())
    email = escape(body.email)
    phone = (
        f'<a href="tel:{escape("".join(body.phone.split()))}" style="color:{EMERALD}">'
        f"{escape(body.phone)}</a>"
        if body.phone
        else None
    )
    rows = [
        ("Nombre", escape(body.name)),
        ("Gestoría", escape(body.firm)),
        ("Email", f'<a href="mailto:{email}" style="color:{EMERALD}">{email}</a>'),
        ("Teléfono", phone),
        ("Facturas al mes", VOLUME.get(body.volume or "")),
        ("Idioma", "Español" if body.language == "es" else "Inglés"),
        ("Mensaje", escape(body.message).replace("\n", "<br>") if body.message else None),
    ]
    table = "".join(
        f'<tr><td style="padding:10px 0;border-top:1px solid {LINE};color:{MUTED};'
        f'width:140px;vertical-align:top">{label}</td>'
        f'<td style="padding:10px 0;border-top:1px solid {LINE};color:{INK}">{value}</td></tr>'
        for label, value in rows
        if value
    )
    when = received.astimezone(ZoneInfo("Europe/Madrid")).strftime("%d/%m/%Y %H:%M")
    html = f"""<div style="background:#fafaf9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid {LINE};border-radius:10px">
<tr><td style="padding:24px 28px 8px"><img src="{LOGO_URL}" width="32" height="32" alt="tidybridge" style="display:block"></td></tr>
<tr><td style="padding:8px 28px 4px"><h1 style="margin:0;font-size:20px;color:{INK}">Nueva solicitud de piloto</h1>
<p style="margin:6px 0 0;color:{MUTED};font-size:14px">{escape(body.firm)} quiere probar tidybridge.</p></td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">{table}</table></td></tr>
<tr><td style="padding:4px 28px 24px"><a href="mailto:{email}" style="display:inline-block;background:{EMERALD};color:#ecfdf5;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:6px">Responder a {escape(body.name)}</a></td></tr>
</table>
<p style="max-width:560px;margin:12px auto 0;color:{MUTED};font-size:12px;text-align:center">Recibida el {when} · Enviada desde el formulario de tidybridge.dev</p>
</div>"""
    return subject, html


CONFIRMATION = {
    "es": (
        "Hemos recibido tu solicitud de piloto",
        "Gracias por tu interés en tidybridge. Hemos recibido tu solicitud de piloto "
        "y te escribimos en 2 días laborables.",
        "Si tienes cualquier pregunta mientras tanto, responde a este correo.",
    ),
    "en": (
        "We've received your pilot request",
        "Thanks for your interest in tidybridge. We've received your pilot request "
        "and will write back within 2 working days.",
        "If you have any questions in the meantime, just reply to this email.",
    ),
}


def confirmation_email(language: str) -> tuple[str, str]:
    """Returns (subject, html) for the requester. Fixed text only: anyone can
    type someone else's address, so nothing they wrote goes into it."""
    subject, lead, reply = CONFIRMATION.get(language, CONFIRMATION["es"])
    html = f"""<div style="background:#fafaf9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid {LINE};border-radius:10px">
<tr><td style="padding:24px 28px 8px"><img src="{LOGO_URL}" width="32" height="32" alt="tidybridge" style="display:block"></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.5;color:{INK}"><h1 style="margin:0 0 12px;font-size:20px">{subject}</h1>
<p style="margin:0 0 12px">{lead}</p><p style="margin:0;color:{MUTED}">{reply}</p></td></tr>
</table>
<p style="max-width:560px;margin:12px auto 0;color:{MUTED};font-size:12px;text-align:center">tidybridge.dev</p>
</div>"""
    return subject, html
