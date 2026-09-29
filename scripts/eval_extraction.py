"""Measure invoice extraction accuracy against hand-labeled documents.

Usage:
    uv run python scripts/eval_extraction.py [--model claude-sonnet-5]

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
