from pathlib import Path

from fastapi.testclient import TestClient

from tidybridge.main import app

FIXTURES = Path(__file__).parent.parent / "examples"


def _upload(client: TestClient, filename: str = "messy_clients.csv"):
    with open(FIXTURES / filename, "rb") as f:
        return client.post("/records/upload", files={"file": (filename, f, "text/csv")})


def test_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_cleans_and_persists_records(client: TestClient):
    response = _upload(client)
    assert response.status_code == 200
    body = response.json()
    assert body["rows_total"] == 5
    # messy_clients.csv's blank-Customer row counts as flagged: "Customer"
    # alias-matches full_name, which is required=True in schema.yaml, and
    # default_resolution() now carries that required flag into the
    # per-upload dynamic schema (see mapping.py) - so a missing full_name
    # is a validation issue again, same as invalid-email and invalid-date.
    assert body["rows_clean"] == 2
    assert body["rows_flagged"] == 3
    assert len(body["records"]) == 5


def test_upload_returns_raw_sample_values_per_column(client: TestClient):
    # The mapping review screen shows these next to "Raw column" so an
    # engineer isn't renaming/typing a column blind - must be the raw
    # file's own values, not anything map_columns/coerce_and_validate
    # already touched (e.g. "SOFIA.REYES@shop.com", not lowercased).
    body = _upload(client).json()
    assert body["sample_values"]["Customer"] == [
        "Sofia Reyes",
        "Tom O'Brien",
        "Léa Dubois",
    ]
    assert body["sample_values"]["Contact Email"][0] == "SOFIA.REYES@shop.com"
    # The blank-Customer row's empty value is skipped, not returned as "".
    assert "" not in body["sample_values"]["Customer"]


def test_unreadable_file_returns_a_specific_400_not_a_bare_500(client: TestClient):
    # An empty file makes pandas raise EmptyDataError deep inside
    # load_input - before this was caught, that propagated as an
    # unhandled exception (a bare 500 with no detail, so an engineer got
    # no indication of what was actually wrong with their upload).
    response = client.post(
        "/records/upload", files={"file": ("empty.csv", b"", "text/csv")}
    )
    assert response.status_code == 400
    assert "empty.csv" in response.json()["detail"]


def test_missing_optional_field_is_null_not_the_string_nan(client: TestClient):
    # Regression coverage for the None -> NaN pandas bug found while building
    # this project (fixed both upstream in tidycsv and here in ingest.py's
    # row access). A JSON response of "NaN" instead of null is exactly what
    # that bug looked like from the API's side.
    response = _upload(client)
    records = response.json()["records"]
    no_name_record = next(r for r in records if r["fields"]["email"] == "noemail@shop.com")
    assert no_name_record["fields"]["full_name"] is None
    assert no_name_record["fields"]["phone"] is None


def test_flagged_issues_are_attached_to_the_correct_record(client: TestClient):
    records = _upload(client).json()["records"]
    invalid_email_record = next(r for r in records if r["fields"]["email"] == "not-an-email")
    assert invalid_email_record["has_issues"] is True
    assert invalid_email_record["issues"] == [
        {"field": "email", "issue": "invalid email format"}
    ]

    bad_date_record = next(r for r in records if r["fields"]["full_name"] == "Marco Rossi")
    assert bad_date_record["issues"] == [{"field": "signup_date", "issue": "unparseable date"}]


def test_reuploading_the_same_file_is_idempotent(client: TestClient):
    first = _upload(client)
    assert len(first.json()["records"]) == 5

    second = _upload(client)
    assert second.json()["records"] == []  # nothing new - already ingested by email

    page = client.get("/records").json()
    assert len(page["items"]) == 5  # not 10
    assert page["total"] == 5


def test_list_records_filters_by_has_issues(client: TestClient):
    _upload(client)
    flagged = client.get("/records", params={"has_issues": True}).json()
    clean = client.get("/records", params={"has_issues": False}).json()
    # See test_upload_cleans_and_persists_records - a missing full_name is
    # a validation issue again now that default_resolution() carries the
    # required flag through.
    assert len(flagged["items"]) == 3
    assert flagged["total"] == 3
    assert len(clean["items"]) == 2
    assert clean["total"] == 2


def test_list_records_is_paginated(client: TestClient):
    _upload(client)  # 5 rows

    first_page = client.get("/records", params={"limit": 2, "offset": 0}).json()
    assert len(first_page["items"]) == 2
    assert first_page["total"] == 5  # total reflects every matching row, not just this page
    assert first_page["limit"] == 2
    assert first_page["offset"] == 0

    second_page = client.get("/records", params={"limit": 2, "offset": 2}).json()
    assert len(second_page["items"]) == 2
    # No overlap between pages
    first_ids = {r["id"] for r in first_page["items"]}
    second_ids = {r["id"] for r in second_page["items"]}
    assert first_ids.isdisjoint(second_ids)

    last_page = client.get("/records", params={"limit": 2, "offset": 4}).json()
    assert len(last_page["items"]) == 1  # only one row left


def test_list_records_rejects_a_limit_above_the_server_side_cap(client: TestClient):
    # 500 is a hard ceiling, not just a default - a caller can't opt out
    # of it by asking for more.
    response = client.get("/records", params={"limit": 501})
    assert response.status_code == 422


def test_list_records_default_limit_covers_a_small_result_set(client: TestClient):
    # No limit/offset passed at all - the default (100) must still return
    # every one of the 5 uploaded rows, so existing callers that never
    # think about pagination keep working exactly as before for realistic
    # small result sets.
    _upload(client)
    page = client.get("/records").json()
    assert len(page["items"]) == 5
    assert page["limit"] == 100
    assert page["offset"] == 0


def test_get_single_record(client: TestClient):
    records = _upload(client).json()["records"]
    record_id = records[0]["id"]
    response = client.get(f"/records/{record_id}")
    assert response.status_code == 200
    assert response.json()["id"] == record_id


def test_get_unknown_record_returns_404(client: TestClient):
    response = client.get("/records/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_no_webhook_deliveries_when_webhook_url_unset(client: TestClient):
    records = _upload(client).json()["records"]
    record_id = records[0]["id"]
    deliveries = client.get(f"/records/{record_id}/webhooks").json()
    assert deliveries == []


def test_upload_without_a_token_is_rejected(client: TestClient):
    # `client` comes pre-authenticated (see conftest.py) - this checks the
    # protection actually exists by calling with no Authorization header.
    unauthenticated = TestClient(app)
    response = _upload(unauthenticated)
    assert response.status_code == 401


def test_upload_exceeding_size_limit_is_rejected(client: TestClient, monkeypatch):
    # A tiny limit for this test only, so it doesn't need to build a real
    # multi-MB file to prove the chunked reader actually cuts off uploads -
    # it exercises the same code path a real oversized file would hit.
    import tidybridge.main as main_module

    monkeypatch.setattr(main_module, "_MAX_UPLOAD_BYTES", 100)
    oversized = b"a" * 200
    response = client.post(
        "/records/upload", files={"file": ("big.csv", oversized, "text/csv")}
    )
    assert response.status_code == 413


def test_engineer_cannot_see_another_engineers_records(
    client: TestClient, other_client: TestClient
):
    my_records = _upload(client).json()["records"]
    _upload(other_client)  # a second engineer uploads the same file independently

    # Each engineer's own duplicate-by-email check still fires - only
    # cross-engineer isolation is being tested here, not dedup.
    assert len(_upload(client).json()["records"]) == 0

    my_view = client.get("/records").json()["items"]
    other_view = other_client.get("/records").json()["items"]
    assert {r["id"] for r in my_view} == {r["id"] for r in my_records}
    assert {r["id"] for r in other_view}.isdisjoint({r["id"] for r in my_records})


def test_engineer_gets_404_not_403_for_another_engineers_record(
    client: TestClient, other_client: TestClient
):
    my_record_id = _upload(client).json()["records"][0]["id"]
    response = other_client.get(f"/records/{my_record_id}")
    assert response.status_code == 404  # existence of the record isn't revealed either

    response = other_client.get(f"/records/{my_record_id}/webhooks")
    assert response.status_code == 404


def test_delete_record_actually_removes_it(client: TestClient):
    record_id = _upload(client).json()["records"][0]["id"]

    response = client.delete(f"/records/{record_id}")
    assert response.status_code == 204

    # Really gone, not soft-deleted - the same 404 an ID that never existed
    # would get, not a "deleted" flag still showing up somewhere.
    assert client.get(f"/records/{record_id}").status_code == 404
    assert record_id not in {r["id"] for r in client.get("/records").json()["items"]}


def test_delete_record_cascades_to_its_webhook_deliveries(client: TestClient, db):
    from sqlalchemy import select

    from tidybridge.models import WebhookDelivery

    record_id = _upload(client).json()["records"][0]["id"]
    db.add(
        WebhookDelivery(record_id=record_id, url="http://example.com", success=True)
    )
    db.commit()

    response = client.delete(f"/records/{record_id}")
    assert response.status_code == 204

    remaining = db.execute(
        select(WebhookDelivery).where(WebhookDelivery.record_id == record_id)
    ).scalars().all()
    assert remaining == []


def test_bulk_delete_removes_exactly_the_given_records(client: TestClient):
    records = _upload(client).json()["records"]
    to_delete = [records[0]["id"], records[1]["id"]]
    keep = records[2]["id"]

    response = client.post("/records/bulk-delete", json={"record_ids": to_delete})
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 2

    remaining_ids = {r["id"] for r in client.get("/records").json()["items"]}
    assert keep in remaining_ids
    assert not any(rid in remaining_ids for rid in to_delete)


def test_bulk_delete_skips_ids_that_do_not_belong_to_this_owner(
    client: TestClient, other_client: TestClient
):
    my_record_id = _upload(client).json()["records"][0]["id"]
    their_record_id = _upload(other_client).json()["records"][0]["id"]

    response = client.post(
        "/records/bulk-delete", json={"record_ids": [my_record_id, their_record_id]}
    )
    assert response.status_code == 200
    # Only the caller's own record counts - someone else's id in the same
    # request just matches nothing, it doesn't error the whole request.
    assert response.json()["deleted_count"] == 1
    assert client.get(f"/records/{my_record_id}").status_code == 404
    assert other_client.get(f"/records/{their_record_id}").status_code == 200


def test_bulk_delete_with_no_ids_deletes_nothing(client: TestClient):
    _upload(client)
    response = client.post("/records/bulk-delete", json={"record_ids": []})
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 0
    assert client.get("/records").json()["total"] == 5


def test_engineer_cannot_delete_another_engineers_record(
    client: TestClient, other_client: TestClient
):
    my_record_id = _upload(client).json()["records"][0]["id"]

    response = other_client.delete(f"/records/{my_record_id}")
    assert response.status_code == 404

    # Still there - the delete attempt from someone else must not have
    # actually removed it.
    assert client.get(f"/records/{my_record_id}").status_code == 200
