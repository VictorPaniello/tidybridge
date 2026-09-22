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


def test_upload_response_carries_the_fingerprint_for_its_own_shape(client: TestClient):
    # So the frontend's "review this mapping?" affordance (shown when
    # mapping_is_default is true) has something to GET/PUT against -
    # the backend already computes this per-upload, just wasn't exposed.
    from tidybridge.mapping import compute_fingerprint

    resp = _upload(client)
    assert resp.json()["fingerprint"] == compute_fingerprint(["Full Name", "E-mail"])


def test_upload_response_carries_the_resolution_actually_used(client: TestClient):
    # The mapping review screen needs this for a shape that's never been
    # saved (the exact case mapping_is_default=true covers) - GET
    # /column-mappings/{fingerprint} genuinely 404s then (see the test
    # above this file's docstring), so the *upload* response is the only
    # place that ever has the raw headers to compute a default from.
    resp = _upload(client)
    body = resp.json()
    targets = {e["raw_column"]: e["target_field"] for e in body["field_resolutions"]}
    assert targets == {"Full Name": "full_name", "E-mail": "email"}
    assert body["dedup_key_fields"] == ["email"]


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
        files={
            "file": ("test.csv", b"Client Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")
        },
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
        files={
            "file": ("test.csv", b"Client Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")
        },
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


def test_put_updates_uploaded_records_when_apply_to_run_id_specified(client: TestClient):
    upload = client.post(
        "/records/upload",
        files={
            "file": ("test.csv", b"Client Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")
        },
    )
    body = upload.json()
    run_id = body["ingestion_run_id"]
    fingerprint = body["fingerprint"]
    assert body["records"][0]["fields"]["client_name"] == "Jane Doe"

    put_resp = client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": [
                {"raw_column": "Client Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            "dedup_key_fields": ["email"],
            "apply_to_run_id": run_id,
            "old_resolutions": body["field_resolutions"],
        },
    )
    assert put_resp.status_code == 200

    records_resp = client.get("/records")
    rec = records_resp.json()["items"][0]
    assert rec["fields"]["full_name"] == "Jane Doe"
    assert "client_name" not in rec["fields"]

