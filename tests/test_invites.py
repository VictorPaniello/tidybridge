"""Invite-only accounts (auth.py's UserManager.invite / accept_invite,
main.py's /auth/accept-invite). There's no /auth/register: an account
exists only once invited, and it's unusable until the invitee sets their
password through the emailed link - so nobody can claim an invited
address, or choose its password, without reading that inbox."""

from __future__ import annotations

import re
import uuid

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.exceptions import UserAlreadyVerified
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from conftest import create_user, invite_token
from tidybridge.auth import SIGNUP_CLOSED, UserManager
from tidybridge.auth_models import AccessToken, OAuthAccount, User
from tidybridge.config import settings

TOKEN_RE = re.compile(r"accept-invite\?token=([^\"&\s]+)")
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


async def _with_manager(fn):
    # Own engine per call: the shared async engine's pool is bound to
    # whichever event loop first used it, and pytest-asyncio gives each
    # test a fresh loop.
    engine = create_async_engine(settings.database_url)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            return await fn(UserManager(SQLAlchemyUserDatabase(session, User, OAuthAccount)))
    finally:
        await engine.dispose()


def _client() -> TestClient:
    from tidybridge.main import app

    return TestClient(app)


def _login(client: TestClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return client.post("/auth/jwt/login", data={"username": email, "password": password})


def test_there_is_no_public_registration():
    resp = _client().post(
        "/auth/register",
        json={"email": "ana@example.com", "password": PASSWORD},
    )
    assert resp.status_code in (404, 405)


@pytest.mark.asyncio
async def test_invite_link_sets_the_password_and_unlocks_the_account(sent):
    email = f"invited-{uuid.uuid4()}@example.com"
    await _with_manager(lambda m: m.invite(email))

    client = _client()
    # Pending: no password anyone knows, so no login.
    assert _login(client, email).status_code == 400

    assert sent[-1]["to"] == [email]
    token = TOKEN_RE.search(sent[-1]["html"]).group(1)
    resp = client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_verified"] is True

    resp = _login(client, email)
    assert resp.status_code == 200
    auth = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert client.get("/records", headers=auth).status_code == 200

    # Single use: the same link can't set another password later.
    resp = client.post("/auth/accept-invite", json={"token": token, "password": "Otra-Clave-2!"})
    assert resp.json()["detail"] == "VERIFY_USER_ALREADY_VERIFIED"
    assert _login(client, email, "Otra-Clave-2!").status_code == 400


@pytest.mark.asyncio
async def test_reinvite_sends_a_fresh_link_but_not_to_an_accepted_account(sent):
    email = f"reinvite-{uuid.uuid4()}@example.com"
    await _with_manager(lambda m: m.invite(email))
    await _with_manager(lambda m: m.invite(email))
    assert len(sent) == 2

    token = TOKEN_RE.search(sent[-1]["html"]).group(1)
    _client().post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
    with pytest.raises(UserAlreadyVerified):
        await _with_manager(lambda m: m.invite(email))


def test_bad_token_and_weak_password_are_rejected_and_change_nothing():
    email = f"pending-{uuid.uuid4()}@example.com"
    user_id = create_user(email, "Unknown-Random-1!", verified=False)
    client = _client()

    resp = client.post("/auth/accept-invite", json={"token": "not-a-token", "password": PASSWORD})
    assert resp.json()["detail"] == "VERIFY_USER_BAD_TOKEN"

    resp = client.post(
        "/auth/accept-invite", json={"token": invite_token(user_id, email), "password": "weak"}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "RESET_PASSWORD_INVALID_PASSWORD"
    # Still pending - never verified without a password the invitee chose.
    assert _login(client, email, "weak").status_code == 400


def test_pending_session_is_refused_everywhere(db):
    """Belt and braces: even a session that somehow exists for a pending
    account gets 403 - current_active_user requires is_verified."""
    user_id = create_user(f"pending-{uuid.uuid4()}@example.com", PASSWORD, verified=False)
    db.add(AccessToken(token="pending-session", user_id=user_id))
    db.commit()
    auth = {"Authorization": "Bearer pending-session"}
    client = _client()
    assert client.get("/records", headers=auth).status_code == 403
    assert client.get("/users/me", headers=auth).status_code == 403


@pytest.mark.asyncio
async def test_oauth_never_creates_an_account():
    with pytest.raises(HTTPException) as exc:
        await _with_manager(
            lambda m: m.oauth_callback("github", "token", "gh-stranger", "stranger@example.com")
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == SIGNUP_CLOSED


@pytest.mark.asyncio
async def test_oauth_signs_an_existing_account_back_in():
    email = f"existing-{uuid.uuid4()}@example.com"
    user_id = create_user(email, PASSWORD)
    user = await _with_manager(
        lambda m: m.oauth_callback(
            "github", "token", "gh-existing", email, associate_by_email=True
        )  # as main.py's router does
    )
    assert user.id == user_id


@pytest.mark.asyncio
async def test_oauth_cannot_attach_to_a_pending_invite(db):
    email = f"pending-{uuid.uuid4()}@example.com"
    user_id = create_user(email, PASSWORD, verified=False)
    with pytest.raises(HTTPException) as exc:
        await _with_manager(
            lambda m: m.oauth_callback(
                "github", "token", "gh-attacker", email, associate_by_email=True
            )
        )
    assert exc.value.status_code == 403
    assert db.query(OAuthAccount).filter(OAuthAccount.user_id == user_id).count() == 0
