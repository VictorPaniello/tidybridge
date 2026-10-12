"""GET /records/export - a plain-text CSV download of the caller's own
records, not the paginated JSON GET /records returns. Real content
verified with Python's own csv.DictReader over the raw response body,
not just status code / content-type, since a header alone doesn't prove
the actual rows are right."""

from __future__ import annotations

import csv
import io

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tidybridge.main import app
from tidybridge.models import ClientRecord, WebhookJob

CLEAN_AND_FLAGGED_CSV = (
    "Customer,Contact Email,Order Date,Order Total,Mobile Number\n"
    "Grace Hopper,grace@example.com,2026-09-01,120.00,+1 212 555 0101\n"
    "Ada Yonath,not-an-email,2026-09-05,45.00,+1 212 555 0105\n"
)


def _upload_csv(client: TestClient, csv_body: str, filename: str = "export_test.csv"):
    return client.post(
        "/records/upload", files={"file": (filename, csv_body.encode(), "text/csv")}
    )


def _parse_csv(body: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(body.decode())))


def test_export_returns_csv_with_expected_columns_and_rows(client: TestClient):
    _upload_csv(client, CLEAN_AND_FLAGGED_CSV)

    response = client.get("/records/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]

    rows = _parse_csv(response.content)
    assert len(rows) == 2
    assert {r["full_name"] for r in rows} == {"Grace Hopper", "Ada Yonath"}

    clean = next(r for r in rows if r["full_name"] == "Grace Hopper")
    assert clean["email"] == "grace@example.com"
    assert clean["has_issues"] == "False"
    assert clean["issues"] == ""

    flagged = next(r for r in rows if r["full_name"] == "Ada Yonath")
    assert flagged["has_issues"] == "True"
    assert "email" in flagged["issues"]

    # WEBHOOK_URL is unset in tests (see conftest.py) - upload never
    # creates a WebhookJob, so every row falls back to "not_configured"
    # with the other two webhook columns blank. This is the common case
    # in production too, whenever WEBHOOK_URL isn't set.
    for row in rows:
        assert row["webhook_status"] == "not_configured"
        assert row["webhook_attempt_number"] == ""
        assert row["webhook_available_at"] == ""


def test_export_includes_real_webhook_job_status(client: TestClient, db: Session):
    _upload_csv(client, CLEAN_AND_FLAGGED_CSV)

    # full_name is a read-only Python property now, not a mapped column -
    # not usable in a SQL WHERE clause. Query the underlying JSONB field
    # directly instead (the same pattern ingest.py's dedup check uses).
    record = db.execute(
        select(ClientRecord).where(ClientRecord.fields["full_name"].astext == "Grace Hopper")
    ).scalar_one()
    job = WebhookJob(record_id=record.id, status="dead", attempt_number=3)
    db.add(job)
    db.commit()

    rows = _parse_csv(client.get("/records/export").content)

    delivered = next(r for r in rows if r["full_name"] == "Grace Hopper")
    assert delivered["webhook_status"] == "dead"
    assert delivered["webhook_attempt_number"] == "3"
    assert delivered["webhook_available_at"] != ""

    # The other record in the same upload never got a WebhookJob row -
    # confirms the bulk lookup doesn't cross-contaminate between records.
    untouched = next(r for r in rows if r["full_name"] == "Ada Yonath")
    assert untouched["webhook_status"] == "not_configured"


def test_export_respects_ingestion_run_id_filter(client: TestClient):
    first_run = _upload_csv(client, CLEAN_AND_FLAGGED_CSV, "first.csv").json()["ingestion_run_id"]
    second_csv = (
        "Customer,Contact Email,Order Date,Order Total,Mobile Number\n"
        "Nikola Tesla,nikola@example.com,2026-09-02,89.99,+1 212 555 0102\n"
    )
    _upload_csv(client, second_csv, "second.csv")

    response = client.get(f"/records/export?ingestion_run_id={first_run}")
    rows = _parse_csv(response.content)
    assert {r["full_name"] for r in rows} == {"Grace Hopper", "Ada Yonath"}


def test_export_only_includes_the_callers_own_records(
    client: TestClient, other_client: TestClient
):
    _upload_csv(client, CLEAN_AND_FLAGGED_CSV)

    response = other_client.get("/records/export")
    rows = _parse_csv(response.content)
    assert rows == []


def test_export_requires_auth(client: TestClient):
    # `client` comes pre-authenticated (see conftest.py) - this checks the
    # protection actually exists by calling with no Authorization header.
    unauthenticated = TestClient(app)
    response = unauthenticated.get("/records/export")
    assert response.status_code == 401


INVOICE_CSV = (
    "supplier_name,supplier_tax_id,invoice_number,invoice_date,currency,"
    "net_amount,vat_amount,withholding_amount,total_amount\n"
    "Ejemplo SL,B12345674,F-2026-0042,2026-10-03,EUR,1000.00,210.00,150.00,1060.00\n"
)


def test_export_includes_every_field_in_schema_order(client: TestClient):
    # Invoice fields were missing entirely: the export had five fixed
    # client columns. Columns now come from the records' own fields.
    _upload_csv(client, INVOICE_CSV, filename="invoices.csv")
    _upload_csv(client, CLEAN_AND_FLAGGED_CSV)

    response = client.get("/records/export")
    header = next(csv.reader(io.StringIO(response.content.decode())))
    assert header == [
        "full_name", "email", "signup_date", "amount", "phone",
        "supplier_name", "supplier_tax_id", "invoice_number", "invoice_date", "currency",
        "net_amount", "vat_amount", "withholding_amount", "total_amount",
        "has_issues", "issues", "approved_at",
        "webhook_status", "webhook_attempt_number", "webhook_available_at",
    ]  # fmt: skip

    invoice = next(r for r in _parse_csv(response.content) if r["invoice_number"])
    assert invoice["supplier_tax_id"] == "B12345674"
    assert invoice["total_amount"] == "1060.00"
    assert invoice["withholding_amount"] == "150.00"
    assert invoice["full_name"] == ""  # client columns blank on an invoice row


def test_export_neutralizes_spreadsheet_formulas(client: TestClient):
    # Invoice text is written by whoever sent the invoice, and extraction
    # copies it verbatim - a cell starting with = + - @ would run as a
    # formula when the gestoría opens the CSV in Excel.
    _upload_csv(
        client,
        "supplier_name,invoice_number,withholding_amount,total_amount\n"
        '"=HYPERLINK(""http://evil.example"",""Click"")",@SUM(A1),-150.00,+1060\n',
        filename="evil.csv",
    )
    row = _parse_csv(client.get("/records/export").content)[0]
    assert row["supplier_name"] == "'=HYPERLINK(\"http://evil.example\",\"Click\")"
    assert row["invoice_number"] == "'@SUM(A1)"
    assert row["withholding_amount"] == "-150.00"  # real numbers stay numbers


def test_csv_safe_only_trusts_plain_numbers():
    # float() would accept these, but a spreadsheet doesn't read them as
    # plain numbers - and a leading tab is itself a formula trigger
    from tidybridge.main import _csv_safe

    for value in ["\t-1", "-1_000", "-inf", "+nan", "-1\n"]:
        assert _csv_safe(value) == "'" + value
    for value in ["-150.00", "+34611223344", "-1060"]:
        assert _csv_safe(value) == value
