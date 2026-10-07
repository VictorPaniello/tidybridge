"""extract.py's own logic - the model call itself is always monkeypatched
(tests never hit the real API); what's tested is everything around it:
routing by extension, the enabled check, turning invoices into rows, and
which invoices get flagged."""

from __future__ import annotations

import pytest

from tidybridge import extract
from tidybridge.config import settings
from tidybridge.extract import ExtractedInvoices, ExtractionError, Invoice


def _invoice(**overrides) -> Invoice:
    base = dict(
        supplier_name="Acme S.L.",
        supplier_tax_id="B12345674",  # a valid CIF - the check digit is 4
        invoice_number="F-2026-001",
        invoice_date="2026-03-05",
        currency="EUR",
        net_amount=1000.0,
        vat_amount=210.0,
        withholding_amount=None,
        total_amount=1210.0,
        uncertain_fields=[],
    )
    return Invoice(**{**base, **overrides})


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")


def _model_returns(monkeypatch, *invoices: Invoice):
    monkeypatch.setattr(
        extract,
        "call_model",
        lambda content, media_type: ExtractedInvoices(invoices=list(invoices)),
    )


def test_is_document_is_case_insensitive_and_excludes_spreadsheets():
    assert extract.is_document("scan.PDF")
    assert extract.is_document("photo.jpeg")
    assert not extract.is_document("clients.csv")
    assert not extract.is_document("clients.xlsx")


def test_disabled_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    with pytest.raises(ExtractionError, match="isn't enabled"):
        extract.extract_invoices("inv.pdf", b"%PDF")


def test_one_row_per_invoice_with_every_field_as_a_string(enabled, monkeypatch):
    _model_returns(monkeypatch, _invoice(), _invoice(invoice_number="F-2026-002"))
    df, issues = extract.extract_invoices("batch.pdf", b"%PDF")
    assert list(df.columns) == extract.FIELDS
    assert list(df["invoice_number"]) == ["F-2026-001", "F-2026-002"]
    assert df.at[0, "total_amount"] == "1210.0"
    assert df.at[0, "withholding_amount"] == ""  # None -> blank, same as an empty CSV cell
    assert issues == {}


def test_no_invoice_found_is_an_error_not_an_empty_run(enabled, monkeypatch):
    _model_returns(monkeypatch)
    with pytest.raises(ExtractionError, match="No invoice found"):
        extract.extract_invoices("cat.jpg", b"...")


def test_totals_mismatch_is_flagged(enabled, monkeypatch):
    _model_returns(monkeypatch, _invoice(total_amount=1300.0))
    _, issues = extract.extract_invoices("inv.pdf", b"%PDF")
    assert [i["field"] for i in issues[0]] == ["total_amount"]


def test_irpf_withholding_is_not_a_false_mismatch(enabled, monkeypatch):
    # Spanish freelancer invoice: 1000 + 21% VAT - 15% IRPF = 1060
    _model_returns(monkeypatch, _invoice(withholding_amount=150.0, total_amount=1060.0))
    _, issues = extract.extract_invoices("inv.pdf", b"%PDF")
    assert issues == {}


def test_uncertain_fields_become_issues_and_unknown_names_are_ignored(enabled, monkeypatch):
    _model_returns(monkeypatch, _invoice(uncertain_fields=["invoice_date", "not_a_field"]))
    _, issues = extract.extract_invoices("inv.pdf", b"%PDF")
    assert [i["field"] for i in issues[0]] == ["invoice_date"]


def test_tax_id_is_normalized_so_dedup_matches(enabled, monkeypatch):
    _model_returns(
        monkeypatch,
        _invoice(supplier_tax_id="b-123 456 78"),
        _invoice(supplier_tax_id="--"),
    )
    df, _ = extract.extract_invoices("inv.pdf", b"%PDF")
    assert df.at[0, "supplier_tax_id"] == "B12345678"
    assert df.at[1, "supplier_tax_id"] == ""  # nothing left -> treated as missing


@pytest.mark.parametrize(
    "tax_id",
    [
        "12345678Z",  # DNI
        "X1234567L",  # NIE
        "B12345674",  # CIF, digit control (S.L.)
        "Q2826000H",  # CIF, letter control (public body)
        "ESB12345674",  # EU VAT number with the ES prefix
        "DE123456789",  # foreign VAT number - not ours to check
        "1234",  # too short to be a Spanish ID - not flagged as one
    ],
)
def test_valid_or_non_spanish_tax_ids_are_not_flagged(enabled, monkeypatch, tax_id):
    _model_returns(monkeypatch, _invoice(supplier_tax_id=tax_id))
    _, issues = extract.extract_invoices("inv.pdf", b"%PDF")
    assert issues == {}


@pytest.mark.parametrize(
    "tax_id", ["12345678A", "X1234567T", "B12345673", "Q2826000J", "ESB12345673"]
)
def test_spanish_tax_id_with_a_wrong_check_character_is_flagged(enabled, monkeypatch, tax_id):
    _model_returns(monkeypatch, _invoice(supplier_tax_id=tax_id))
    _, issues = extract.extract_invoices("inv.pdf", b"%PDF")
    assert [i["field"] for i in issues[0]] == ["supplier_tax_id"]
