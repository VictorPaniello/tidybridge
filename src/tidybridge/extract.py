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
