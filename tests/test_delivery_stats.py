"""GET /stats/delivery-success - the SQL-depth endpoint: a join (scope by
owner through client_records, since WebhookDelivery/ProvisioningAttempt
carry no owner_id of their own), a filtered daily aggregation (GROUP BY
day, COUNT(*) FILTER (WHERE success)), and a window function (7-day
rolling average of the daily rate) - see the 2026-09-13 session handoff's
SQL-depth gap."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from tidybridge.models import ProvisioningAttempt, WebhookDelivery


def _upload_single_row(client: TestClient):
    csv_body = (
        "Customer,Contact Email,Order Date,Order Total,Mobile Number\n"
        "Ada Lovelace,ada@shop.com,2026-09-01,100.00,+34 600 00 00 00\n"
    )
    return client.post(
        "/records/upload", files={"file": ("single.csv", csv_body.encode(), "text/csv")}
    )


def _add_attempt(db: Session, model, record_id, *, success: bool, when: datetime):
    """attempted_at has a server_default - inserting then updating (like
    test_retention.py's _backdate) is the only way to control which day a
    row lands in, since the model default fires at INSERT time."""
    row = model(record_id=record_id, url="http://example.com", success=success)
    db.add(row)
    db.commit()
    db.execute(update(model).where(model.id == row.id).values(attempted_at=when))
    db.commit()


def test_success_rate_requires_auth():
    from tidybridge.main import app

    unauthenticated = TestClient(app)
    response = unauthenticated.get("/stats/delivery-success", params={"channel": "webhook"})
    assert response.status_code == 401


def test_success_rate_rejects_an_unknown_channel(client: TestClient):
    response = client.get("/stats/delivery-success", params={"channel": "carrier-pigeon"})
    assert response.status_code == 422


def test_success_rate_defaults_to_the_trailing_30_days(client: TestClient):
    response = client.get("/stats/delivery-success", params={"channel": "webhook"})
    assert response.status_code == 200
    body = response.json()
    today = datetime.now(UTC).date()
    assert body == {
        "channel": "webhook",
        "date_from": str(today - timedelta(days=29)),
        "date_to": str(today),
        "points": [],
    }


def test_success_rate_aggregates_by_day_and_scopes_to_the_caller(
    client: TestClient, other_client: TestClient, db: Session
):
    record_id = _upload_single_row(client).json()["records"][0]["id"]
    other_record_id = _upload_single_row(other_client).json()["records"][0]["id"]

    today = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    _add_attempt(db, WebhookDelivery, record_id, success=True, when=yesterday)
    _add_attempt(db, WebhookDelivery, record_id, success=False, when=yesterday)
    _add_attempt(db, WebhookDelivery, record_id, success=True, when=today)
    # Another engineer's delivery - must never leak into this caller's stats.
    _add_attempt(db, WebhookDelivery, other_record_id, success=True, when=today)

    response = client.get("/stats/delivery-success", params={"channel": "webhook"})
    assert response.json()["points"] == [
        {
            "day": str(yesterday.date()),
            "attempts": 2,
            "successes": 1,
            "success_rate": 0.5,
            "rolling_7d_rate": 0.5,
        },
        {
            "day": str(today.date()),
            "attempts": 1,
            "successes": 1,
            "success_rate": 1.0,
            "rolling_7d_rate": 0.75,  # avg(0.5, 1.0) over the two days seen so far
        },
    ]


def test_success_rate_covers_the_provisioning_channel_too(client: TestClient, db: Session):
    record_id = _upload_single_row(client).json()["records"][0]["id"]
    now = datetime.now(UTC)

    _add_attempt(db, ProvisioningAttempt, record_id, success=True, when=now)

    response = client.get("/stats/delivery-success", params={"channel": "provisioning"})
    assert response.json()["points"] == [
        {
            "day": str(now.date()),
            "attempts": 1,
            "successes": 1,
            "success_rate": 1.0,
            "rolling_7d_rate": 1.0,
        }
    ]


def test_success_rate_respects_an_explicit_date_range(client: TestClient, db: Session):
    record_id = _upload_single_row(client).json()["records"][0]["id"]
    now = datetime.now(UTC)
    old = now - timedelta(days=100)

    _add_attempt(db, WebhookDelivery, record_id, success=True, when=old)
    _add_attempt(db, WebhookDelivery, record_id, success=True, when=now)

    response = client.get(
        "/stats/delivery-success",
        params={"channel": "webhook", "date_from": str(old.date()), "date_to": str(old.date())},
    )
    points = response.json()["points"]
    assert len(points) == 1
    assert points[0]["day"] == str(old.date())


def test_success_rate_rejects_an_inverted_range(client: TestClient):
    response = client.get(
        "/stats/delivery-success",
        params={"channel": "webhook", "date_from": "2026-01-02", "date_to": "2026-01-01"},
    )
    assert response.status_code == 400


def test_success_rate_rejects_a_range_over_the_year_cap(client: TestClient):
    response = client.get(
        "/stats/delivery-success",
        params={"channel": "webhook", "date_from": "2020-01-01", "date_to": "2025-01-01"},
    )
    assert response.status_code == 400
