"""The "Invitar a tidybridge" button in the pilot request email (main.py's
/pilot-requests/{id} + /invite): admin only, sends the same invitation as
scripts/invite.py to the requester's email."""

from __future__ import annotations

import re
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import create_user
from tidybridge.config import settings
from tidybridge.models import PilotRequest

PASSWORD = "Proveedor-Ejemplo-1!"


@pytest.fixture
def sent(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_fake_key")
    sent: list[dict] = []

    async def fake_post(self, url, *, headers=None, json=None, **kwargs):
        sent.append(json)
        return httpx.Response(200, json={"id": "fake-email-id"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return sent


@pytest.fixture
def admin() -> TestClient:
    from tidybridge.main import app

    client = TestClient(app)
    email = f"admin-{uuid.uuid4()}@example.com"
    create_user(email, PASSWORD, superuser=True)
    token = client.post(
        "/auth/jwt/login", data={"username": email, "password": PASSWORD}
    ).json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture
def pilot(db) -> uuid.UUID:
    row = PilotRequest(
        name="Ana Ejemplo",
        firm="Proveedor Ejemplo",
        email="Gestoria@Example.com",
        language="es",
    )
    db.add(row)
    db.commit()
    return row.id


def test_admin_sees_the_request_and_sends_the_invitation(admin, pilot, sent):
    resp = admin.get(f"/pilot-requests/{pilot}")
    assert resp.json() == {
        "name": "Ana Ejemplo",
        "firm": "Proveedor Ejemplo",
        "email": "Gestoria@Example.com",
    }

    resp = admin.post(f"/pilot-requests/{pilot}/invite")
    assert resp.status_code == 200, resp.text
    assert sent[-1]["to"] == ["gestoria@example.com"]
    assert re.search(r"accept-invite\?token=", sent[-1]["html"])

    # Accepted -> a second click says so instead of sending again.
    from tidybridge.main import app

    token = re.search(r"accept-invite\?token=([^\"&\s]+)", sent[-1]["html"]).group(1)
    TestClient(app).post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
    resp = admin.post(f"/pilot-requests/{pilot}/invite")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "INVITE_ALREADY_ACCEPTED"


def test_non_admins_and_anonymous_are_refused(client, pilot, sent):
    from tidybridge.main import app

    assert client.get(f"/pilot-requests/{pilot}").status_code == 403
    assert client.post(f"/pilot-requests/{pilot}/invite").status_code == 403
    anonymous = TestClient(app)
    assert anonymous.get(f"/pilot-requests/{pilot}").status_code == 401
    assert anonymous.post(f"/pilot-requests/{pilot}/invite").status_code == 401
    assert sent == []


def test_unknown_request_is_404(admin):
    assert admin.get(f"/pilot-requests/{uuid.uuid4()}").status_code == 404
    assert admin.post(f"/pilot-requests/{uuid.uuid4()}/invite").status_code == 404


def test_pilot_email_leads_with_the_invite_button():
    from datetime import UTC, datetime

    from tidybridge.pilot_email import pilot_request_email
    from tidybridge.schemas import PilotRequestIn

    body = PilotRequestIn(
        name="Ana",
        firm="Proveedor Ejemplo",
        email="gestoria@example.com",
        language="es",
        privacy_accepted=True,
    )
    _, html = pilot_request_email(body, datetime.now(UTC), "https://app.example/pilot-invite/x")
    reply_button = 'href="mailto:gestoria@example.com" style="display'
    assert html.index("pilot-invite/x") < html.index(reply_button)
