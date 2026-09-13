"""Structured logging + a correlation ID threaded through
upload -> record -> webhook/provisioning attempt - the observability gap
noted in the 2026-09-13 session handoff. The correlation ID is
IngestionRun.id itself (already the thing every record from one upload
points back to via ingestion_run_id), not a separately invented field."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tidybridge.logging_setup import JsonFormatter, configure_logging


@pytest.fixture
def tidybridge_logs(caplog):
    """caplog.at_level()/set_level() only ever adjust a logger's level -
    they never attach caplog's own capture handler anywhere but the root
    logger, and the "tidybridge" logger deliberately sets
    propagate=False (avoids double-printing through root once
    logging_setup.py's own handler is attached - see its docstring), so
    nothing reaches root by default. Attaching the handler directly here
    works regardless of that setting."""
    logger = logging.getLogger("tidybridge")
    caplog.set_level(logging.INFO, logger="tidybridge")
    logger.addHandler(caplog.handler)
    try:
        yield caplog
    finally:
        logger.removeHandler(caplog.handler)


def _upload_single_row(client: TestClient):
    csv_body = (
        "Customer,Contact Email,Order Date,Order Total,Mobile Number\n"
        "Ada Lovelace,ada@shop.com,2026-09-01,100.00,+34 600 00 00 00\n"
    )
    return client.post(
        "/records/upload", files={"file": ("single.csv", csv_body.encode(), "text/csv")}
    )


def test_json_formatter_renders_the_message_and_every_extra_field():
    record = logging.LogRecord(
        name="tidybridge.webhooks",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="webhook.attempt",
        args=(),
        exc_info=None,
    )
    record.correlation_id = "abc-123"
    record.status_code = 200

    parsed = json.loads(JsonFormatter().format(record))

    assert parsed["event"] == "webhook.attempt"
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "tidybridge.webhooks"
    assert parsed["correlation_id"] == "abc-123"
    assert parsed["status_code"] == 200


def test_configure_logging_does_not_stack_a_second_handler_on_repeat_calls():
    logger = configure_logging()
    handler_count = len(logger.handlers)
    configure_logging()
    assert len(logger.handlers) == handler_count


def test_upload_logs_received_and_completed_sharing_one_correlation_id(
    client: TestClient, tidybridge_logs
):
    response = _upload_single_row(client)
    run_id = response.json()["ingestion_run_id"]

    received = next(r for r in tidybridge_logs.records if r.getMessage() == "upload.received")
    completed = next(r for r in tidybridge_logs.records if r.getMessage() == "upload.completed")

    assert received.correlation_id == run_id
    assert completed.correlation_id == run_id
    assert completed.rows_total == 1
    assert completed.rows_clean == 1
    assert completed.rows_flagged == 0


def test_upload_failure_is_logged_with_the_correlation_id_and_still_raises(
    client: TestClient, tidybridge_logs, monkeypatch
):
    import tidybridge.ingest as ingest_module

    def _boom(db, record):
        raise ValueError("simulated ingest failure")

    monkeypatch.setattr(ingest_module, "enqueue_delivery", _boom)

    with pytest.raises(ValueError, match="simulated ingest failure"):
        _upload_single_row(client)

    failed = next(r for r in tidybridge_logs.records if r.getMessage() == "upload.failed")
    assert failed.correlation_id  # a real id was assigned before the failure
    assert "simulated ingest failure" in failed.error
    # No upload.completed for a run that never finished.
    assert not any(r.getMessage() == "upload.completed" for r in tidybridge_logs.records)


def test_webhook_attempt_is_logged_with_the_uploads_correlation_id(
    client: TestClient, tidybridge_logs, monkeypatch
):
    import tidybridge.webhooks as webhooks_module
    from tidybridge.db import SessionLocal
    from tidybridge.webhook_worker import process_due_jobs

    monkeypatch.setattr(webhooks_module.settings, "webhook_url", "http://127.0.0.1:1/hook")
    run_id = _upload_single_row(client).json()["ingestion_run_id"]

    db: Session = SessionLocal()
    try:
        process_due_jobs(db)
    finally:
        db.close()

    attempt = next(r for r in tidybridge_logs.records if r.getMessage() == "webhook.attempt")
    assert attempt.correlation_id == run_id
    assert attempt.success is False  # nothing listening on 127.0.0.1:1


def test_provisioning_attempt_is_logged_with_the_uploads_correlation_id(
    client: TestClient, tidybridge_logs, monkeypatch
):
    import tidybridge.provisioning as provisioning_module
    from tidybridge.db import SessionLocal
    from tidybridge.webhook_worker import process_due_provisioning_jobs

    monkeypatch.setattr(
        provisioning_module.settings, "provisioning_url", "http://127.0.0.1:1/Users"
    )
    run_id = _upload_single_row(client).json()["ingestion_run_id"]

    db: Session = SessionLocal()
    try:
        process_due_provisioning_jobs(db)
    finally:
        db.close()

    attempt = next(r for r in tidybridge_logs.records if r.getMessage() == "provisioning.attempt")
    assert attempt.correlation_id == run_id
    assert attempt.success is False
