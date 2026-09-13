"""main.py's require_staging_gate_password middleware - a lightweight
access gate for the staging sandbox environment (see config.py's
staging_gate_password docstring). Unlike enable_api_docs, this setting
is read fresh on every request rather than baked in at FastAPI()
construction time, so tests can monkeypatch it directly against the
already-built app/settings this suite imports."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tidybridge.config import settings
from tidybridge.main import app


def test_gate_is_off_by_default():
    """staging_gate_password is None in every test run (never set in
    .env.example, CI, or this suite) - every other test in this whole
    project already depends on that implicitly, this just says so."""
    assert settings.staging_gate_password is None
    client = TestClient(app)
    assert client.get("/health").status_code == 200


def test_gate_rejects_a_request_with_no_header(monkeypatch):
    monkeypatch.setattr(settings, "staging_gate_password", "correct-horse")
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 401


def test_gate_rejects_the_wrong_password(monkeypatch):
    monkeypatch.setattr(settings, "staging_gate_password", "correct-horse")
    client = TestClient(app)
    response = client.get("/health", headers={"X-Staging-Password": "wrong"})
    assert response.status_code == 401


def test_gate_allows_the_right_password(monkeypatch):
    monkeypatch.setattr(settings, "staging_gate_password", "correct-horse")
    client = TestClient(app)
    response = client.get("/health", headers={"X-Staging-Password": "correct-horse"})
    assert response.status_code == 200


def test_gate_does_not_block_cors_preflight(monkeypatch):
    """A CORS preflight (OPTIONS) never carries custom headers - if this
    blocked it too, every real cross-origin request from the frontend
    would fail before the browser even sent it, regardless of whether
    the frontend attaches the right header on the actual request."""
    monkeypatch.setattr(settings, "staging_gate_password", "correct-horse")
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": settings.frontend_url,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
