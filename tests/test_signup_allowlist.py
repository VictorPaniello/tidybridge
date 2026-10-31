"""Invite-only signup (config.py's SIGNUP_ALLOWLIST, enforced in auth.py's
UserManager.create() and oauth_callback()). OAuth is driven by calling
oauth_callback() directly - the provider handshake itself isn't what's
under test, same choice as test_oauth_redirect.py."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from tidybridge.auth import SIGNUP_CLOSED, UserManager
from tidybridge.auth_models import OAuthAccount, User
from tidybridge.config import Settings, settings


def _register(client: TestClient, email: str):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Invite-Only-1!",
            "first_name": "Ana",
            "last_name": "Ejemplo",
        },
    )


def test_signup_allowed_parsing():
    assert Settings(signup_allowlist="").signup_allowed("anyone@example.com")
    s = Settings(signup_allowlist=" Ana@Example.com , ,b@example.com")
    assert s.signup_allowed("ana@example.COM")
    assert s.signup_allowed("b@example.com")
    assert not s.signup_allowed("c@example.com")


def test_register_open_when_allowlist_unset(monkeypatch):
    from tidybridge.main import app

    monkeypatch.setattr(settings, "signup_allowlist", "")
    assert _register(TestClient(app), f"open-{uuid.uuid4()}@example.com").status_code == 201


def test_register_blocks_emails_outside_allowlist(monkeypatch):
    from tidybridge.main import app

    monkeypatch.setattr(settings, "signup_allowlist", "invited@example.com")
    client = TestClient(app)

    resp = _register(client, f"stranger-{uuid.uuid4()}@example.com")
    assert resp.status_code == 403
    assert resp.json()["detail"] == SIGNUP_CLOSED

    assert _register(client, "Invited@Example.com").status_code == 201


async def _oauth_sign_in(email: str, account_id: str) -> User:
    # Own engine per call: the shared async engine's pool is bound to
    # whichever event loop first used it, and pytest-asyncio gives each
    # test a fresh loop.
    engine = create_async_engine(settings.database_url)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            manager = UserManager(SQLAlchemyUserDatabase(session, User, OAuthAccount))
            return await manager.oauth_callback("github", "token", account_id, email)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_oauth_blocks_new_users_outside_allowlist(monkeypatch):
    monkeypatch.setattr(settings, "signup_allowlist", "invited@example.com")

    with pytest.raises(HTTPException) as exc:
        await _oauth_sign_in(f"stranger-{uuid.uuid4()}@example.com", "gh-stranger")
    assert exc.value.status_code == 403
    assert exc.value.detail == SIGNUP_CLOSED

    user = await _oauth_sign_in("INVITED@example.com", "gh-invited")
    assert user.email.lower() == "invited@example.com"


@pytest.mark.asyncio
async def test_oauth_lets_existing_users_back_in_after_allowlist_tightens(monkeypatch):
    monkeypatch.setattr(settings, "signup_allowlist", "")
    email = f"early-{uuid.uuid4()}@example.com"
    first = await _oauth_sign_in(email, "gh-early")

    monkeypatch.setattr(settings, "signup_allowlist", "someone-else@example.com")
    again = await _oauth_sign_in(email, "gh-early")
    assert again.id == first.id
