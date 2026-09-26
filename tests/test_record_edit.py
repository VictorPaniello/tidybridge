"""PATCH /records/{record_id} - inline correction of an already-ingested
record, re-validated against the exact field types its run was cleaned
with (see IngestionRun.resolution in models.py)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _upload(client: TestClient, csv: bytes):
    return client.post("/records/upload", files={"file": ("test.csv", csv, "text/csv")})


def test_patch_fixes_a_blank_required_field_and_clears_the_flag(client: TestClient):
    upload = _upload(client, b"Full Name,E-mail\n,jane@example.com\n")
    body = upload.json()
    assert body["records"][0]["has_issues"] is True
    record_id = body["records"][0]["id"]

    resp = client.patch(f"/records/{record_id}", json={"fields": {"full_name": "Jane Doe"}})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["fields"]["full_name"] == "Jane Doe"
    assert updated["has_issues"] is False
    assert updated["issues"] is None

    run_resp = client.get(f"/ingestion-runs/{body['ingestion_run_id']}")
    assert run_resp.json()["rows_clean"] == 1
    assert run_resp.json()["rows_flagged"] == 0


def test_patch_flags_a_newly_invalid_value(client: TestClient):
    upload_resp = _upload(
        client, b"Full Name,E-mail,Joined\nJane Doe,jane@example.com,2026-01-01\n"
    )
    up_body = upload_resp.json()
    fingerprint = up_body["fingerprint"]
    run_id = up_body["ingestion_run_id"]
    record_id = up_body["records"][0]["id"]
    assert up_body["records"][0]["has_issues"] is False

    # "Joined" has no built-in alias, so it defaults to type "string" -
    # pick "date" so the edit below actually gets validated as one. No
    # mapping was ever saved for this shape, so build the PUT body from
    # the upload's own default resolution rather than GET-ing one.
    old_resolutions = up_body["field_resolutions"]
    new_resolutions = [dict(entry) for entry in old_resolutions]
    for entry in new_resolutions:
        if entry["target_field"] == "joined":
            entry["type"] = "date"
    put_resp = client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": new_resolutions,
            "dedup_key_fields": up_body["dedup_key_fields"],
            "apply_to_run_id": run_id,
            "old_resolutions": old_resolutions,
        },
    )
    assert put_resp.status_code == 200

    resp = client.patch(f"/records/{record_id}", json={"fields": {"joined": "not-a-date"}})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["has_issues"] is True
    assert updated["issues"] == [{"field": "joined", "issue": "unparseable date"}]

    run_resp = client.get(f"/ingestion-runs/{run_id}")
    assert run_resp.json()["rows_flagged"] == 1
    assert run_resp.json()["rows_clean"] == 0


def test_patch_rejects_an_unknown_field(client: TestClient):
    upload = _upload(client, b"Full Name,E-mail\nJane Doe,jane@example.com\n")
    record_id = upload.json()["records"][0]["id"]

    resp = client.patch(f"/records/{record_id}", json={"fields": {"nonexistent_field": "x"}})
    assert resp.status_code == 400


def test_patch_is_owner_scoped(client: TestClient, other_client: TestClient):
    upload = _upload(client, b"Full Name,E-mail\nJane Doe,jane@example.com\n")
    record_id = upload.json()["records"][0]["id"]

    resp = other_client.patch(f"/records/{record_id}", json={"fields": {"full_name": "Hacked"}})
    assert resp.status_code == 404


def test_patch_requires_auth():
    from tidybridge.main import app

    unauthenticated = TestClient(app)
    resp = unauthenticated.patch(
        "/records/00000000-0000-0000-0000-000000000000", json={"fields": {}}
    )
    assert resp.status_code == 401
