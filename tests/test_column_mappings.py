"""GET/PUT /column-mappings/{fingerprint} - the entirely optional,
prospective-only review step.

Note: the PUT test below uses "Client Name" (not "Full Name") as the raw
header precisely because "Full Name" already alias-matches full_name by
default - "Client Name" doesn't, so a passing assertion actually proves the
saved mapping got applied, not just that the default would have worked
anyway."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _upload(client: TestClient):
    return client.post(
        "/records/upload",
        files={"file": ("test.csv", b"Full Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")},
    )


def test_get_unsaved_fingerprint_returns_404(client: TestClient):
    resp = client.get("/column-mappings/nonexistent-fingerprint")
    assert resp.status_code == 404


def test_put_saves_a_resolution_applied_on_next_upload(client: TestClient):
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Client Name", "E-mail"])
    resp = client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": [
                {"raw_column": "Client Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            "dedup_key_fields": ["email"],
        },
    )
    assert resp.status_code == 200

    upload = client.post(
        "/records/upload",
        files={"file": ("test.csv", b"Client Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")},
    )
    assert upload.json()["records"][0]["fields"]["full_name"] == "Jane Doe"

    get_resp = client.get(f"/column-mappings/{fingerprint}")
    assert get_resp.status_code == 200
    assert get_resp.json()["dedup_key_fields"] == ["email"]


def test_put_rejects_invalid_target_field(client: TestClient):
    resp = client.put(
        "/column-mappings/anyfingerprint",
        json={
            "field_resolutions": [
                {"raw_column": "Full Name", "target_field": "1bad", "type": "string"}
            ],
            "dedup_key_fields": [],
        },
    )
    assert resp.status_code == 400


def test_mapping_is_owner_scoped(client: TestClient, other_client: TestClient):
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Client Name", "E-mail"])
    client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": [
                {"raw_column": "Client Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            "dedup_key_fields": [],
        },
    )
    other_upload = other_client.post(
        "/records/upload",
        files={"file": ("test.csv", b"Client Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")},
    )
    # other_client never saved a mapping for this shape - "Client Name" has no
    # alias, so without client's mapping it falls back to the default
    # (target_field "client_name", not "full_name").
    assert other_upload.json()["records"][0]["fields"].get("full_name") is None


def test_column_mappings_endpoints_require_auth():
    from tidybridge.main import app

    unauthenticated = TestClient(app)
    assert unauthenticated.get("/column-mappings/anyfingerprint").status_code == 401
    assert (
        unauthenticated.put(
            "/column-mappings/anyfingerprint",
            json={"field_resolutions": [], "dedup_key_fields": []},
        ).status_code
        == 401
    )
