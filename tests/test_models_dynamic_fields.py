"""ClientRecord.fields is the real storage; full_name/email/etc. are
read-only properties over it, so every existing consumer (webhooks,
provisioning, export, ClientRecordOut) keeps working unchanged."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tidybridge.models import ClientRecord, ColumnMapping


def test_legacy_property_accessors_read_from_fields(db):
    record = ClientRecord(
        owner_id=None,
        source_file="test.csv",
        fields={"full_name": "Jane Doe", "email": "jane@example.com"},
        has_issues=False,
    )
    assert record.full_name == "Jane Doe"
    assert record.email == "jane@example.com"
    assert record.signup_date is None  # not in fields at all - no crash


def test_column_mapping_round_trips(client: TestClient, db):
    owner_id = client.get("/users/me").json()["id"]
    mapping = ColumnMapping(
        owner_id=owner_id,
        header_fingerprint="abc123",
        field_resolutions=[{"raw_column": "Name", "target_field": "full_name", "type": "string"}],
        dedup_key_fields=["full_name"],
    )
    db.add(mapping)
    db.flush()
    fetched = db.get(ColumnMapping, mapping.id)
    assert fetched.dedup_key_fields == ["full_name"]
