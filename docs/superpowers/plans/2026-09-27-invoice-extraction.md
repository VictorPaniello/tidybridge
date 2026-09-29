# Phase 1: Invoice Extraction Implementation Plan

> **Roadmap:** this is Phase 1 of `docs/superpowers/plans/2026-09-27-invoice-roadmap.md`. Read that first for how the phases fit together.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an engineer upload an invoice as a PDF or image to the existing `POST /records/upload`. Claude extracts the invoice fields, and from there the invoice flows through the same mapping → validation → dedup → persist → webhook/provisioning pipeline a CSV does. A script measures extraction accuracy against hand-labeled invoices.

**Architecture:** The only seam is the step that loads the file. `ingest_file` currently turns bytes into a raw DataFrame with tidycsv's `load_input`. For `.pdf/.png/.jpg/.jpeg/.webp` it calls a new `extract_invoices()` instead, which returns the same DataFrame shape (one row per invoice found) plus any extraction issues. Everything downstream is untouched. Invoice fields get default types and a default dedup key through the existing `schema.yaml` + `mapping.py` mechanism, so no new mapping code is needed.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy/Postgres, tidycsv, the `anthropic` Python SDK (structured outputs via `client.messages.parse`), pytest.

**Spec:** Decisions agreed in conversation on 2026-09-27, summarized here:
- Extend tidybridge rather than start a new project. Invoices are the first and only document type.
- One model call per document, returning structured output validated by Pydantic. No agents, retrieval, OCR library or fine-tuning.
- Off unless `ANTHROPIC_API_KEY` is set, the same convention as GitHub OAuth, webhooks and provisioning.
- Low-trust results land in the existing `issues` / `has_issues` review queue.
- An eval set plus a script that reports per-field accuracy.
- The privacy policy discloses Anthropic as a processor.

## Global Constraints

- Work on a feature branch off `main` (`feat/invoice-extraction`) and open a PR to `main`, same as every other feature. Merge into `staging` for testing; never delete `staging`.
- `ANTHROPIC_API_KEY` is set on **staging only** until Phase 3 adds per-user quotas. Production has open registration, so enabling it there would let anyone spend the key.
- Model: `claude-opus-5` by default, configurable via `EXTRACTION_MODEL`.
- Header fields only. Line items are **out of scope** for this plan.
- No new endpoint: documents go through `POST /records/upload`.
- Tests never call the real API. They monkeypatch `tidybridge.extract.call_model`.
- Keep the existing 10 MB upload cap and the 20/minute rate limit on upload. Both also bound extraction cost.
- The only new dependency is `anthropic`.
- Real client or personal invoices never get committed. They go in `evals/invoices/private/` (gitignored).

## Design notes (read before Task 1)

- **No self-reported confidence scores.** LLM confidence numbers are poorly calibrated, so issues come from three honest sources instead:
  1. Fields the model explicitly lists in `uncertain_fields`.
  2. A deterministic arithmetic check: `net + VAT − withholding ≈ total`, within 0.01.
  3. tidycsv's existing validation: required fields that are blank, unparseable dates or amounts.
- **`withholding_amount` exists because of Spanish IRPF.** Freelancer invoices subtract withholding from the total. Without this field, the arithmetic check would falsely flag every one of them.
- **One document can hold several invoices** (for example, a batch of scans in one PDF). The output is `invoices: list[Invoice]`, and each becomes one row. That's free, because the rest of the pipeline is already multi-row.
- **Refusals and oversized output** (`stop_reason` of `refusal` / `max_tokens`) become `ExtractionError`, a 400. **API outages** (5xx or connection errors after the SDK's own 2 retries) become `ExtractionUnavailableError`, a 502, so the user knows to retry.
- **Server-side refusal fallbacks (`fallbacks: "default"`) are deliberately not enabled.** Invoices don't touch the categories that trigger refusals, and leaving fallbacks off keeps the call on the stable, non-beta `messages.parse` path. A refusal still fails cleanly with a 400.
- **The model call happens before any DB query in `ingest_file`**, so a slow or failed call never holds a transaction open.
- **Tax IDs are normalized** (uppercased, punctuation stripped) before they become rows. Otherwise "B-12345678" and "B12345678" count as different suppliers and dedup misses the duplicate.
- **Every model call logs its token usage** (`extraction.completed`, with the model, input tokens and output tokens). That's where Phase 4's cost-per-invoice pricing comes from. Logs only, with no DB column: no migration is needed until a cost dashboard exists.
- **The prompt covers two Spanish specifics:** dates are day-before-month unless clearly otherwise, and credit notes (facturas rectificativas) are invoices with negative amounts.

## Review Focus

1. **The same invoice uploaded twice** should create no second record. A default dedup key of `supplier_tax_id + invoice_number` handles this. Test in Task 2.
2. **A Spanish freelancer invoice with IRPF withholding** should not be flagged as a totals mismatch. Test in Task 1.
3. **A PDF uploaded when extraction isn't configured** should give a clear 400 that says so, not a 500 and not a tidycsv parse error. Test in Task 2.
4. **A document with no invoice in it** (a random photo, a blank page) should give a 400 "No invoice found", not an empty successful run. Test in Task 1.
5. **Anthropic down or rate-limited** should give a 502 "try again" with no half-written run left in the DB. Test in Task 2.

Known ceiling, not fixed here: an invoice with no readable tax ID has a null dedup key, so re-uploading it creates a duplicate. It's still flagged, because `supplier_tax_id` is required, so it surfaces in the review queue.

---

### Task 1: Extraction module

**Files:**
- Modify: `pyproject.toml` (add dependency), `uv.lock` (via `uv add`)
- Modify: `src/tidybridge/config.py` (two settings)
- Create: `src/tidybridge/extract.py`
- Test: `tests/test_extract.py`

**Interfaces:**
- Produces:
  - `DOCUMENT_MEDIA_TYPES: dict[str, str]` (suffix → media type)
  - `FIELDS: list[str]`
  - `is_document(filename: str) -> bool`
  - `call_model(content: bytes, media_type: str) -> ExtractedInvoices`
  - `extract_invoices(filename: str, content: bytes) -> tuple[pd.DataFrame, dict[int, list[dict]]]`
  - `Invoice`, `ExtractedInvoices` (Pydantic models)
  - `ExtractionError(ValueError)`, `ExtractionUnavailableError(RuntimeError)`

- [ ] **Step 1: Add the dependency**

Run: `uv add anthropic`
Expected: `pyproject.toml` gains `"anthropic>=…"` and `uv.lock` updates. Then run `uv run python -c "import anthropic; print(anthropic.__version__)"`, which should print a version.

- [ ] **Step 2: Add the settings** to `Settings` in `src/tidybridge/config.py`, directly after `provisioning_mapping_path`:

```python
    anthropic_api_key: str | None = None
    """Enables invoice extraction (see extract.py): PDF/image uploads to
    /records/upload are read by Claude into the same rows a CSV would
    produce. None disables it - a document upload then gets a 400 saying
    so, and CSV/Excel uploads are unaffected. Same disable-when-unset
    convention as webhook_url and provisioning_url."""
    extraction_model: str = "claude-opus-5"
    """Which Claude model extract.py calls. scripts/eval_extraction.py
    takes --model to compare alternatives against the labeled set before
    changing this."""
```

- [ ] **Step 3: Write the failing tests** in `tests/test_extract.py`:

```python
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
    return Invoice(**{**base, **overrides})


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")


def _model_returns(monkeypatch, *invoices: Invoice):
    monkeypatch.setattr(
        extract, "call_model", lambda content, media_type: ExtractedInvoices(invoices=list(invoices))
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `uv run pytest tests/test_extract.py -v`
Expected: collection error `ModuleNotFoundError: No module named 'tidybridge.extract'`.

- [ ] **Step 5: Implement** `src/tidybridge/extract.py`:

```python
"""Invoice extraction: turns an uploaded PDF or image into the same kind
of raw DataFrame tidycsv's load_input() returns for a CSV - one row per
invoice found - so everything after that point in ingest_file (mapping,
tidycsv validation, dedup, issues, webhooks, provisioning) runs
completely unchanged.

Issues come from checks that can actually be trusted, not from a
model-reported confidence score (those are poorly calibrated): fields the
model itself says it's unsure of, and a deterministic arithmetic check on
the amounts. tidycsv's own validation (required blanks, unparseable
dates/amounts) still runs on top, same as for any CSV."""

from __future__ import annotations

import base64
import logging
import re
from pathlib import Path

import anthropic
import pandas as pd
from pydantic import BaseModel

from tidybridge.config import settings

logger = logging.getLogger(__name__)

DOCUMENT_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_TOTALS_TOLERANCE = 0.01


class ExtractionError(ValueError):
    """The document itself couldn't be turned into invoices (no invoice
    in it, unreadable, declined) - a 400, retrying won't help."""


class ExtractionUnavailableError(RuntimeError):
    """The extraction service couldn't be reached or errored after the
    SDK's own retries - a 502, retrying later may well succeed."""


class Invoice(BaseModel):
    supplier_name: str | None
    supplier_tax_id: str | None
    invoice_number: str | None
    invoice_date: str | None
    """ISO 8601, YYYY-MM-DD."""
    currency: str | None
    """ISO 4217 code, e.g. EUR."""
    net_amount: float | None
    vat_amount: float | None
    withholding_amount: float | None
    """Income-tax withholding subtracted from the total (e.g. Spanish IRPF
    on freelancer invoices) - without it the totals check below would
    falsely flag every such invoice."""
    total_amount: float | None
    uncertain_fields: list[str]


class ExtractedInvoices(BaseModel):
    invoices: list[Invoice]


FIELDS = [name for name in Invoice.model_fields if name != "uncertain_fields"]

_PROMPT = """Extract every invoice in this document. For each one, fill in \
the fields exactly as printed. Use null for any field that isn't on the \
invoice - never guess or compute a value that isn't printed. Dates as \
YYYY-MM-DD, currency as an ISO 4217 code, amounts as plain numbers \
without currency symbols or thousands separators. List in \
uncertain_fields the name of every field you filled in but couldn't read \
with confidence (blurry, handwritten, ambiguous). Dates on these \
documents are European (day before month) unless the document clearly \
says otherwise. Credit notes (facturas rectificativas) are invoices too: \
give their amounts as negative numbers. If the document contains no \
invoice, return an empty invoices list."""


def is_document(filename: str) -> bool:
    return Path(filename).suffix.lower() in DOCUMENT_MEDIA_TYPES


def call_model(content: bytes, media_type: str) -> ExtractedInvoices:
    block_type = "document" if media_type == "application/pdf" else "image"
    data = base64.standard_b64encode(content).decode("ascii")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.parse(
            model=settings.extraction_model,
            max_tokens=16000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": block_type,
                            "source": {"type": "base64", "media_type": media_type, "data": data},
                        },
                        {"type": "text", "text": _PROMPT},
                    ],
                }
            ],
            output_format=ExtractedInvoices,
        )
    except anthropic.BadRequestError as exc:
        # e.g. a corrupted PDF or an image the API can't decode - the file's
        # fault, not the service's.
        raise ExtractionError(f"The document couldn't be read ({exc.message})") from exc
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
        raise ExtractionUnavailableError(
            "Invoice extraction is temporarily unavailable - please try again in a minute"
        ) from exc

    # Logs only (no DB column yet) - enough to work out cost per invoice
    # for pricing; a per-user cost dashboard comes with billing (Phase 4).
    logger.info(
        "extraction.completed",
        extra={
            "model": settings.extraction_model,
            "stop_reason": response.stop_reason,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
    )
    if response.stop_reason == "refusal":
        raise ExtractionError("The document was declined by the extraction model")
    if response.stop_reason == "max_tokens":
        raise ExtractionError("Too many invoices in one document - split it into smaller files")
    return response.parsed_output


def _normalize_tax_id(value: str | None) -> str | None:
    """"B-12345678", "b 12345678" and "B12345678" are the same tax ID -
    normalized so the supplier_tax_id + invoice_number dedup key actually
    matches a re-upload instead of treating it as a new supplier."""
    if value is None:
        return None
    return re.sub(r"[^0-9A-Z]", "", value.upper()) or None


def _issues(invoice: Invoice) -> list[dict]:
    issues = [
        {"field": f, "issue": "extractor unsure - check against the document"}
        for f in invoice.uncertain_fields
        if f in FIELDS
    ]
    net, vat, total = invoice.net_amount, invoice.vat_amount, invoice.total_amount
    if net is not None and vat is not None and total is not None:
        expected = net + vat - (invoice.withholding_amount or 0.0)
        if abs(expected - total) > _TOTALS_TOLERANCE:
            issues.append(
                {
                    "field": "total_amount",
                    "issue": f"net + VAT - withholding = {expected:.2f}, but total is {total:.2f}",
                }
            )
    return issues


def extract_invoices(
    filename: str, content: bytes
) -> tuple[pd.DataFrame, dict[int, list[dict]]]:
    """Returns (raw rows, issues by row index) - the rows are strings with
    "" for missing values, exactly like load_input(dtype=str,
    keep_default_na=False) gives for a CSV."""
    if not settings.anthropic_api_key:
        raise ExtractionError(
            "Invoice extraction isn't enabled on this server - upload a CSV or Excel file instead"
        )
    media_type = DOCUMENT_MEDIA_TYPES[Path(filename).suffix.lower()]
    invoices = call_model(content, media_type).invoices
    if not invoices:
        raise ExtractionError(f"No invoice found in {filename!r}")
    invoices = [
        inv.model_copy(update={"supplier_tax_id": _normalize_tax_id(inv.supplier_tax_id)})
        for inv in invoices
    ]

    rows = [
        {f: "" if getattr(inv, f) is None else str(getattr(inv, f)) for f in FIELDS}
        for inv in invoices
    ]
    issues = {i: found for i, inv in enumerate(invoices) if (found := _issues(inv))}
    return pd.DataFrame(rows, columns=FIELDS), issues
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `uv run pytest tests/test_extract.py -v`
Expected: 8 passed.

- [ ] **Step 7: Smoke-check against the real API** (needs Phase 0's key; costs a few cents). The unit tests fake the model call, so this is the only thing in Task 1 that proves the SDK call itself is right.

Run, with any real invoice PDF:

```bash
ANTHROPIC_API_KEY=... uv run python -c "
from pathlib import Path
from tidybridge import extract
print(extract.call_model(Path('PATH/TO/invoice.pdf').read_bytes(), 'application/pdf'))
"
```

Expected: an `ExtractedInvoices(invoices=[Invoice(...)])` with plausible values, plus an `extraction.completed` log line with token counts. If `messages.parse` or `output_format` raises a `TypeError`, check the installed SDK's signature (`uv run python -c "import anthropic, inspect; print(inspect.signature(anthropic.Anthropic().messages.parse))"`) and adjust `call_model`.

- [ ] **Step 8: Lint and commit**

```bash
uv run ruff check src tests
git add pyproject.toml uv.lock src/tidybridge/config.py src/tidybridge/extract.py tests/test_extract.py
git commit -m "feat: add invoice extraction module (Claude structured outputs)"
```

---

### Task 2: Wire extraction into the upload pipeline

**Files:**
- Modify: `src/tidybridge/ingest.py` (the load step, and seeding `issue_map`)
- Modify: `src/tidybridge/main.py:361-367` (the `upload_records` except clauses)
- Modify: `src/tidybridge/mapping.py` (`default_dedup_key_fields`)
- Modify: `examples/schema.yaml` (invoice fields)
- Test: `tests/test_invoice_upload.py`

**Interfaces:**
- Consumes (from Task 1): `is_document`, `extract_invoices`, `ExtractionError`, `ExtractionUnavailableError`, `ExtractedInvoices`, `Invoice`, `call_model` (monkeypatched in tests)
- Produces: `POST /records/upload` accepts `.pdf/.png/.jpg/.jpeg/.webp`. It returns 400 on `ExtractionError` and 502 on `ExtractionUnavailableError`.

- [ ] **Step 1: Write the failing tests** in `tests/test_invoice_upload.py`:

```python
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
        extract, "call_model", lambda content, media_type: ExtractedInvoices(invoices=list(invoices))
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
```

Before running, check that `GET /ingestion-runs` returns a `total` key: `grep -n "total" src/tidybridge/schemas.py`. If its page model uses a different key name, use that name in `test_extraction_outage_is_a_502_and_leaves_no_run_behind`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_invoice_upload.py -v`
Expected: the PDF tests fail with 400 "Couldn't read 'invoice.pdf' as a CSV or Excel file" (tidycsv tries to parse the PDF). `test_csv_upload_never_calls_the_model` passes.

- [ ] **Step 3: Add invoice fields to `examples/schema.yaml`.** Append them under `fields:`, before `key_columns`. No aliases are needed: tidycsv's `all_names()` already includes the canonical name, so the extractor's column names match themselves.

```yaml
  # Invoice fields - the column names extract.py produces for PDF/image
  # uploads, listed here so default_resolution() gives them real types
  # and required flags instead of all-string/optional.
  - name: supplier_name
    type: string
    required: true

  - name: supplier_tax_id
    type: string
    required: true

  - name: invoice_number
    type: string
    required: true

  - name: invoice_date
    type: date
    required: true

  - name: currency
    type: string

  - name: net_amount
    type: currency

  - name: vat_amount
    type: currency

  - name: withholding_amount
    type: currency

  - name: total_amount
    type: currency
    required: true
```

- [ ] **Step 4: Extend `default_dedup_key_fields`** in `src/tidybridge/mapping.py`. Insert this between the existing `for` loop and the function's final `return []`:

```python
    # An invoice's identity is who issued it plus their own number for it
    # - the same pair an accountant would use to spot a duplicate.
    targets = {entry["target_field"] for entry in resolution}
    if {"supplier_tax_id", "invoice_number"} <= targets:
        return ["supplier_tax_id", "invoice_number"]
```

Update the docstring's last sentence to: "No default otherwise (other than an invoice's supplier tax ID + invoice number, see below): nothing else is safe to assume…"

- [ ] **Step 5: Route documents in `src/tidybridge/ingest.py`.**

Add to the imports:

```python
from tidybridge.extract import extract_invoices, is_document
```

Replace the block from `suffix = Path(filename).suffix or ".csv"` through the end of the inner `try/except/finally` (the one that calls `load_input`) with:

```python
        extraction_issues: dict[int, list[dict]] = {}
        if is_document(filename):
            # Before any DB query below, so a slow model call never holds a
            # transaction open. ExtractionError/ExtractionUnavailableError
            # propagate to upload_records (main.py) as a 400/502.
            raw, extraction_issues = extract_invoices(filename, content)
        else:
            suffix = Path(filename).suffix or ".csv"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)

            try:
                raw = load_input(tmp_path)
            except Exception as exc:
                # (keep the existing comment block here verbatim)
                raise UnreadableFileError(
                    f"Couldn't read {filename!r} as a CSV or Excel file - make sure it's not "
                    f"empty or corrupted, and that its extension matches its actual format "
                    f"({type(exc).__name__}: {exc})"
                ) from exc
            finally:
                tmp_path.unlink(missing_ok=True)
```

Then change the `issue_map` initialisation from `issue_map: dict[int, list[dict]] = {}` to:

```python
        # Seeded with extraction's own issues (empty for a CSV) - same
        # row indices, since flag_duplicates never resets the index.
        issue_map: dict[int, list[dict]] = {i: list(v) for i, v in extraction_issues.items()}
```

Add one sentence to the module docstring's first paragraph: "PDF/image uploads are turned into the same raw rows by extract.py instead of load_input - everything after that step is shared."

- [ ] **Step 6: Map the errors in `src/tidybridge/main.py`.**

Add to the imports:

```python
from tidybridge.extract import ExtractionError, ExtractionUnavailableError
```

Replace the `except UnreadableFileError` clause in `upload_records` with:

```python
    except (UnreadableFileError, ExtractionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ExtractionUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
```

- [ ] **Step 7: Run the new tests, then the whole suite**

Run: `uv run pytest tests/test_invoice_upload.py -v`
Expected: 7 passed.

Run: `uv run pytest`
Expected: all pass. Watch `tests/test_mapping.py` and `tests/test_column_mappings.py` in particular. If one asserts the exact field list of `schema.yaml`, update its expected list to include the invoice fields. Don't change behavior to make it pass.

- [ ] **Step 8: Lint and commit**

```bash
uv run ruff check src tests
git add examples/schema.yaml src/tidybridge/ingest.py src/tidybridge/main.py src/tidybridge/mapping.py tests/test_invoice_upload.py
git commit -m "feat: accept PDF/image invoices on /records/upload"
```

---

### Task 3: Frontend, README, privacy policy

**Files:**
- Modify: `frontend/src/pages/RecordsPage.tsx:346,355`
- Modify: `frontend/src/pages/PrivacyPage.tsx` (processors list, after the Resend `<li>`)
- Modify: `README.md` (intro, API table row, "What it doesn't do (yet)", "Privacy & Terms")
- Modify: `.env.example` (if present)

**Interfaces:**
- Consumes: the Task 2 upload behavior. No new API surface.

- [ ] **Step 1: Upload button.** In `RecordsPage.tsx`, change `accept=".csv,.xlsx,.xls"` to `accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"`, and the button label `"Upload CSV / Excel"` to `"Upload file or invoice"`.

- [ ] **Step 2: Privacy policy.** In `PrivacyPage.tsx`, add a new `<li>` directly after the Resend one:

```tsx
          <li>
            <strong>Anthropic</strong> - if you upload an invoice as a PDF or image, the document
            is sent to Anthropic's API (based in the United States) to read its fields. Anthropic
            processes it on tidybridge's behalf as a sub-processor and doesn't use it to train its
            models. CSV and Excel uploads never leave tidybridge's own servers. See{" "}
            <a
              className="text-ring hover:underline"
              href="https://www.anthropic.com/legal/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Anthropic's privacy policy
            </a>.
          </li>
```

**Before merging to main:** confirm the "doesn't use it to train" claim against Anthropic's current commercial terms, and accept Anthropic's DPA in the Console (Settings → Legal). Victor does this step; it's a dashboard task.

- [ ] **Step 3: README.**
  - Intro paragraph: after "upload a CSV/Excel file", add "(or an invoice as a PDF or image, read by Claude - see [Invoice extraction](#invoice-extraction))".
  - API table: change the `POST /records/upload` row's text to "Upload a CSV/Excel file, or a PDF/image invoice when `ANTHROPIC_API_KEY` is set, clean + persist it (tagged to the caller), fire webhooks for new records - returns an `ingestion_run_id`. 502 if extraction is temporarily unavailable".
  - New `## Invoice extraction` section, placed after `## Architecture`:

```markdown
## Invoice extraction

Upload an invoice as a PDF or image and Claude reads its header fields
(supplier, tax ID, number, date, currency, net/VAT/withholding/total)
into the same rows a CSV would produce - one row per invoice, so a PDF
of several scanned invoices works too. From there it's the normal
pipeline: mapping, tidycsv validation, dedup on supplier tax ID +
invoice number, webhooks, provisioning.

Off unless `ANTHROPIC_API_KEY` is set (`EXTRACTION_MODEL` picks the
model, default `claude-opus-5`).

What lands in the review queue (`has_issues`), and why no confidence
score: model-reported confidence is poorly calibrated, so issues come
from checks that can be trusted instead - fields the model says it
couldn't read clearly, a net + VAT - withholding = total arithmetic
check (withholding exists for Spanish IRPF invoices, which would
otherwise all fail it), and tidycsv's usual required/format validation.

Accuracy is measured, not assumed: `scripts/eval_extraction.py` runs
the extractor over hand-labeled invoices in `evals/invoices/` and
reports per-field accuracy (see that script's docstring). Latest run:
see `evals/results/`.
```

  - "What it doesn't do (yet)": add a bullet: "- **Invoice line items** - extraction reads header fields only (totals, not individual lines). Line items would need a child table, not more columns on one record."
  - "Privacy & Terms": add one sentence at the end of the first paragraph: "Invoice uploads (PDF/image) are the one case where uploaded data leaves tidybridge's own infrastructure - they're sent to Anthropic for extraction, disclosed as a sub-processor on `/privacy`."

- [ ] **Step 4: `.env.example`.** If the file exists (`ls .env.example`), append:

```
# Invoice extraction (PDF/image uploads). Unset = disabled.
ANTHROPIC_API_KEY=
# EXTRACTION_MODEL=claude-opus-5
```

- [ ] **Step 5: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RecordsPage.tsx frontend/src/pages/PrivacyPage.tsx README.md .env.example
git commit -m "docs: document invoice extraction, disclose Anthropic as a sub-processor"
```

---

### Task 4: Eval set and accuracy script

**Files:**
- Create: `scripts/eval_extraction.py`
- Create: `evals/invoices/labels.jsonl`, `evals/invoices/*.pdf|png|jpg` (Victor gathers these; see Step 1)
- Create: `evals/results/` (the script's output, committed)
- Modify: `.gitignore`

**Interfaces:**
- Consumes (from Task 1): `extract.call_model`, `extract.FIELDS`, `extract.DOCUMENT_MEDIA_TYPES`, `extract.ExtractionError`, `extract.ExtractionUnavailableError`, `settings.extraction_model`

- [ ] **Step 1 (Victor, not code): Gather and label about 30 invoices.** Aim for a spread, not 30 of the same:
  - About 10 clean digital PDFs from different suppliers and layouts
  - About 5 phone photos or scans (skewed, low light, creased)
  - About 5 Spanish freelancer invoices with IRPF withholding
  - About 3 in a non-EUR currency
  - About 2 multi-invoice PDFs
  - About 2 non-invoices (a receipt, a delivery note) whose label is `{"invoices": []}`
  - A few with a field genuinely missing, where the label is `null`

  Sources: your own received invoices (these go in `evals/invoices/private/`), public sample invoices, and ones you generate from an invoice template. Label each document as one line of `evals/invoices/labels.jsonl`, with paths relative to `evals/invoices/`:

```json
{"file": "001-acme.pdf", "invoices": [{"supplier_name": "Acme S.L.", "supplier_tax_id": "B12345678", "invoice_number": "F-2026-001", "invoice_date": "2026-03-05", "currency": "EUR", "net_amount": 1000.0, "vat_amount": 210.0, "withholding_amount": null, "total_amount": 1210.0}]}
{"file": "private/014-freelancer.jpg", "invoices": [{"supplier_name": "Laura Gómez", "supplier_tax_id": "12345678Z", "invoice_number": "2026/07", "invoice_date": "2026-07-01", "currency": "EUR", "net_amount": 800.0, "vat_amount": 168.0, "withholding_amount": 120.0, "total_amount": 848.0}]}
```

- [ ] **Step 2: Gitignore private invoices.** Append to `.gitignore`:

```
# Real invoices used for evals - may contain personal data, never committed.
evals/invoices/private/
```

- [ ] **Step 3: Write** `scripts/eval_extraction.py`:

```python
"""Measure invoice extraction accuracy against hand-labeled documents.

Usage:
    uv run python scripts/eval_extraction.py [--model claude-opus-5]

Reads evals/invoices/labels.jsonl - one JSON object per line:
    {"file": "001.pdf", "invoices": [{"invoice_number": "F-1", ...}, ...]}
with file paths relative to evals/invoices/. Invoices are compared by
position within a document. Calls the real API (needs ANTHROPIC_API_KEY),
so every run costs real money - a few cents per document.

Writes the per-field accuracy and every mismatch to
evals/results/<date>-<model>.json, so a prompt or model change can be
compared against the last run instead of judged by eye."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

from tidybridge import extract
from tidybridge.config import settings

EVAL_DIR = Path("evals/invoices")
RESULTS_DIR = Path("evals/results")
AMOUNT_FIELDS = {"net_amount", "vat_amount", "withholding_amount", "total_amount"}


def _norm(value) -> str:
    return "" if value is None else " ".join(str(value).split()).casefold()


def field_matches(field: str, expected, actual) -> bool:
    if field in AMOUNT_FIELDS:
        if expected is None or actual is None:
            return expected is None and actual is None
        return abs(float(expected) - float(actual)) <= 0.01
    if field == "supplier_tax_id":
        # "B-12345678" and "B 12345678" are the same tax ID.
        return re.sub(r"[^0-9a-z]", "", _norm(expected)) == re.sub(
            r"[^0-9a-z]", "", _norm(actual)
        )
    return _norm(expected) == _norm(actual)


def _self_check() -> None:
    assert field_matches("total_amount", 1210, 1210.004)
    assert not field_matches("total_amount", 1210, 1211)
    assert not field_matches("total_amount", None, 0.0)
    assert field_matches("supplier_tax_id", "B-12345678", "b12345678")
    assert field_matches("supplier_name", "Acme  S.L.", "acme s.l.")
    assert not field_matches("invoice_number", "F-1", None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=settings.extraction_model)
    args = parser.parse_args()
    settings.extraction_model = args.model
    _self_check()

    labels = [
        json.loads(line)
        for line in (EVAL_DIR / "labels.jsonl").read_text().splitlines()
        if line.strip()
    ]
    correct: Counter[str] = Counter()
    total: Counter[str] = Counter()
    failures: list[str] = []

    for doc in labels:
        path = EVAL_DIR / doc["file"]
        media_type = extract.DOCUMENT_MEDIA_TYPES[path.suffix.lower()]
        try:
            got = extract.call_model(path.read_bytes(), media_type).invoices
        except (extract.ExtractionError, extract.ExtractionUnavailableError) as exc:
            failures.append(f"{doc['file']}: {exc}")
            got = []

        total["invoice_count"] += 1
        if len(got) == len(doc["invoices"]):
            correct["invoice_count"] += 1
        else:
            failures.append(
                f"{doc['file']}: expected {len(doc['invoices'])} invoices, got {len(got)}"
            )

        for i, expected in enumerate(doc["invoices"]):
            actual = got[i].model_dump() if i < len(got) else {}
            for field in extract.FIELDS:
                total[field] += 1
                if field_matches(field, expected.get(field), actual.get(field)):
                    correct[field] += 1
                else:
                    failures.append(
                        f"{doc['file']}#{i} {field}: expected {expected.get(field)!r}, "
                        f"got {actual.get(field)!r}"
                    )

    accuracy = {k: correct[k] / total[k] for k in total}
    print(f"model: {args.model}   documents: {len(labels)}\n")
    for key, value in accuracy.items():
        print(f"  {key:<20} {value:6.1%}  ({correct[key]}/{total[key]})")
    field_total = sum(total[f] for f in extract.FIELDS)
    overall = sum(correct[f] for f in extract.FIELDS) / field_total if field_total else 0.0
    print(f"\n  {'all fields':<20} {overall:6.1%}")
    if failures:
        print(f"\n{len(failures)} mismatches:")
        for line in failures:
            print(f"  {line}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / f"{date.today()}-{args.model}.json"
    out.write_text(
        json.dumps(
            {"model": args.model, "overall": overall, "accuracy": accuracy, "failures": failures},
            indent=2,
        )
    )
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
```

Note: `failures` lines for files under `private/` include extracted values. Before committing a results file, check that it contains no personal data from a private invoice. If it does, keep that results file local.

- [ ] **Step 4: Verify the scorer without spending money**

Run: `uv run python -c "import runpy; runpy.run_path('scripts/eval_extraction.py')['_self_check'](); print('ok')"`
Expected: `ok`.

- [ ] **Step 5: First real run** (needs the labeled set from Step 1 and a real key)

Run: `ANTHROPIC_API_KEY=... uv run python scripts/eval_extraction.py`
Expected: a per-field accuracy table and `wrote evals/results/<date>-claude-opus-5.json`. Read every mismatch. Each one is either a labeling mistake (fix the label) or a real extraction weakness (note it; that's material for the README and for interviews).

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/eval_extraction.py evals/invoices/labels.jsonl evals/invoices/*.* evals/results/
git commit -m "feat: add invoice extraction eval set and accuracy script"
```

Then update the README "Invoice extraction" section's "Latest run" line with the real overall and per-field numbers from this run, and commit that too.

---

## Out of scope (deliberately)

Document storage, edit/approve, review-gated pushes, quotas, multi-file/HEIC upload and Stripe belong to Phases 3–4 of the roadmap. Export to the pilot's accounting software is Phase 2. Also out:

- **Line items.** Would need a child table. Add them once a real pilot user needs them.
- **Pushing invoices into accounting software** (Holded / QuickBooks). This is the next plan: a new destination alongside SCIM provisioning, reusing the job/attempt/replay machinery in `provisioning.py`.
- **Refusal fallbacks, batch API, prompt caching.** At pilot volume none of these matter. Revisit if the eval shows refusals or the bill shows cost.
- **Per-page cost caps.** The 10 MB cap and 20/minute rate limit bound spend today. Add a page-count check if real usage shows large PDFs.
