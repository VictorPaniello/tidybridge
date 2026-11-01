"""UserManager.validate_password (auth.py) - fastapi-users applies no
strength requirement by default, which is what let a one-character
password through before this policy existed (found in a security
review)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from conftest import create_user, invite_token


def _accept(password: str):
    from tidybridge.main import app

    email = f"policy-{uuid.uuid4()}@example.com"
    user_id = create_user(email, "Unknown-Random-1!", verified=False)
    return TestClient(app).post(
        "/auth/accept-invite", json={"token": invite_token(user_id, email), "password": password}
    )


@pytest.mark.parametrize(
    "password,expected_reason_fragment",
    [
        ("Short1!", "at least 8 characters"),
        ("alllowercase123!", "uppercase letter"),
        ("ALLUPPERCASE123!", "lowercase letter"),
        ("NoDigitsHere!", "digit"),
        ("NoSpecial12345", "special character"),
    ],
)
def test_weak_password_is_rejected(password: str, expected_reason_fragment: str):
    response = _accept(password)
    assert response.status_code == 400
    reason = response.json()["detail"]["reason"]
    assert expected_reason_fragment in reason


def test_strong_password_is_accepted():
    assert _accept("Str0ng-Pass!").status_code == 200
