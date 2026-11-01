"""Required email verification: a registered but
unverified account can't log in or use the API until it follows the
link in the verification email (auth.py's on_after_register /
on_after_request_verify, main.py's get_verify_router)."""

from __future__ import annotations

import re
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from tidybridge.auth_models import AccessToken, User
from tidybridge.config import settings

TOKEN_RE = re.compile(r"verify-email\?token=([^\"&\s]+)")
PASSWORD = "Proveedor-Ejemplo-1!"


@pytest.fixture(autouse=True)
def _fake_resend(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_fake_key")
    sent: list[dict] = []

    async def fake_post(self, url, *, headers=None, json=None, **kwargs):
        sent.append(json)
        return httpx.Response(200, json={"id": "fake-email-id"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return sent


def _login(client: TestClient, email: str) -> httpx.Response:
    return client.post("/auth/jwt/login", data={"username": email, "password": PASSWORD})


def test_unverified_account_is_locked_out_until_the_link_is_used(_fake_resend, db):
    from tidybridge.main import app

    client = TestClient(app)
    email = f"verify-{uuid.uuid4()}@example.com"
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "first_name": "Ana", "last_name": "Ejemplo"},
    )
    assert resp.status_code == 201, resp.text

    resp = _login(client, email)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "LOGIN_USER_NOT_VERIFIED"

    # A session that exists anyway (e.g. issued before this change) is
    # refused by every protected route, not just at login.
    user = db.query(User).filter(User.email == email).one()
    session_token = "pre-existing-session-token"
    db.add(AccessToken(token=session_token, user_id=user.id))
    db.commit()
    auth = {"Authorization": f"Bearer {session_token}"}
    assert client.get("/records", headers=auth).status_code == 403
    assert client.get("/users/me", headers=auth).status_code == 403

    assert _fake_resend and _fake_resend[-1]["to"] == [email]
    token = TOKEN_RE.search(_fake_resend[-1]["html"]).group(1)
    resp = client.post("/auth/verify", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_verified"] is True

    assert client.get("/records", headers=auth).status_code == 200
    assert _login(client, email).status_code == 200


def test_invalid_verification_token_is_rejected():
    from tidybridge.main import app

    resp = TestClient(app).post("/auth/verify", json={"token": "not-a-real-token"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "VERIFY_USER_BAD_TOKEN"

