"""POST /pilot-requests: the landing's "Solicitar piloto" form. Public, no
auth - the requester has no account yet."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from tidybridge.main import app
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
