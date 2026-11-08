"""Settings.require_real_secrets (config.py, called by main.py at startup):
a deployed API (its database isn't on localhost - Railway, Coolify, any
host) refuses to start with the public default secrets, or with both
secrets equal. Local dev and tests are unaffected."""

from __future__ import annotations

import pytest

from tidybridge.config import Settings


REMOTE_DB = "postgresql://u:p@postgres.railway.internal:5432/db"


def _settings(**secrets) -> Settings:
    return Settings(_env_file=None, database_url=REMOTE_DB, **secrets)


@pytest.fixture
def deployed(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("PASSWORD_RESET_SECRET", raising=False)


@pytest.mark.usefixtures("deployed")
@pytest.mark.parametrize(
    "secrets,missing",
    [
        ({"password_reset_secret": "real-reset-secret"}, "JWT_SECRET"),
        ({"jwt_secret": "real-jwt-secret"}, "PASSWORD_RESET_SECRET"),
    ],
)
def test_deployment_refuses_a_default_secret(secrets, missing):
    with pytest.raises(RuntimeError, match=missing):
        _settings(**secrets).require_real_secrets()


@pytest.mark.usefixtures("deployed")
def test_deployment_refuses_equal_secrets():
    with pytest.raises(RuntimeError, match="must be different"):
        _settings(jwt_secret="same", password_reset_secret="same").require_real_secrets()


@pytest.mark.usefixtures("deployed")
def test_deployment_starts_with_its_own_secrets():
    _settings(jwt_secret="real-jwt", password_reset_secret="real-reset").require_real_secrets()


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_local_dev_keeps_the_defaults(monkeypatch, host):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("PASSWORD_RESET_SECRET", raising=False)
    Settings(
        _env_file=None, database_url=f"postgresql://postgres:postgres@{host}:5432/tidybridge"
    ).require_real_secrets()


@pytest.mark.usefixtures("deployed")
def test_any_host_counts_as_deployed_not_just_railway():
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(
            _env_file=None, database_url="postgresql://u:p@coolify-db:5432/db"
        ).require_real_secrets()
