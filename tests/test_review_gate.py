"""The review gate: only ready records (no flags, or approved) leave
tidybridge - see ClientRecord.is_ready() in models.py and the plan in
docs/superpowers/plans/2026-10-03-review-gate.md."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tidybridge.models import WebhookJob
from tidybridge.webhook_worker import process_due_jobs, process_due_provisioning_jobs

DEAD_URL = "http://127.0.0.1:1/unused"


@pytest.fixture(autouse=True)
def _configured_receivers(monkeypatch):
    import tidybridge.provisioning as provisioning_module
    import tidybridge.webhooks as webhooks_module

    monkeypatch.setattr(webhooks_module.settings, "webhook_url", DEAD_URL)
    monkeypatch.setattr(provisioning_module.settings, "provisioning_url", DEAD_URL)


def _upload(client: TestClient, csv: bytes) -> dict:
    resp = client.post("/records/upload", files={"file": ("test.csv", csv, "text/csv")})
    assert resp.status_code == 200
    return resp.json()


def _upload_flagged(client: TestClient) -> str:
    """One record with a bad email - flagged, but has a name to provision."""
    body = _upload(client, b"Full Name,E-mail\nJane Doe,not-an-email\n")
    assert body["records"][0]["has_issues"] is True
    return body["records"][0]["id"]


def _webhook_attempts(db: Session, record_id: str) -> int:
    db.expire_all()
    job = db.execute(select(WebhookJob).where(WebhookJob.record_id == record_id)).scalar_one()
    return job.attempt_number


def test_worker_sends_a_clean_record_right_away(client: TestClient, db: Session):
    _upload(client, b"Full Name,E-mail\nJane Doe,jane@example.com\n")
    assert process_due_jobs(db) == 1
    assert process_due_provisioning_jobs(db) == 1


def test_worker_holds_a_flagged_record_until_approved(client: TestClient, db: Session):
    record_id = _upload_flagged(client)

    assert process_due_jobs(db) == 0
    assert process_due_provisioning_jobs(db) == 0
    assert client.get(f"/records/{record_id}/webhook-status").json()["status"] == "awaiting_review"
    assert (
        client.get(f"/records/{record_id}/provisioning-status").json()["status"]
        == "awaiting_review"
    )

    assert client.post(f"/records/{record_id}/approve").status_code == 200

    assert process_due_jobs(db) == 1
    assert process_due_provisioning_jobs(db) == 1
    assert _webhook_attempts(db, record_id) == 2  # tried once (dead URL), rescheduled


def test_worker_sends_a_flagged_record_once_an_edit_fixes_it(client: TestClient, db: Session):
    record_id = _upload_flagged(client)
    assert process_due_jobs(db) == 0

    resp = client.patch(f"/records/{record_id}", json={"fields": {"email": "jane@example.com"}})
    assert resp.json()["has_issues"] is False

    assert process_due_jobs(db) == 1


def test_mapping_review_that_flags_a_record_holds_its_pending_job(
    client: TestClient, db: Session
):
    body = _upload(client, b"Full Name,E-mail,Joined\nJane Doe,jane@example.com,not-a-date\n")
    assert body["records"][0]["has_issues"] is False  # "Joined" defaults to string

    client.put(
        f"/column-mappings/{body['fingerprint']}",
        json={
            "field_resolutions": [
                {"raw_column": "Full Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
                {"raw_column": "Joined", "target_field": "joined", "type": "date"},
            ],
            "dedup_key_fields": [],
            "apply_to_run_id": body["ingestion_run_id"],
            "old_resolutions": body["field_resolutions"],
        },
    )

    assert process_due_jobs(db) == 0


def test_approve_is_idempotent_and_keeps_the_first_time(client: TestClient):
    record_id = _upload_flagged(client)

    first = client.post(f"/records/{record_id}/approve").json()
    second = client.post(f"/records/{record_id}/approve").json()

    assert first["approved_at"] is not None
    assert second["approved_at"] == first["approved_at"]


def test_approve_someone_elses_record_is_404(client: TestClient, other_client: TestClient):
    record_id = _upload_flagged(client)
    assert other_client.post(f"/records/{record_id}/approve").status_code == 404


def test_an_edit_clears_the_approval(client: TestClient, db: Session):
    record_id = _upload_flagged(client)
    client.post(f"/records/{record_id}/approve")

    resp = client.patch(f"/records/{record_id}", json={"fields": {"email": "still-bad"}})

    assert resp.json()["approved_at"] is None
    assert process_due_jobs(db) == 0


def test_manual_replays_refuse_an_unreviewed_record(client: TestClient):
    record_id = _upload_flagged(client)

    assert client.post(f"/records/{record_id}/webhooks/replay").status_code == 409
    assert client.post(f"/records/{record_id}/provisioning/replay").status_code == 409


def test_export_includes_approved_at(client: TestClient):
    record_id = _upload_flagged(client)
    approved_at = client.post(f"/records/{record_id}/approve").json()["approved_at"]

    header, row = client.get("/records/export").text.splitlines()[:2]

    assert "approved_at" in header.split(",")
    assert approved_at[:10] in row
