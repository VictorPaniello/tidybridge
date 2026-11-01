"""Upload limits beyond the raw byte cap (ingest.py): a maximum number of
rows per CSV/Excel upload, and a maximum uncompressed size for an .xlsx,
checked before pandas reads it. Both answer 413 and store nothing."""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from tidybridge.config import settings


def _csv(rows: int) -> bytes:
    lines = ["email,name"] + [f"cliente{i}@example.com,Proveedor Ejemplo {i}" for i in range(rows)]
    return "\n".join(lines).encode()


def _post(client: TestClient, name: str, body: bytes):
    return client.post("/records/upload", files={"file": (name, body, "text/csv")})


def test_csv_over_the_row_limit_is_rejected_and_stores_nothing(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_rows", 3)

    response = _post(client, "big.csv", _csv(4))
    assert response.status_code == 413
    assert "Too many rows: 4 (the limit is 3 per upload)" in response.json()["detail"]
    assert client.get("/records").json()["total"] == 0
    assert client.get("/ingestion-runs").json()["items"] == []


def test_csv_at_the_row_limit_is_accepted(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_rows", 3)
    assert _post(client, "ok.csv", _csv(3)).status_code == 200


@pytest.mark.parametrize("name", ["bomb.xlsx", "bomb.xls", "BOMB.XLSX"])
def test_xlsx_that_inflates_past_the_limit_is_rejected_before_reading(
    client: TestClient, monkeypatch, name: str
):
    """A tiny compressed file that would unzip to 2 MB, against a 1 MB
    limit: refused from the zip directory alone - load_input never runs."""
    import tidybridge.ingest as ingest

    def must_not_read(path):
        raise AssertionError("load_input ran on an oversized xlsx")

    monkeypatch.setattr(settings, "max_uncompressed_mb", 1)
    monkeypatch.setattr(ingest, "load_input", must_not_read)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("xl/worksheets/sheet1.xml", b"0" * (2 * 1024 * 1024))
    assert len(buf.getvalue()) < 50_000  # compresses to almost nothing

    response = _post(client, name, buf.getvalue())
    assert response.status_code == 413
    assert "too large once uncompressed (over 1 MB)" in response.json()["detail"]
