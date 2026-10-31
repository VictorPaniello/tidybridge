"""PATCH /users/me hardening (auth.py's UserUpdate / UserManager.update):
the email can't change (it's the invitation), a new password needs the
current one, and changing it ends every session."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tidybridge.config import settings

PASSWORD = "Proveedor-Ejemplo-1!"
NEW_PASSWORD = "Proveedor-Ejemplo-2!"


def _register(client: TestClient, email: str) -> None:
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "first_name": "Ana", "last_name": "Ejemplo"},
    )
    assert resp.status_code == 201, resp.text


def _login(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    resp = client.post("/auth/jwt/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_email_cannot_be_changed_and_invitation_stays_used(monkeypatch):
    from tidybridge.main import app

    client = TestClient(app)
    invited = f"invited-{uuid.uuid4()}@example.com"
    monkeypatch.setattr(settings, "signup_allowlist", invited)
    _register(client, invited)
    auth = _login(client, invited)

    resp = client.patch("/users/me", headers=auth, json={"email": "other@example.com"})
    assert resp.status_code == 422
    assert client.get("/users/me", headers=auth).json()["email"] == invited

    again = client.post(
        "/auth/register",
        json={"email": invited, "password": PASSWORD, "first_name": "X", "last_name": "Y"},
    )
    assert again.status_code == 400  # REGISTER_USER_ALREADY_EXISTS


def test_password_change_requires_the_current_password():
    from tidybridge.main import app

    client = TestClient(app)
    email = f"pw-{uuid.uuid4()}@example.com"
    _register(client, email)
    auth = _login(client, email)

    wrong = {"password": NEW_PASSWORD, "current_password": "Wrong-1!"}
    for body in ({"password": NEW_PASSWORD}, wrong):
        resp = client.patch("/users/me", headers=auth, json=body)
        assert resp.status_code == 400
        assert resp.json()["detail"]["reason"] == "Current password is incorrect"
    _login(client, email)  # unchanged

    resp = client.patch(
        "/users/me", headers=auth, json={"password": NEW_PASSWORD, "current_password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    _login(client, email, NEW_PASSWORD)


def test_password_change_ends_every_session():
    from tidybridge.main import app

    client = TestClient(app)
    email = f"sessions-{uuid.uuid4()}@example.com"
    _register(client, email)
    other_device = _login(client, email)
    this_device = _login(client, email)

    resp = client.patch(
        "/users/me",
        headers=this_device,
        json={"password": NEW_PASSWORD, "current_password": PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    assert client.get("/users/me", headers=other_device).status_code == 401
    assert client.get("/users/me", headers=this_device).status_code == 401


def test_profile_update_without_password_keeps_the_session():
    from tidybridge.main import app

    client = TestClient(app)
    email = f"profile-{uuid.uuid4()}@example.com"
    _register(client, email)
    auth = _login(client, email)

    resp = client.patch("/users/me", headers=auth, json={"first_name": "Proveedor"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_password"] is True
    assert client.get("/users/me", headers=auth).status_code == 200
