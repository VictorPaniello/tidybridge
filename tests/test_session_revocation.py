"""POST /auth/jwt/logout (auth.py's DatabaseStrategy, wired via
fastapi-users' get_auth_router). Regression coverage for the gap found
via a follow-up security review: the old JWTStrategy made logout a
no-op - a JWT can't be invalidated before it expires, by design - so a
bearer token stayed valid for its full 7-day lifetime even after the
caller "logged out". DatabaseStrategy backs each session with a row in
the accesstoken table, so logout can actually delete it."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _register_and_login(client: TestClient) -> str:
    email = f"logout-{uuid.uuid4()}@example.com"
    password = "Test-Password-Not-Real-123!"
    resp = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "Logout",
            "last_name": "Test",
        },
    )
    assert resp.status_code == 201, resp.text

    resp = client.post("/auth/jwt/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_logout_revokes_the_token_immediately():
    from tidybridge.main import app

    client = TestClient(app)
    token = _register_and_login(client)
    client.headers.update({"Authorization": f"Bearer {token}"})

    assert client.get("/users/me").status_code == 200

    logout_resp = client.post("/auth/jwt/logout")
    assert logout_resp.status_code == 204

    # Same token, reused after logout - must now be rejected. With the
    # old stateless JWTStrategy this would still succeed, since logout
    # had no way to invalidate it.
    assert client.get("/users/me").status_code == 401


def test_logging_out_does_not_affect_a_different_session():
    """Deleting one session's row must not touch another session's -
    each login gets its own accesstoken row, not one shared per user."""
    from tidybridge.main import app

    client_a = TestClient(app)
    client_b = TestClient(app)

    email = f"multi-session-{uuid.uuid4()}@example.com"
    password = "Test-Password-Not-Real-123!"
    resp = client_a.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "Multi",
            "last_name": "Session",
        },
    )
    assert resp.status_code == 201, resp.text

    token_a = client_a.post(
        "/auth/jwt/login", data={"username": email, "password": password}
    ).json()["access_token"]
    token_b = client_b.post(
        "/auth/jwt/login", data={"username": email, "password": password}
    ).json()["access_token"]
    client_a.headers.update({"Authorization": f"Bearer {token_a}"})
    client_b.headers.update({"Authorization": f"Bearer {token_b}"})

    assert client_a.post("/auth/jwt/logout").status_code == 204

    assert client_a.get("/users/me").status_code == 401
    assert client_b.get("/users/me").status_code == 200
