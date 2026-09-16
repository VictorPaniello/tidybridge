"""ingest_file: dynamic per-shape resolution, generalized dedup."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tidybridge.ingest import ingest_file, load_schema
from tidybridge.mapping import compute_fingerprint
from tidybridge.models import ColumnMapping


def _content(csv_text: str) -> bytes:
    return csv_text.encode("utf-8")


def _owner_id(client: TestClient) -> uuid.UUID:
    return uuid.UUID(client.get("/users/me").json()["id"])


def test_unseen_shape_uses_default_and_ingests_immediately(client: TestClient, db):
    owner_id = _owner_id(client)
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    records, run, mapping_is_default = ingest_file(
        db, "test.csv", content, load_schema(), owner_id
    )
    assert mapping_is_default is True
    assert len(records) == 1
    assert records[0].fields == {"full_name": "Jane Doe", "email": "jane@example.com"}


def test_unrecognized_column_becomes_its_own_field(client: TestClient, db):
    owner_id = _owner_id(client)
    content = _content("Full Name,Age\nJane Doe,30\n")
    records, _run, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert records[0].fields == {"full_name": "Jane Doe", "age": "30"}


def test_saved_mapping_applies_silently_on_next_upload(client: TestClient, db):
    owner_id = _owner_id(client)
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    db.add(
        ColumnMapping(
            owner_id=owner_id,
            header_fingerprint=fingerprint,
            field_resolutions=[
                {"raw_column": "Full Name", "target_field": "name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email_address", "type": "email"},
            ],
            dedup_key_fields=[],
        )
    )
    db.commit()

    records, _run, mapping_is_default = ingest_file(
        db, "test.csv", content, load_schema(), owner_id
    )
    assert mapping_is_default is False
    assert records[0].fields == {"name": "Jane Doe", "email_address": "jane@example.com"}


def test_dedup_key_skips_already_ingested_rows_across_uploads(client: TestClient, db):
    owner_id = _owner_id(client)
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    db.add(
        ColumnMapping(
            owner_id=owner_id,
            header_fingerprint=fingerprint,
            field_resolutions=[
                {"raw_column": "Full Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            dedup_key_fields=["email"],
        )
    )
    db.commit()

    ingest_file(db, "test.csv", content, load_schema(), owner_id)
    _records, run2, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert run2.rows_skipped_existing == 1


def test_default_resolution_auto_dedups_by_email_with_zero_config(client: TestClient, db):
    # No saved ColumnMapping at all - the default resolution itself
    # picks up email as the dedup key, so re-uploading an unchanged file
    # stays a no-op the same way it always has, with no configuration.
    owner_id = _owner_id(client)
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    ingest_file(db, "test.csv", content, load_schema(), owner_id)
    _records, run2, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert run2.rows_skipped_existing == 1


def test_no_dedup_key_means_every_row_inserts(client: TestClient, db):
    # A shape with no email-like column has nothing safe to default to -
    # every upload inserts fresh until an engineer explicitly picks a key.
    owner_id = _owner_id(client)
    content = _content("Full Name,Age\nJane Doe,30\n")
    ingest_file(db, "test.csv", content, load_schema(), owner_id)
    _records, run2, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert run2.rows_skipped_existing == 0
