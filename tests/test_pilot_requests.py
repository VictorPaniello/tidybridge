"""POST /pilot-requests: the landing's "Solicitar piloto" form. Public, no
auth - the requester has no account yet."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from tidybridge.main import app, limiter
from tidybridge.models import PilotRequest

VALID = {
    "name": "Ana Pérez",
    "firm": "Gestoría Ejemplo",
    "email": "ana@example.com",
    "language": "es",
    "privacy_accepted": True,
}


def _post(body: dict):
    return TestClient(app).post("/pilot-requests", json=body)


def _rows(db) -> list[PilotRequest]:
    return list(db.execute(select(PilotRequest)).scalars())


def test_valid_request_is_stored(db):
    response = _post(VALID)
    assert response.status_code == 202
    assert response.json() == {"status": "received"}
    [row] = _rows(db)
    assert (row.name, row.firm, row.email, row.language) == (
        "Ana Pérez",
        "Gestoría Ejemplo",
        "ana@example.com",
        "es",
    )
    assert row.phone is None and row.volume is None and row.message is None


def test_optional_fields_are_stored(db):
    body = {**VALID, "phone": "+34 600 123 456", "volume": "100-500", "message": "Somos 4."}
    assert _post(body).status_code == 202
    [row] = _rows(db)
    assert (row.phone, row.volume, row.message) == ("+34 600 123 456", "100-500", "Somos 4.")


@pytest.mark.parametrize(
    "bad",
    [
        {"email": "nope"},
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 201},
        {"privacy_accepted": False},
        {"volume": "lots"},
        {"language": "fr"},
        {"message": "x" * 2001},
    ],
)
def test_invalid_request_is_rejected(db, bad):
    assert _post({**VALID, **bad}).status_code == 422
    assert _rows(db) == []


def test_honeypot_is_accepted_but_not_stored(db):
    # A bot fills every field; answering 202 gives it nothing to adapt to
    assert _post({**VALID, "website": "http://spam.example"}).status_code == 202
    assert _rows(db) == []


def test_unicode_is_kept(db):
    assert _post({**VALID, "name": "Núria Martí", "firm": "Assessoria l'Àncora"}).status_code == 202
    [row] = _rows(db)
    assert (row.name, row.firm) == ("Núria Martí", "Assessoria l'Àncora")


@pytest.fixture
def sent(monkeypatch) -> list[dict]:
    """Records the notification emails instead of calling Resend."""
    calls: list[dict] = []

    async def fake_send_email(to: str, subject: str, html: str) -> None:
        calls.append({"to": to, "subject": subject, "html": html})

    monkeypatch.setattr("tidybridge.main._send_email", fake_send_email)
    return calls


def test_notification_is_sent_to_hello(db, sent):
    _post(VALID)
    [mail] = sent
    assert mail["to"] == "hello@tidybridge.dev"
    assert "Gestoría Ejemplo" in mail["subject"]
    assert "ana@example.com" in mail["html"]


def test_notification_escapes_and_keeps_subject_on_one_line(db, sent):
    _post({**VALID, "name": "Ana\nBcc: x", "firm": "<b>Acme</b>\r\nX"})
    [mail] = sent
    assert "\n" not in mail["subject"] and "\r" not in mail["subject"]
    assert "&lt;b&gt;Acme" in mail["html"]
    assert "<b>Acme" not in mail["html"]


def test_failed_notification_still_returns_202_and_keeps_the_row(db, monkeypatch):
    async def broken_send_email(to: str, subject: str, html: str) -> None:
        raise RuntimeError("resend down")

    monkeypatch.setattr("tidybridge.main._send_email", broken_send_email)
    assert _post(VALID).status_code == 202
    assert len(_rows(db)) == 1


def test_honeypot_sends_no_email(db, sent):
    _post({**VALID, "website": "http://spam.example"})
    assert sent == []


def test_sixth_request_in_an_hour_is_rate_limited(db, sent):
    limiter.enabled = True
    try:
        statuses = [_post(VALID).status_code for _ in range(6)]
    finally:
        limiter.enabled = False
    assert statuses == [202] * 5 + [429]
