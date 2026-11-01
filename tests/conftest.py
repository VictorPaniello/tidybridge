"""Test fixtures. Tests run against a real PostgreSQL database
(tidybridge_test), not a mock or an in-memory substitute - the whole point
of this project is proving the ingest -> Postgres -> API path actually
works, and an in-memory fake DB would silently hide anything SQLAlchemy or
Postgres itself does differently from an assumption baked into a mock."""

from __future__ import annotations

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/tidybridge_test"
)
os.environ.setdefault("WEBHOOK_URL", "")  # no webhook during tests - keep them hermetic
os.environ.setdefault("PROVISIONING_URL", "")  # same - no provisioning target during tests

from alembic import command
from alembic.config import Config
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from fastapi_users.jwt import generate_jwt
from fastapi_users.manager import VERIFY_USER_TOKEN_AUDIENCE
from fastapi_users.password import PasswordHelper

import tidybridge.auth_models  # noqa: F401 - registers users/oauth_account on Base.metadata
from tidybridge.auth_models import User
from tidybridge.config import settings
from tidybridge.db import SessionLocal, engine, get_db
from tidybridge.main import app, limiter

# The real strict rate limit on /auth/jwt/login and friends (see
# main.py) would otherwise reject most of this suite - almost every test
# registers and logs in its own engineer via `client`/`other_client`,
# easily exceeding 5/minute across a full run. Rate limiting itself is
# covered by its own dedicated test (test_rate_limit.py), which re-enables
# the limiter just for that one test.
limiter.enabled = False


@pytest.fixture(scope="session", autouse=True)
def _migrate_schema():
    """Runs the real Alembic migration chain once per test session - the
    same mechanism production uses (the Dockerfile's `alembic upgrade
    head`) - instead of the Base.metadata.create_all() this used to call
    per-test. create_all() only ever creates *missing* tables; it silently
    leaves an existing table's columns stale on a schema change, which is
    exactly what caused two real bugs earlier in this project (see
    CHANGELOG) - a create_all()-based suite couldn't have caught either
    one, only actually running the migrations would have. CI's Postgres
    service container starts empty every run, so this always exercises the
    full chain there, not just "head applies cleanly on top of whatever
    was already there."

    Needs an already-migrated (or genuinely fresh) database - a local test
    DB still holding tables from before this change (create_all(), no
    alembic_version tracking) will hit a DuplicateTable error here; drop
    and recreate it once, the same fix used when this bit adopting Alembic
    for the app itself."""
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with engine.begin() as conn:
        # Every table here in one TRUNCATE, not one per table - Postgres
        # refuses to truncate a table another (non-listed) table still
        # has a live FK pointing at, so adding a new FK-holding table
        # (ingestion_runs -> users, client_records -> ingestion_runs)
        # without adding it here breaks every test that touches the DB,
        # not just ones that use it directly.
        conn.exec_driver_sql(
            "TRUNCATE webhook_jobs, webhook_deliveries, provisioning_jobs, "
            "provisioning_attempts, client_records, ingestion_runs, column_mappings, "
            "pilot_requests, "
            "oauth_account, accesstoken, users"
        )


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _override_get_db() -> None:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def create_user(email: str, password: str, *, verified: bool = True) -> uuid.UUID:
    """Writes the account row directly - stands in for scripts/invite.py +
    accepting the invite (that flow has its own test, test_invites.py).
    verified=False gives a pending invite with no usable password."""
    user_id = uuid.uuid4()
    with SessionLocal() as session:
        session.add(
            User(
                id=user_id,
                email=email,
                hashed_password=PasswordHelper().hash(password),
                is_verified=verified,
                has_password=verified,
                first_name="Test" if verified else None,
                last_name="Engineer" if verified else None,
            )
        )
        session.commit()
    return user_id


def invite_token(user_id: uuid.UUID, email: str) -> str:
    """The same token UserManager.invite() emails."""
    return generate_jwt(
        {"sub": str(user_id), "email": email, "aud": VERIFY_USER_TOKEN_AUDIENCE},
        settings.password_reset_secret,
        3600,
    )


def _authenticated_client() -> TestClient:
    """A TestClient logged in as a fresh, real engineer - goes through the
    actual JWT login endpoint rather than bypassing auth, so
    every test that uses one of these also exercises the real auth path
    production traffic goes through."""
    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)

    email = f"test-{uuid.uuid4()}@example.com"
    password = "Test-Password-Not-Real-123!"
    create_user(email, password)

    login_resp = test_client.post(
        "/auth/jwt/login", data={"username": email, "password": password}
    )
    assert login_resp.status_code == 200, login_resp.text
    token = login_resp.json()["access_token"]
    test_client.headers.update({"Authorization": f"Bearer {token}"})
    return test_client


@pytest.fixture
def client() -> TestClient:
    test_client = _authenticated_client()
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def other_client() -> TestClient:
    """A second engineer, logged in separately from `client` - for tests
    that verify one engineer can't see another's client records."""
    test_client = _authenticated_client()
    yield test_client
    app.dependency_overrides.clear()
