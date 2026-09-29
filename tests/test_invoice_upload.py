"""End to end through POST /records/upload with the model call faked -
proves a PDF goes through the same mapping/validation/dedup/persist path
a CSV does, not just that extract.py works in isolation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tidybridge import extract
from tidybridge.config import settings
from tidybridge.extract import ExtractedInvoices, ExtractionUnavailableError, Invoice

_INVOICE = Invoice(
    supplier_name="Acme S.L.",
    supplier_tax_id="B12345678",
    invoice_number="F-2026-001",
    invoice_date="2026-03-05",
    currency="EUR",
    net_amount=1000.0,
    vat_amount=210.0,
    withholding_amount=None,
    total_amount=1210.0,
    uncertain_fields=[],
)


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")


def _model_returns(monkeypatch, *invoices: Invoice):
    monkeypatch.setattr(
        extract,
        "call_model",
        lambda content, media_type: ExtractedInvoices(invoices=list(invoices)),
    )


def _upload_pdf(client: TestClient, name: str = "invoice.pdf"):
    return client.post(
        "/records/upload", files={"file": (name, b"%PDF-1.4 fake", "application/pdf")}
    )


def test_pdf_invoice_is_persisted_as_a_record(client: TestClient, enabled, monkeypatch):
    _model_returns(monkeypatch, _INVOICE)
    response = _upload_pdf(client)
    assert response.status_code == 200
    body = response.json()
    assert body["rows_total"] == 1
    assert body["rows_clean"] == 1
    record = body["records"][0]
    assert record["fields"]["invoice_number"] == "F-2026-001"
    assert record["fields"]["supplier_name"] == "Acme S.L."
    assert record["has_issues"] is False


def test_invoice_fields_get_typed_defaults_and_a_dedup_key(client, enabled, monkeypatch):
    _model_returns(monkeypatch, _INVOICE)
    body = _upload_pdf(client).json()
    types = {r["target_field"]: r["type"] for r in body["field_resolutions"]}
    assert types["invoice_date"] == "date"
    assert types["total_amount"] == "currency"
    assert body["dedup_key_fields"] == ["supplier_tax_id", "invoice_number"]


def test_same_invoice_uploaded_twice_is_not_duplicated(client, enabled, monkeypatch):
    _model_returns(monkeypatch, _INVOICE)
    _upload_pdf(client)
    second = _upload_pdf(client).json()
    assert second["rows_skipped_existing"] == 1
    assert second["records"] == []


def test_totals_mismatch_lands_in_the_review_queue(client, enabled, monkeypatch):
    _model_returns(monkeypatch, _INVOICE.model_copy(update={"total_amount": 1300.0}))
    record = _upload_pdf(client).json()["records"][0]
    assert record["has_issues"] is True
    assert "total_amount" in [i["field"] for i in record["issues"]]


def test_pdf_without_extraction_enabled_is_a_clear_400(client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    response = _upload_pdf(client)
    assert response.status_code == 400
    assert "isn't enabled" in response.json()["detail"]


def test_extraction_outage_is_a_502_and_leaves_no_run_behind(client, enabled, monkeypatch):
    def down(content, media_type):
        raise ExtractionUnavailableError("Invoice extraction is temporarily unavailable")

    monkeypatch.setattr(extract, "call_model", down)
    response = _upload_pdf(client)
    assert response.status_code == 502
    assert client.get("/ingestion-runs").json()["total"] == 0


def test_csv_upload_never_calls_the_model(client, enabled, monkeypatch):
    def boom(content, media_type):
        raise AssertionError("CSV upload must not reach the extraction model")

    monkeypatch.setattr(extract, "call_model", boom)
    response = client.post(
        "/records/upload",
        files={"file": ("c.csv", b"Customer,Contact Email\nAna,ana@x.com\n", "text/csv")},
    )
    assert response.status_code == 200
