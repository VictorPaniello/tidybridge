"""extract.py's own logic - the model call itself is always monkeypatched
(tests never hit the real API); what's tested is everything around it:
routing by extension, the enabled check, turning invoices into rows, and
which invoices get flagged."""

from __future__ import annotations

import httpx
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
    monkeypatch.setattr(settings, "mistral_api_key", "test-key")
    monkeypatch.setattr(settings, "extraction_model", "mistral-ocr-test")


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
    monkeypatch.setattr(settings, "mistral_api_key", None)
    monkeypatch.setattr(settings, "extraction_model", "mistral-ocr-test")
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


@pytest.mark.parametrize(
    "net, vat, withholding, total",
    [
        # Spanish freelancer invoice: 1000 + 21% VAT - 15% IRPF = 1060
        (1000.0, 210.0, 150.0, 1060.0),
        # the same, with the withholding read as printed ("-150,00") -
        # what Mistral returned in the 2026-10-12 test call
        (1000.0, 210.0, -150.0, 1060.0),
        # a credit note: withholding shrinks the total's magnitude too
        (-1000.0, -210.0, -150.0, -1060.0),
        (-1000.0, -210.0, 150.0, -1060.0),
    ],
)
def test_irpf_withholding_is_not_a_false_mismatch(
    enabled, monkeypatch, net, vat, withholding, total
):
    invoice = _invoice(
        net_amount=net, vat_amount=vat, withholding_amount=withholding, total_amount=total
    )
    _model_returns(monkeypatch, invoice)
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


class _Resp:
    def __init__(self, status: int, body: dict | None = None, text: str = ""):
        self.status_code, self._body, self.text = status, body, text
        self.is_error = status >= 400

    def json(self):
        return self._body


def _mistral(monkeypatch, response=None, exc=None):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        if exc:
            raise exc
        return response

    monkeypatch.setattr(extract.httpx, "post", fake_post)
    monkeypatch.setattr(settings, "mistral_api_key", "k")
    monkeypatch.setattr(settings, "extraction_model", "mistral-ocr-test")
    return sent


def _ok(annotation):
    return _Resp(200, {"document_annotation": annotation, "usage_info": {"pages_processed": 1}})


def test_mistral_pdf_request_and_parsed_invoices(monkeypatch):
    payload = ExtractedInvoices(invoices=[_invoice()]).model_dump_json()
    sent = _mistral(monkeypatch, _ok(payload))
    result = extract.call_model(b"%PDF", "application/pdf")
    assert result.invoices[0].invoice_number == "F-2026-001"
    assert sent["url"] == f"{settings.mistral_api_base}/v1/ocr"
    assert sent["headers"]["Authorization"] == "Bearer k"
    doc = sent["json"]["document"]
    assert doc["type"] == "document_url"
    assert doc["document_url"].startswith("data:application/pdf;base64,")
    fmt = sent["json"]["document_annotation_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["schema"] == ExtractedInvoices.model_json_schema()
    assert sent["json"]["document_annotation_prompt"] == extract._PROMPT


def test_mistral_image_goes_as_image_url(monkeypatch):
    sent = _mistral(monkeypatch, _ok('{"invoices": []}'))
    extract.call_model(b"\xff\xd8", "image/jpeg")
    assert sent["json"]["document"]["type"] == "image_url"
    assert sent["json"]["document"]["image_url"].startswith("data:image/jpeg;base64,")


@pytest.mark.parametrize("annotation", [None, "not json", '{"invoices": "nope"}'])
def test_mistral_unusable_annotation_is_a_400(monkeypatch, annotation):
    _mistral(monkeypatch, _ok(annotation))
    with pytest.raises(ExtractionError, match="couldn't be read"):
        extract.call_model(b"%PDF", "application/pdf")


@pytest.mark.parametrize("status", [400, 422])
def test_mistral_rejecting_the_file_is_a_400(monkeypatch, status):
    _mistral(monkeypatch, _Resp(status, text="too many pages for annotation"))
    with pytest.raises(ExtractionError, match="too many pages"):
        extract.call_model(b"%PDF", "application/pdf")


@pytest.mark.parametrize("status", [401, 429, 500, 503])
def test_mistral_service_problems_are_unavailable(monkeypatch, status):
    _mistral(monkeypatch, _Resp(status))
    with pytest.raises(extract.ExtractionUnavailableError):
        extract.call_model(b"%PDF", "application/pdf")


def test_mistral_unreachable_is_unavailable(monkeypatch):
    _mistral(monkeypatch, exc=httpx.ConnectTimeout("slow"))
    with pytest.raises(extract.ExtractionUnavailableError):
        extract.call_model(b"%PDF", "application/pdf")


def test_claude_model_without_anthropic_key_is_disabled(monkeypatch):
    monkeypatch.setattr(settings, "mistral_api_key", "k")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    monkeypatch.setattr(settings, "extraction_model", "claude-sonnet-5")
    with pytest.raises(ExtractionError, match="isn't enabled"):
        extract.extract_invoices("inv.pdf", b"%PDF")
