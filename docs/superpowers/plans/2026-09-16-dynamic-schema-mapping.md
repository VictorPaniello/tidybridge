# Dynamic Schema Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ClientRecord`'s five fixed columns with a dynamic `fields` JSON column so an engineer can upload any CSV/Excel shape, have every column mapped and cleaned as itself (not silently dropped), and never be blocked by a missing "required" field.

**Architecture:** Each upload computes a fingerprint of its raw headers, looks up a saved per-owner `ColumnMapping` for that shape (or falls back to an automatic default), builds a `tidycsv.Schema` on the fly from the resolution, and runs the exact same `map_columns`/`coerce_and_validate`/`flag_duplicates` pipeline tidycsv already has. Deduplication (both within-file and across uploads) is driven by an engineer-chosen `dedup_key_fields` list instead of a hardcoded `email` column. `ClientRecord.full_name`/`.email`/etc. become read-only properties backed by `fields`, so every existing consumer (webhooks, SCIM provisioning, CSV export, `ClientRecordOut`) keeps working unchanged for records whose `fields` happen to include those names.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (Postgres, JSONB), Alembic, tidycsv (unmodified), pytest against a real Postgres test database, React/TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md`

## Global Constraints

- No field is ever `required` at the tidycsv level - every synthetic `FieldSpec` this feature builds has `required=False`.
- tidycsv (`../tidycsv`) is never modified - all new logic lives in tidybridge.
- Deduplication only happens when `dedup_key_fields` is non-empty; empty means every row inserts, every time.
- A saved `ColumnMapping` change is prospective only - never reprocesses rows already ingested.
- `target_field` names (both defaulted and engineer-supplied) always match `^[a-z][a-z0-9_]{0,99}$`.
- Two raw columns resolving to the same `target_field` are combined (joined with a single space, in raw file column order) - this is the *only* combine mechanism, there is no separate flag.
- Webhooks, SCIM provisioning, and CSV export are explicitly out of scope for going dynamic in this plan - they must keep working exactly as today for records whose `fields` include the legacy names, and degrade gracefully (not crash) otherwise.

---

## Two implementation details the spec didn't spell out explicitly

Grounding this plan against the actual codebase surfaced two things the spec's intent requires but doesn't say outright. Both are the natural, minimal-risk way to keep the constraint above ("webhooks/provisioning/export keep working") true - flagging them here rather than silently deciding them:

1. **Backward-compatible property accessors.** `webhooks.py`, `provisioning.py`, `schemas.py`'s `ClientRecordOut`, and `main.py`'s `export_records` all currently read `record.full_name`, `record.email`, etc. as plain attributes. Task 2 adds those exact names back as `@property` methods reading from `self.fields.get(...)` - every one of those call sites needs zero code changes, and existing tests referencing `record.full_name`/`record.email` keep passing unchanged.
2. **SCIM provisioning null-safety.** `provisioning.py`'s `build_scim_payload` calls `.partition(" ")` directly on `getattr(record, source)` for `name.givenName`/`name.familyName` - safe today because a `ClientRecord` could never exist without a `full_name` (the old required-field crash guaranteed it). Under this plan, a record's `fields` may genuinely have no `full_name` at all, and the property returns `None` - `.partition` on `None` would crash instead of degrading gracefully. Task 5 fixes this with a two-line null guard.

---

### Task 1: Migration - `column_mappings` table + `ClientRecord.fields`

**Files:**
- Create: `alembic/versions/f1a2b3c4d5e6_add_column_mappings_and_dynamic_fields.py`
- Test: `tests/test_migration_dynamic_fields.py`

**Interfaces:**
- Produces: `column_mappings` table (`id`, `owner_id`, `header_fingerprint`, `field_resolutions`, `dedup_key_fields`, `created_at`); `client_records.fields` (JSONB, not null, default `{}`); `client_records.full_name`/`email`/`signup_date`/`amount`/`phone` columns dropped.

- [ ] **Step 1: Write the failing test** (runs the migration against a throwaway schema state by seeding a row with the legacy columns still present via raw SQL against the pre-migration schema, then checking the backfill)

This test needs the DB at the revision *before* this migration to seed a legacy-shaped row, then upgrade, then assert. Since `conftest.py`'s `_migrate_schema` fixture always migrates to `head` before any test runs, write this as a standalone script-style test that manages its own engine/connection at specific revisions:

```python
"""Verifies the dynamic-fields migration backfills existing full_name/
email/signup_date/amount/phone data into `fields` before dropping those
columns - no data lost in the switch to dynamic storage."""

from __future__ import annotations

import uuid

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from tidybridge.config import settings

PRE_MIGRATION_REVISION = "0632fea1c12f"  # head immediately before this one
THIS_REVISION = "f1a2b3c4d5e6"


def test_backfill_preserves_legacy_data_in_fields():
    engine = create_engine(settings.database_url)
    cfg = Config("alembic.ini")

    command.downgrade(cfg, PRE_MIGRATION_REVISION)
    try:
        owner_id = uuid.uuid4()
        record_id = uuid.uuid4()
        run_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id, email, hashed_password, is_active,"
                    " is_superuser, is_verified) VALUES (:id, :email, 'x',"
                    " true, false, true)"
                ),
                {"id": owner_id, "email": f"{owner_id}@example.com"},
            )
            conn.execute(
                text(
                    "INSERT INTO ingestion_runs (id, owner_id, source_file,"
                    " rows_total, rows_clean, rows_flagged,"
                    " rows_dropped_duplicates, rows_skipped_existing)"
                    " VALUES (:id, :owner_id, 'legacy.csv', 1, 1, 0, 0, 0)"
                ),
                {"id": run_id, "owner_id": owner_id},
            )
            conn.execute(
                text(
                    "INSERT INTO client_records (id, owner_id,"
                    " ingestion_run_id, source_file, full_name, email,"
                    " signup_date, amount, phone, has_issues)"
                    " VALUES (:id, :owner_id, :run_id, 'legacy.csv',"
                    " 'Jane Doe', 'jane@example.com', NULL, NULL, NULL,"
                    " false)"
                ),
                {"id": record_id, "owner_id": owner_id, "run_id": run_id},
            )

        command.upgrade(cfg, THIS_REVISION)

        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT fields FROM client_records WHERE id = :id"),
                {"id": record_id},
            ).one()
            assert row.fields == {"full_name": "Jane Doe", "email": "jane@example.com"}

            columns = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns"
                    " WHERE table_name = 'client_records'"
                )
            ).scalars().all()
            assert "full_name" not in columns
            assert "email" not in columns
    finally:
        command.upgrade(cfg, "head")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_migration_dynamic_fields.py -v`
Expected: FAIL - `f1a2b3c4d5e6` doesn't exist yet (`command.upgrade` raises `CommandError`).

- [ ] **Step 3: Write the migration**

```python
"""add column_mappings table and dynamic fields on client_records

Revision ID: f1a2b3c4d5e6
Revises: 0632fea1c12f
Create Date: 2026-09-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "0632fea1c12f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    See docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md.
    One migration, not a phased rollout - add `fields`, backfill every
    existing row's legacy columns into it, then drop those columns, all
    in one shot (this project's scale doesn't need a zero-downtime
    multi-step rollout, and every other data migration here follows the
    same one-shot convention)."""
    op.create_table(
        "column_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="cascade"),
            nullable=False,
            index=True,
        ),
        sa.Column("header_fingerprint", sa.String(), nullable=False),
        sa.Column("field_resolutions", sa.JSON(), nullable=False),
        sa.Column("dedup_key_fields", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        "uq_column_mappings_owner_fingerprint",
        "column_mappings",
        ["owner_id", "header_fingerprint"],
    )

    op.add_column(
        "client_records",
        sa.Column(
            "fields", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
    )
    op.execute(
        """
        UPDATE client_records
        SET fields = jsonb_strip_nulls(jsonb_build_object(
            'full_name', full_name,
            'email', email,
            'signup_date', signup_date,
            'amount', amount,
            'phone', phone
        ))
        """
    )
    op.drop_column("client_records", "full_name")
    op.drop_column("client_records", "email")
    op.drop_column("client_records", "signup_date")
    op.drop_column("client_records", "amount")
    op.drop_column("client_records", "phone")


def downgrade() -> None:
    """Downgrade schema.

    Re-adds the legacy columns and reconstructs them from `fields` -
    lossy only for a record whose `fields` never had that key to begin
    with (which is exactly the point: a genuinely new-shape record has
    no equivalent to fall back to)."""
    op.add_column("client_records", sa.Column("full_name", sa.String(), nullable=True))
    op.add_column("client_records", sa.Column("email", sa.String(), nullable=True))
    op.add_column("client_records", sa.Column("signup_date", sa.String(), nullable=True))
    op.add_column("client_records", sa.Column("amount", sa.String(), nullable=True))
    op.add_column("client_records", sa.Column("phone", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE client_records
        SET full_name = fields->>'full_name',
            email = fields->>'email',
            signup_date = fields->>'signup_date',
            amount = fields->>'amount',
            phone = fields->>'phone'
        """
    )
    op.drop_column("client_records", "fields")
    op.drop_constraint("uq_column_mappings_owner_fingerprint", "column_mappings", type_="unique")
    op.drop_table("column_mappings")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_migration_dynamic_fields.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/f1a2b3c4d5e6_add_column_mappings_and_dynamic_fields.py tests/test_migration_dynamic_fields.py
git commit -m "feat: add column_mappings table and dynamic fields on client_records"
```

---

### Task 2: Models - `ColumnMapping` + `ClientRecord.fields` + compatibility properties

**Files:**
- Modify: `src/tidybridge/models.py`
- Test: `tests/test_models_dynamic_fields.py`

**Interfaces:**
- Consumes: `column_mappings`/`client_records.fields` from Task 1.
- Produces: `ColumnMapping` model; `ClientRecord.fields: dict`; `ClientRecord.full_name`/`.email`/`.signup_date`/`.amount`/`.phone` as read-only properties.

- [ ] **Step 1: Write the failing test**

```python
"""ClientRecord.fields is the real storage; full_name/email/etc. are
read-only properties over it, so every existing consumer (webhooks,
provisioning, export, ClientRecordOut) keeps working unchanged."""

from __future__ import annotations

import uuid

from tidybridge.models import ClientRecord, ColumnMapping


def test_legacy_property_accessors_read_from_fields(db):
    record = ClientRecord(
        owner_id=uuid.uuid4(),
        source_file="test.csv",
        fields={"full_name": "Jane Doe", "email": "jane@example.com"},
        has_issues=False,
    )
    assert record.full_name == "Jane Doe"
    assert record.email == "jane@example.com"
    assert record.signup_date is None  # not in fields at all - no crash


def test_column_mapping_round_trips(db):
    owner_id = uuid.uuid4()
    mapping = ColumnMapping(
        owner_id=owner_id,
        header_fingerprint="abc123",
        field_resolutions=[{"raw_column": "Name", "target_field": "full_name", "type": "string"}],
        dedup_key_fields=["full_name"],
    )
    db.add(mapping)
    db.flush()
    fetched = db.get(ColumnMapping, mapping.id)
    assert fetched.dedup_key_fields == ["full_name"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models_dynamic_fields.py -v`
Expected: FAIL - `ColumnMapping` doesn't exist, `ClientRecord.fields`/property accessors don't exist yet.

- [ ] **Step 3: Modify `models.py`**

In the imports, add `JSONB` alongside the existing `UUID` import:

```python
from sqlalchemy.dialects.postgresql import UUID, JSONB
```

Replace `ClientRecord`'s five legacy columns:

```python
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    signup_date: Mapped[str | None] = mapped_column(String, nullable=True)
    amount: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
```

with:

```python
    fields: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    """Whatever this upload's shape resolved to - see
    docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md.
    No fixed keys; a given record might have "full_name"/"email" (the
    common case, via alias-matching) or something else entirely."""

    @property
    def full_name(self) -> str | None:
        """Backward-compatible accessor - webhooks.py, provisioning.py,
        schemas.py's ClientRecordOut, and main.py's export_records all
        read this as a plain attribute and none of them need to change:
        None (not a KeyError) when this record's fields never had it."""
        return self.fields.get("full_name")

    @property
    def email(self) -> str | None:
        return self.fields.get("email")

    @property
    def signup_date(self) -> str | None:
        return self.fields.get("signup_date")

    @property
    def amount(self) -> str | None:
        return self.fields.get("amount")

    @property
    def phone(self) -> str | None:
        return self.fields.get("phone")
```

Add the new `ColumnMapping` model near `IngestionRun`:

```python
class ColumnMapping(Base):
    """One row per (owner, header shape) an owner has explicitly saved a
    resolution for - looked up by header_fingerprint on every upload. A
    shape with no row here just uses the computed default (mapping.py's
    default_resolution()) - this table only exists for shapes an
    engineer has chosen to name/retype/combine/set a dedup key for."""

    __tablename__ = "column_mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    header_fingerprint: Mapped[str] = mapped_column(String, nullable=False)
    field_resolutions: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    dedup_key_fields: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_models_dynamic_fields.py -v`
Expected: PASS

- [ ] **Step 5: Run the full existing test suite to check for regressions**

Run: `pytest -x`
Expected: PASS (or exactly the pre-existing set of upload/record tests that construct `ClientRecord(full_name=..., email=...)` directly by keyword - see Task 4's note; every test that only *reads* `.full_name`/`.email` continues to pass via the properties).

- [ ] **Step 6: Commit**

```bash
git add src/tidybridge/models.py tests/test_models_dynamic_fields.py
git commit -m "feat: add ColumnMapping model and dynamic ClientRecord.fields"
```

---

### Task 3: `mapping.py` - fingerprint, default resolution, schema building, apply

**Files:**
- Create: `src/tidybridge/mapping.py`
- Test: `tests/test_mapping.py`

**Interfaces:**
- Consumes: `tidycsv.schema.Schema`/`FieldSpec`/`FieldType` (unmodified).
- Produces: `compute_fingerprint(raw_headers: list[str]) -> str`, `default_resolution(raw_headers: list[str], reference_schema: Schema) -> list[dict]`, `build_schema(resolution: list[dict]) -> Schema`, `apply_mapping(raw: pd.DataFrame, resolution: list[dict]) -> pd.DataFrame`, `validate_resolution(resolution: list[dict], dedup_key_fields: list[str]) -> None` (raises `ValueError`).

- [ ] **Step 1: Write the failing test**

```python
"""mapping.py: turns raw file headers into a per-upload Schema and
dataframe tidycsv already knows how to clean - see the design spec."""

from __future__ import annotations

import pandas as pd
import pytest
from tidycsv.schema import Schema

from tidybridge.mapping import (
    apply_mapping,
    build_schema,
    compute_fingerprint,
    default_resolution,
    validate_resolution,
)

REFERENCE_SCHEMA = Schema.load("examples/schema.yaml")


def test_fingerprint_is_order_and_case_insensitive():
    a = compute_fingerprint(["Full Name", "Email"])
    b = compute_fingerprint(["email", " full name "])
    assert a == b


def test_fingerprint_differs_for_different_shapes():
    a = compute_fingerprint(["Full Name", "Email"])
    b = compute_fingerprint(["Full Name", "Email", "Age"])
    assert a != b


def test_default_resolution_uses_alias_matched_type():
    resolution = default_resolution(["Full Name", "E-mail", "Age"], REFERENCE_SCHEMA)
    by_raw = {r["raw_column"]: r for r in resolution}
    assert by_raw["Full Name"]["target_field"] == "full_name"
    assert by_raw["E-mail"]["target_field"] == "email"
    assert by_raw["E-mail"]["type"] == "email"
    assert by_raw["Age"]["target_field"] == "age"
    assert by_raw["Age"]["type"] == "string"


def test_default_resolution_dedupes_colliding_target_names():
    resolution = default_resolution(["Age", "age"], REFERENCE_SCHEMA)
    targets = [r["target_field"] for r in resolution]
    assert targets == ["age", "age_2"]


def test_default_resolution_names_never_start_with_a_digit():
    resolution = default_resolution(["2024 Region"], REFERENCE_SCHEMA)
    assert resolution[0]["target_field"] == "field_2024_region"


def test_apply_mapping_combines_columns_sharing_a_target_field():
    raw = pd.DataFrame({"First": ["Jane"], "Last": ["Doe"], "Other": ["x"]})
    resolution = [
        {"raw_column": "First", "target_field": "full_name", "type": "string"},
        {"raw_column": "Last", "target_field": "full_name", "type": "string"},
        {"raw_column": "Other", "target_field": None, "type": None},
    ]
    mapped = apply_mapping(raw, resolution)
    assert list(mapped.columns) == ["full_name"]
    assert mapped["full_name"].iloc[0] == "Jane Doe"


def test_build_schema_has_no_required_fields():
    resolution = default_resolution(["Full Name", "Email"], REFERENCE_SCHEMA)
    schema = build_schema(resolution)
    assert all(f.required is False for f in schema.fields)


def test_validate_resolution_rejects_dedup_key_not_in_resolution():
    resolution = [{"raw_column": "Name", "target_field": "full_name", "type": "string"}]
    with pytest.raises(ValueError, match="dedup"):
        validate_resolution(resolution, dedup_key_fields=["email"])


def test_validate_resolution_rejects_bad_field_name():
    resolution = [{"raw_column": "Name", "target_field": "1bad name", "type": "string"}]
    with pytest.raises(ValueError, match="target_field"):
        validate_resolution(resolution, dedup_key_fields=[])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_mapping.py -v`
Expected: FAIL - `tidybridge.mapping` doesn't exist.

- [ ] **Step 3: Write `mapping.py`**

```python
"""Per-upload column mapping: turns whatever columns a raw file has into
the schema tidycsv needs to clean it, resolved per (owner, header shape)
rather than fixed globally. tidycsv itself is never modified - see
docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md."""

from __future__ import annotations

import hashlib
import re

import pandas as pd
from tidycsv.schema import FieldSpec, FieldType, Schema

_FIELD_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,99}$")


def compute_fingerprint(raw_headers: list[str]) -> str:
    """Order- and case-insensitive: two uploads with the same columns in
    a different order, or a stray casing/whitespace difference, hash the
    same - only an actual change to the column set produces a new one."""
    normalized = sorted(h.strip().lower() for h in raw_headers)
    return hashlib.sha256("\x1f".join(normalized).encode("utf-8")).hexdigest()


def _normalize_field_name(header: str) -> str:
    """trim, lowercase, collapse runs of non-alphanumerics to a single
    underscore, strip leading/trailing underscores, then guarantee the
    ^[a-z][a-z0-9_]{0,99}$ shape validate_resolution enforces on save -
    a default resolution must never be rejected if saved unchanged."""
    normalized = re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")
    if not normalized:
        return "field"
    if normalized[0].isdigit():
        normalized = f"field_{normalized}"
    return normalized[:100]


def default_resolution(raw_headers: list[str], reference_schema: Schema) -> list[dict]:
    """One entry per raw column: target_field defaults to the header's
    own normalized name, type defaults to the alias-matched field's type
    if the header matches a known schema.yaml alias, else "string". Two
    headers that normalize to the same name get a numeric suffix on the
    second (and third, etc.) rather than silently colliding."""
    alias_lookup = reference_schema.alias_lookup()  # normalized alias -> canonical name
    type_by_name = {f.name: f.type for f in reference_schema.fields}

    seen: dict[str, int] = {}
    resolution: list[dict] = []
    for header in raw_headers:
        alias_key = header.strip().lower().replace("_", " ").replace("-", " ")
        canonical = alias_lookup.get(alias_key)
        target = canonical if canonical else _normalize_field_name(header)

        if target in seen:
            seen[target] += 1
            target = f"{target}_{seen[target]}"
        else:
            seen[target] = 1

        field_type = type_by_name.get(canonical, FieldType.STRING) if canonical else FieldType.STRING
        resolution.append(
            {"raw_column": header, "target_field": target, "type": field_type.value}
        )
    return resolution


def build_schema(resolution: list[dict]) -> Schema:
    """One FieldSpec per distinct non-null target_field - entries sharing
    one collapse into a single field (see apply_mapping). required=False
    on every field: nothing is ever required at the tidycsv level."""
    seen_targets: dict[str, FieldType] = {}
    for entry in resolution:
        target = entry["target_field"]
        if target is None:
            continue
        seen_targets.setdefault(target, FieldType(entry["type"] or "string"))

    fields = [
        FieldSpec(name=name, type=field_type, required=False)
        for name, field_type in seen_targets.items()
    ]
    return Schema(fields=fields, key_columns=[])


def apply_mapping(raw: pd.DataFrame, resolution: list[dict]) -> pd.DataFrame:
    """Renames/combines/drops raw columns per the resolution so the
    result has exactly the synthetic schema's field names - tidycsv's
    map_columns()/coerce_and_validate() run on this output completely
    unchanged. Two raw columns sharing a target_field are joined with a
    single space, in the resolution's own (= the raw file's) order."""
    by_target: dict[str, list[str]] = {}
    for entry in resolution:
        target = entry["target_field"]
        if target is None:
            continue
        by_target.setdefault(target, []).append(entry["raw_column"])

    out = pd.DataFrame(index=raw.index)
    for target, raw_columns in by_target.items():
        if len(raw_columns) == 1:
            out[target] = raw[raw_columns[0]]
        else:
            out[target] = raw[raw_columns].apply(
                lambda row: " ".join(str(v) for v in row if str(v).strip()), axis=1
            )
    return out


def validate_resolution(resolution: list[dict], dedup_key_fields: list[str]) -> None:
    """Raises ValueError with a specific reason on the first violation
    found - called by PUT /column-mappings/{fingerprint} before anything
    is persisted."""
    target_fields = {entry["target_field"] for entry in resolution if entry["target_field"]}
    for target in target_fields:
        if not _FIELD_NAME_RE.match(target):
            raise ValueError(f"invalid target_field {target!r}: must match {_FIELD_NAME_RE.pattern}")
    for key in dedup_key_fields:
        if key not in target_fields:
            raise ValueError(f"dedup_key_fields entry {key!r} is not a target_field in this resolution")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_mapping.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tidybridge/mapping.py tests/test_mapping.py
git commit -m "feat: add mapping.py - fingerprint, default resolution, apply_mapping"
```

---

### Task 4: `ingest.py` - dynamic resolution + generalized deduplication

**Files:**
- Modify: `src/tidybridge/ingest.py`
- Test: `tests/test_ingest_dynamic_fields.py`

**Interfaces:**
- Consumes: `mapping.compute_fingerprint`, `mapping.default_resolution`, `mapping.build_schema`, `mapping.apply_mapping` (Task 3); `models.ColumnMapping` (Task 2).
- Produces: `ingest_file(db, filename, content, reference_schema, owner_id) -> tuple[list[ClientRecord], IngestionRun, bool]` - the new `bool` is `mapping_is_default`.

- [ ] **Step 1: Write the failing test**

```python
"""ingest_file: dynamic per-shape resolution, generalized dedup."""

from __future__ import annotations

import io
import uuid

from tidybridge.ingest import ingest_file, load_schema
from tidybridge.models import ColumnMapping


def _content(csv_text: str) -> bytes:
    return csv_text.encode("utf-8")


def test_unseen_shape_uses_default_and_ingests_immediately(db):
    owner_id = uuid.uuid4()
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    records, run, mapping_is_default = ingest_file(
        db, "test.csv", content, load_schema(), owner_id
    )
    assert mapping_is_default is True
    assert len(records) == 1
    assert records[0].fields == {"full_name": "Jane Doe", "email": "jane@example.com"}


def test_unrecognized_column_becomes_its_own_field(db):
    owner_id = uuid.uuid4()
    content = _content("Full Name,Age\nJane Doe,30\n")
    records, _run, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert records[0].fields == {"full_name": "Jane Doe", "age": "30"}


def test_saved_mapping_applies_silently_on_next_upload(db):
    owner_id = uuid.uuid4()
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    db.add(
        ColumnMapping(
            owner_id=owner_id,
            header_fingerprint=fingerprint,
            field_resolutions=[
                {"raw_column": "Full Name", "target_field": "name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email_address", "type": "email"},
            ],
            dedup_key_fields=[],
        )
    )
    db.commit()

    records, _run, mapping_is_default = ingest_file(
        db, "test.csv", content, load_schema(), owner_id
    )
    assert mapping_is_default is False
    assert records[0].fields == {"name": "Jane Doe", "email_address": "jane@example.com"}


def test_dedup_key_skips_already_ingested_rows_across_uploads(db):
    owner_id = uuid.uuid4()
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    db.add(
        ColumnMapping(
            owner_id=owner_id,
            header_fingerprint=fingerprint,
            field_resolutions=[
                {"raw_column": "Full Name", "target_field": "full_name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            dedup_key_fields=["email"],
        )
    )
    db.commit()

    ingest_file(db, "test.csv", content, load_schema(), owner_id)
    _records, run2, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert run2.rows_skipped_existing == 1


def test_no_dedup_key_means_every_row_inserts(db):
    owner_id = uuid.uuid4()
    content = _content("Full Name,E-mail\nJane Doe,jane@example.com\n")
    ingest_file(db, "test.csv", content, load_schema(), owner_id)
    _records, run2, _ = ingest_file(db, "test.csv", content, load_schema(), owner_id)
    assert run2.rows_skipped_existing == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ingest_dynamic_fields.py -v`
Expected: FAIL - `ingest_file` still returns a 2-tuple and builds `ClientRecord(full_name=..., email=..., ...)`.

- [ ] **Step 3: Modify `ingest.py`**

Add imports:

```python
from tidybridge.mapping import apply_mapping, build_schema, compute_fingerprint, default_resolution
from tidybridge.models import ClientRecord, ColumnMapping, IngestionRun
```

Replace the body from `raw = load_input(tmp_path)` through the `flag_duplicates` call with:

```python
            raw = load_input(tmp_path)
            fingerprint = compute_fingerprint(list(raw.columns))
            saved = db.execute(
                select(ColumnMapping).where(
                    ColumnMapping.owner_id == owner_id,
                    ColumnMapping.header_fingerprint == fingerprint,
                )
            ).scalar_one_or_none()

            mapping_is_default = saved is None
            if saved is not None:
                resolution = saved.field_resolutions
                dedup_key_fields = saved.dedup_key_fields
            else:
                resolution = default_resolution(list(raw.columns), schema)
                dedup_key_fields = []

            dynamic_schema = build_schema(resolution)
            mapped = apply_mapping(raw, resolution)
            coerced, issues = coerce_and_validate(mapped, dynamic_schema)
            deduped, dropped = flag_duplicates(coerced, dedup_key_fields)
```

(The `schema` parameter `ingest_file` already receives - `load_schema()`'s result - is now used only as the *alias/type-hint reference* for `default_resolution`, per the spec's decision #7. It's no longer passed to `coerce_and_validate`/`flag_duplicates`; `dynamic_schema` is.)

Replace the per-row loop's record construction. The existing loop does column-wise `.at[idx, "full_name"]` access per fixed field (preserving the documented NaN-in-Series lesson from this file's own header comment) - keep that same access pattern, just generalized over `deduped.columns` instead of five fixed names, and replace the hardcoded email-based existing-record lookup with a `dedup_key_fields`-driven one:

```python
        inserted: list[ClientRecord] = []
        skipped_existing = 0
        for idx in deduped.index:
            row_issues = issue_map.get(idx)
            # Column-wise .at[] access, not deduped.loc[idx].to_dict() -
            # same reason as the fixed-field version this replaces: a
            # correctly-None cell comes back as float NaN once it's
            # inside a whole-row Series, even though the source column
            # holds it fine.
            field_values = {col: deduped.at[idx, col] for col in deduped.columns}

            existing = None
            if dedup_key_fields:
                conditions = [ClientRecord.owner_id == owner_id]
                for key in dedup_key_fields:
                    conditions.append(ClientRecord.fields[key].astext == str(field_values.get(key)))
                existing = db.execute(select(ClientRecord).where(*conditions)).scalars().first()
            if existing:
                skipped_existing += 1
                continue

            record = ClientRecord(
                owner_id=owner_id,
                ingestion_run_id=run.id,
                source_file=filename,
                fields=field_values,
                has_issues=row_issues is not None,
                issues=row_issues,
            )
            db.add(record)
            db.flush()  # assigns record.id before we reference it in the webhook
            inserted.append(record)
```

Change the function signature and final `return`:

```python
def ingest_file(
    db: Session, filename: str, content: bytes, schema: Schema, owner_id: uuid.UUID
) -> tuple[list[ClientRecord], IngestionRun, bool]:
```

```python
    return inserted, run, mapping_is_default
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ingest_dynamic_fields.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `pytest -x`
Expected: Every test that calls `ingest_file` directly (not just through the HTTP endpoint) needs updating for the 3-tuple return - fix any such call sites now. `test_ingestion_runs.py` and similar HTTP-level tests should be unaffected until Task 7 changes `IngestResult`'s shape.

- [ ] **Step 6: Commit**

```bash
git add src/tidybridge/ingest.py tests/test_ingest_dynamic_fields.py
git commit -m "feat: dynamic per-shape resolution and generalized dedup in ingest_file"
```

---

### Task 5: SCIM provisioning null-safety

**Files:**
- Modify: `src/tidybridge/provisioning.py`
- Test: `tests/test_provisioning.py` (add a case to the existing file)

**Interfaces:**
- Modifies: `build_scim_payload(record, mapping)` - no signature change, only null-safety.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_provisioning.py` (matching that file's existing style/fixtures - read it first for the exact `ClientRecord`-construction helper already in use there):

```python
def test_build_scim_payload_handles_missing_full_name_gracefully():
    from tidybridge.models import ClientRecord
    from tidybridge.provisioning import build_scim_payload

    record = ClientRecord(owner_id=uuid.uuid4(), source_file="x.csv", fields={}, has_issues=False)
    mapping = {"name.givenName": "full_name", "name.familyName": "full_name"}
    payload = build_scim_payload(record, mapping)
    assert payload == {"name": {"givenName": "", "familyName": ""}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_provisioning.py -k missing_full_name -v`
Expected: FAIL - `AttributeError: 'NoneType' object has no attribute 'partition'`.

- [ ] **Step 3: Fix `build_scim_payload`**

Change:

```python
        elif path == "name.givenName":
            first, _, _rest = getattr(record, source).partition(" ")
            value = first
        elif path == "name.familyName":
            _first, _, rest = getattr(record, source).partition(" ")
            value = rest or _first
```

to:

```python
        elif path == "name.givenName":
            first, _, _rest = (getattr(record, source) or "").partition(" ")
            value = first
        elif path == "name.familyName":
            _first, _, rest = (getattr(record, source) or "").partition(" ")
            value = rest or _first
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_provisioning.py -v`
Expected: PASS (including every pre-existing test in that file).

- [ ] **Step 5: Commit**

```bash
git add src/tidybridge/provisioning.py tests/test_provisioning.py
git commit -m "fix: build_scim_payload degrades gracefully when a mapped field is missing"
```

---

### Task 6: Mapping-management endpoints + schemas

**Files:**
- Modify: `src/tidybridge/main.py`, `src/tidybridge/schemas.py`
- Test: `tests/test_column_mappings.py`

**Interfaces:**
- Consumes: `mapping.validate_resolution`, `mapping.default_resolution` (Task 3); `models.ColumnMapping` (Task 2).
- Produces: `GET /column-mappings/{fingerprint}`, `PUT /column-mappings/{fingerprint}`.

- [ ] **Step 1: Write the failing test**

```python
"""GET/PUT /column-mappings/{fingerprint} - the entirely optional,
prospective-only review step."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _upload(client: TestClient):
    return client.post(
        "/records/upload",
        files={"file": ("test.csv", b"Full Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")},
    )


def test_get_unseen_fingerprint_returns_the_computed_default(client: TestClient):
    _upload(client)
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    resp = client.get(f"/column-mappings/{fingerprint}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["dedup_key_fields"] == []
    targets = {e["raw_column"]: e["target_field"] for e in body["field_resolutions"]}
    assert targets["Full Name"] == "full_name"


def test_put_saves_a_resolution_applied_on_next_upload(client: TestClient):
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    resp = client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": [
                {"raw_column": "Full Name", "target_field": "name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            "dedup_key_fields": ["email"],
        },
    )
    assert resp.status_code == 200

    upload = _upload(client)
    assert upload.json()["records"][0]["fields"]["name"] == "Jane Doe"
    assert upload.json()["mapping_is_default"] is False


def test_put_rejects_invalid_target_field(client: TestClient):
    resp = client.put(
        "/column-mappings/anyfingerprint",
        json={
            "field_resolutions": [
                {"raw_column": "Full Name", "target_field": "1bad", "type": "string"}
            ],
            "dedup_key_fields": [],
        },
    )
    assert resp.status_code == 400


def test_mapping_is_owner_scoped(client: TestClient, other_client: TestClient):
    from tidybridge.mapping import compute_fingerprint

    fingerprint = compute_fingerprint(["Full Name", "E-mail"])
    client.put(
        f"/column-mappings/{fingerprint}",
        json={
            "field_resolutions": [
                {"raw_column": "Full Name", "target_field": "name", "type": "string"},
                {"raw_column": "E-mail", "target_field": "email", "type": "email"},
            ],
            "dedup_key_fields": [],
        },
    )
    other_upload = other_client.post(
        "/records/upload",
        files={"file": ("test.csv", b"Full Name,E-mail\nJane Doe,jane@example.com\n", "text/csv")},
    )
    # other_client never saved a mapping - still gets the default, not client's.
    assert other_upload.json()["records"][0]["fields"].get("full_name") == "Jane Doe"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_column_mappings.py -v`
Expected: FAIL - `404 Not Found` on both routes (they don't exist yet).

- [ ] **Step 3: Add schemas to `schemas.py`**

```python
class FieldResolutionIn(BaseModel):
    raw_column: str
    target_field: str | None
    type: str | None


class ColumnMappingIn(BaseModel):
    field_resolutions: list[FieldResolutionIn]
    dedup_key_fields: list[str]


class ColumnMappingOut(BaseModel):
    field_resolutions: list[FieldResolutionIn]
    dedup_key_fields: list[str]
```

- [ ] **Step 4: Add routes to `main.py`**

Near `upload_records`:

```python
@app.get("/column-mappings/{fingerprint}", response_model=ColumnMappingOut)
def get_column_mapping(
    fingerprint: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ColumnMappingOut:
    saved = db.execute(
        select(ColumnMapping).where(
            ColumnMapping.owner_id == user.id, ColumnMapping.header_fingerprint == fingerprint
        )
    ).scalar_one_or_none()
    if saved is not None:
        return ColumnMappingOut(
            field_resolutions=saved.field_resolutions, dedup_key_fields=saved.dedup_key_fields
        )
    # No saved mapping - fingerprint alone can't reconstruct raw headers,
    # so there's nothing meaningful to default to without a real upload.
    raise HTTPException(status_code=404, detail="No saved mapping for this shape yet")


@app.put("/column-mappings/{fingerprint}", response_model=ColumnMappingOut)
def put_column_mapping(
    fingerprint: str,
    body: ColumnMappingIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ColumnMappingOut:
    resolution = [entry.model_dump() for entry in body.field_resolutions]
    try:
        validate_resolution(resolution, body.dedup_key_fields)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = db.execute(
        select(ColumnMapping).where(
            ColumnMapping.owner_id == user.id, ColumnMapping.header_fingerprint == fingerprint
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.field_resolutions = resolution
        existing.dedup_key_fields = body.dedup_key_fields
    else:
        db.add(
            ColumnMapping(
                owner_id=user.id,
                header_fingerprint=fingerprint,
                field_resolutions=resolution,
                dedup_key_fields=body.dedup_key_fields,
            )
        )
    db.commit()
    return ColumnMappingOut(field_resolutions=resolution, dedup_key_fields=body.dedup_key_fields)
```

Add the matching imports at the top of `main.py`: `ColumnMapping` to the existing `from tidybridge.models import ...` line, `ColumnMappingIn, ColumnMappingOut` to the `from tidybridge.schemas import ...` line, and `from tidybridge.mapping import validate_resolution`.

Note the `test_get_unseen_fingerprint_returns_the_computed_default` test above expects a 200 with the computed default, but the route as written 404s when nothing's saved. Fix: after upload has happened once for that shape, a `ColumnMapping` row still won't exist (the default is computed in-memory, never persisted unless saved - per the spec, intentionally). Rewrite that test instead to assert 404 before any `PUT`, since there's genuinely nothing to fetch until either an upload has revealed the shape's raw headers (not stored) or an engineer has saved one - update the test:

```python
def test_get_unsaved_fingerprint_returns_404(client: TestClient):
    resp = client.get("/column-mappings/nonexistent-fingerprint")
    assert resp.status_code == 404
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_column_mappings.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tidybridge/main.py src/tidybridge/schemas.py tests/test_column_mappings.py
git commit -m "feat: add GET/PUT /column-mappings/{fingerprint}"
```

---

### Task 7: Upload endpoint + `IngestResult`/`ClientRecordOut` dynamic shape

**Files:**
- Modify: `src/tidybridge/main.py`, `src/tidybridge/schemas.py`
- Test: `tests/test_ingestion_runs.py` (update), `tests/test_api.py` (update)

**Interfaces:**
- Consumes: `ingest_file`'s new 3-tuple return (Task 4).
- Produces: `IngestResult.mapping_is_default: bool`; `ClientRecordOut.fields: dict` replacing the five fixed fields.

- [ ] **Step 1: Update `schemas.py`**

```python
class ClientRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ingestion_run_id: uuid.UUID | None
    source_file: str
    fields: dict
    has_issues: bool
    issues: list[dict] | None
    created_at: datetime
```

```python
class IngestResult(BaseModel):
    ingestion_run_id: uuid.UUID
    rows_total: int
    rows_clean: int
    rows_flagged: int
    rows_dropped_duplicates: int
    rows_skipped_existing: int
    mapping_is_default: bool
    records: list[ClientRecordOut]
```

- [ ] **Step 2: Update `upload_records` in `main.py`**

```python
    inserted, run, mapping_is_default = await run_in_threadpool(
        ingest_file, db, file.filename or "upload.csv", content, schema, user.id
    )
    return IngestResult(
        ingestion_run_id=run.id,
        rows_total=run.rows_total,
        rows_clean=run.rows_clean,
        rows_flagged=run.rows_flagged,
        rows_dropped_duplicates=run.rows_dropped_duplicates,
        rows_skipped_existing=run.rows_skipped_existing,
        mapping_is_default=mapping_is_default,
        records=[ClientRecordOut.model_validate(r) for r in inserted],
    )
```

- [ ] **Step 3: Update the existing tests that assert on the old fixed fields**

`tests/test_ingestion_runs.py` and `tests/test_api.py` likely assert `record["full_name"]`/`record["email"]` directly on the JSON response - `ClientRecordOut` no longer has those keys (only `fields`, which *contains* `full_name`/`email` for the standard fixture shape). Update every such assertion from e.g. `record["full_name"]` to `record["fields"]["full_name"]`.

Run: `pytest tests/test_ingestion_runs.py tests/test_api.py -v` first to see the exact failures, then fix each one - this plan can't enumerate every existing assertion without reading those files' current content at implementation time.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ingestion_runs.py tests/test_api.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `pytest -x`
Expected: PASS. `test_export.py` and `test_webhooks.py`/`test_provisioning.py` should be unaffected - they read `record.full_name`/`record.email` as Python attributes (via the Task 2 properties), not `ClientRecordOut` JSON.

- [ ] **Step 6: Commit**

```bash
git add src/tidybridge/main.py src/tidybridge/schemas.py tests/test_ingestion_runs.py tests/test_api.py
git commit -m "feat: IngestResult/ClientRecordOut expose dynamic fields"
```

---

### Task 8: Frontend - `client.ts` types and calls

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`
- Test: none (thin API layer - covered by the component tests in Tasks 9-10)

**Interfaces:**
- Produces: updated `IngestResult`/`ClientRecordOut` TS types; `getColumnMapping(fingerprint)`, `saveColumnMapping(fingerprint, body)`.

- [ ] **Step 1: Update `types.ts`**

Find `ClientRecordOut`/`IngestResult`'s TypeScript definitions (mirroring the Python schemas) and update to match Task 7:

```typescript
export interface ClientRecordOut {
  id: string;
  ingestion_run_id: string | null;
  source_file: string;
  fields: Record<string, string | null>;
  has_issues: boolean;
  issues: { field: string; issue: string }[] | null;
  created_at: string;
}

export interface IngestResult {
  ingestion_run_id: string;
  rows_total: number;
  rows_clean: number;
  rows_flagged: number;
  rows_dropped_duplicates: number;
  rows_skipped_existing: number;
  mapping_is_default: boolean;
  records: ClientRecordOut[];
}

export interface FieldResolution {
  raw_column: string;
  target_field: string | null;
  type: string | null;
}

export interface ColumnMapping {
  field_resolutions: FieldResolution[];
  dedup_key_fields: string[];
}
```

- [ ] **Step 2: Add calls to `client.ts`**

Near `uploadFile`:

```typescript
export async function getColumnMapping(fingerprint: string): Promise<ColumnMapping> {
  const response = await fetch(`${API_URL}/column-mappings/${fingerprint}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return response.json();
}

export async function saveColumnMapping(
  fingerprint: string,
  body: ColumnMapping
): Promise<ColumnMapping> {
  const response = await fetch(`${API_URL}/column-mappings/${fingerprint}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return response.json();
}
```

(Match `authHeaders()`/`ApiError`'s actual names from this file's existing calls - read `uploadFile`'s implementation first if these differ.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/types.ts
git commit -m "feat: client.ts support for dynamic fields and column mappings"
```

---

### Task 9: Frontend - dynamic upload-results table + review affordance

**Files:**
- Modify: the page/component that renders `uploadFile()`'s result today (locate via `grep -rn "uploadFile" frontend/src` at implementation time - likely `frontend/src/pages/RecordsPage.tsx` or a dedicated upload component).
- Test: a React Testing Library test alongside that component, matching this frontend's existing test conventions (`grep -rln "\.test\.tsx" frontend/src` to find the pattern to match).

**Interfaces:**
- Consumes: `IngestResult`/`ColumnMapping` types, `getColumnMapping`/`saveColumnMapping` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadResultsTable } from "./UploadResultsTable";

describe("UploadResultsTable", () => {
  it("renders one column per distinct field across the upload's records", () => {
    render(
      <UploadResultsTable
        records={[
          { id: "1", fields: { full_name: "Jane Doe", email: "jane@example.com" }, has_issues: false, issues: null } as any,
        ]}
      />
    );
    expect(screen.getByText("full_name")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows a review affordance when mapping_is_default is true", () => {
    render(
      <UploadResultsTable
        records={[]}
        mappingIsDefault
        fingerprint="abc123"
      />
    );
    expect(screen.getByText(/review the field names/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run UploadResultsTable`
Expected: FAIL - module doesn't exist.

- [ ] **Step 3: Write `UploadResultsTable.tsx`**

```tsx
import type { ClientRecordOut } from "../api/types";

interface Props {
  records: ClientRecordOut[];
  mappingIsDefault?: boolean;
  fingerprint?: string;
  onReviewMapping?: () => void;
}

export function UploadResultsTable({ records, mappingIsDefault, fingerprint, onReviewMapping }: Props) {
  const fieldNames = Array.from(
    new Set(records.flatMap((record) => Object.keys(record.fields)))
  );

  return (
    <div>
      {mappingIsDefault && fingerprint && (
        <p>
          New shape - review the field names/types we picked?{" "}
          <button onClick={onReviewMapping}>Review mapping</button>
        </p>
      )}
      <table>
        <thead>
          <tr>
            {fieldNames.map((name) => (
              <th key={name}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {fieldNames.map((name) => (
                <td key={name}>{record.fields[name] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run UploadResultsTable`
Expected: PASS

- [ ] **Step 5: Wire it into the actual upload flow**

Locate where `uploadFile()`'s result is currently rendered (grep as noted above) and replace whatever fixed-column rendering exists there with `<UploadResultsTable records={result.records} mappingIsDefault={result.mapping_is_default} fingerprint={...} />`. The fingerprint isn't returned by `POST /records/upload` today - add it to `IngestResult` in Task 7 if the review affordance needs to link to a specific mapping (`GET/PUT /column-mappings/{fingerprint}` needs one). Revisit Task 7's schema to include `fingerprint: str` on `IngestResult` before wiring this up, since the backend already computes it (`ingest.py`'s local `fingerprint` variable) and it's cheap to expose.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: dynamic upload-results table with review-mapping affordance"
```

---

### Task 10: Frontend - mapping review screen

**Files:**
- Create: `frontend/src/pages/ColumnMappingReviewPage.tsx` (or a modal/panel, matching this app's existing navigation conventions - check `frontend/src/App.tsx`'s routing style first)
- Test: alongside, matching Task 9's test conventions.

**Interfaces:**
- Consumes: `getColumnMapping`, `saveColumnMapping` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { ColumnMappingReviewPage } from "./ColumnMappingReviewPage";

describe("ColumnMappingReviewPage", () => {
  it("loads the current resolution and saves edits", async () => {
    vi.spyOn(client, "getColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "full_name", type: "string" }],
      dedup_key_fields: [],
    });
    const save = vi.spyOn(client, "saveColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "name", type: "string" }],
      dedup_key_fields: [],
    });

    render(<ColumnMappingReviewPage fingerprint="abc123" />);
    await screen.findByDisplayValue("full_name");

    fireEvent.change(screen.getByDisplayValue("full_name"), { target: { value: "name" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(save).toHaveBeenCalledWith("abc123", expect.objectContaining({
      field_resolutions: [{ raw_column: "Full Name", target_field: "name", type: "string" }],
    })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run ColumnMappingReviewPage`
Expected: FAIL - module doesn't exist.

- [ ] **Step 3: Write `ColumnMappingReviewPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getColumnMapping, saveColumnMapping } from "../api/client";
import type { FieldResolution } from "../api/types";

interface Props {
  fingerprint: string;
}

const FIELD_TYPES = ["string", "email", "date", "currency", "integer", "phone"];

export function ColumnMappingReviewPage({ fingerprint }: Props) {
  const [resolutions, setResolutions] = useState<FieldResolution[]>([]);
  const [dedupKeyFields, setDedupKeyFields] = useState<string[]>([]);

  useEffect(() => {
    getColumnMapping(fingerprint).then((mapping) => {
      setResolutions(mapping.field_resolutions);
      setDedupKeyFields(mapping.dedup_key_fields);
    });
  }, [fingerprint]);

  function updateTargetField(index: number, value: string) {
    setResolutions((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, target_field: value || null } : entry))
    );
  }

  function updateType(index: number, value: string) {
    setResolutions((prev) => prev.map((entry, i) => (i === index ? { ...entry, type: value } : entry)));
  }

  function toggleDedupKey(field: string) {
    setDedupKeyFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleSave() {
    await saveColumnMapping(fingerprint, { field_resolutions: resolutions, dedup_key_fields: dedupKeyFields });
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Raw column</th>
            <th>Field name</th>
            <th>Type</th>
            <th>Dedup key</th>
          </tr>
        </thead>
        <tbody>
          {resolutions.map((entry, index) => (
            <tr key={entry.raw_column}>
              <td>{entry.raw_column}</td>
              <td>
                <input
                  value={entry.target_field ?? ""}
                  onChange={(e) => updateTargetField(index, e.target.value)}
                />
              </td>
              <td>
                <select value={entry.type ?? "string"} onChange={(e) => updateType(index, e.target.value)}>
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {entry.target_field && (
                  <input
                    type="checkbox"
                    checked={dedupKeyFields.includes(entry.target_field)}
                    onChange={() => toggleDedupKey(entry.target_field as string)}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run ColumnMappingReviewPage`
Expected: PASS

- [ ] **Step 5: Wire into routing/navigation**

Add a route in `App.tsx` (matching its existing pattern) and link it from Task 9's "Review mapping" button.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: column mapping review screen"
```

---

### Task 11: Frontend - `RecordDetailPage.tsx` dynamic fields

**Files:**
- Modify: `frontend/src/pages/RecordDetailPage.tsx`
- Test: alongside, matching this file's existing test (if any - check first).

**Interfaces:**
- Consumes: `ClientRecordOut.fields` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordFieldsList } from "./RecordDetailPage";

describe("RecordFieldsList", () => {
  it("renders every key in fields, not just a fixed set", () => {
    render(<RecordFieldsList fields={{ full_name: "Jane Doe", age: "30" }} />);
    expect(screen.getByText("full_name")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run RecordDetailPage`
Expected: FAIL - `RecordFieldsList` doesn't exist; the page currently renders `record.full_name`/`record.email` etc. as fixed JSX, which no longer compile against the updated `ClientRecordOut` type from Task 8.

- [ ] **Step 3: Read the current file, then replace its fixed-field rendering**

Read `frontend/src/pages/RecordDetailPage.tsx` first to see its exact current structure (header/layout around the record fields), then extract a small exported component:

```tsx
export function RecordFieldsList({ fields }: { fields: Record<string, string | null> }) {
  return (
    <dl>
      {Object.entries(fields).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
```

Replace whatever previously rendered `record.full_name`, `record.email`, etc. individually with `<RecordFieldsList fields={record.fields} />`, keeping the rest of the page (issues, webhook status, etc.) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run RecordDetailPage`
Expected: PASS

- [ ] **Step 5: Full frontend test run**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RecordDetailPage.tsx
git commit -m "feat: RecordDetailPage renders dynamic fields"
```

---

## Self-Review

**Spec coverage:**
- Storage (`fields` JSONB, migration/backfill) - Task 1, 2. ✓
- No type-sniffing, alias-match-or-string - `mapping.py`'s `default_resolution` - Task 3. ✓
- Engineer-chosen, optionally composite dedup key - Task 3 (`build_schema`/`validate_resolution`), Task 4 (`flag_duplicates` + cross-upload check), Task 10 (UI). ✓
- Nothing required to proceed, always ingests immediately - Task 4. ✓
- Upload-results table, one shape per upload - Task 9. ✓
- tidycsv never modified - Task 3/4 only ever build/pass `Schema`/`FieldSpec` objects, never edit tidycsv source. ✓
- Mapping management (`GET`/`PUT /column-mappings/{fingerprint}`), prospective-only - Task 6. ✓
- Security: field-name validation, ownership scoping - Task 3's `validate_resolution` + Task 6's `owner_id` filtering. ✓
- `RecordDetailPage.tsx` dynamic fields - Task 11. ✓
- Webhooks/provisioning/export/list-table explicitly deferred - no task touches `webhooks.py`, `webhook_worker.py`'s webhook half, `export_records`, or a persistent list-table rewrite; Task 5 is the one necessary provisioning fix to keep it from crashing, not a dynamism upgrade. ✓

**Placeholder scan:** no TBD/TODO. Two steps (Task 3's test-file read for `RecordDetailPage.tsx`'s current structure, Task 7's Step 3 test-assertion fixes) intentionally defer to reading the actual current file content at implementation time rather than guessing it wrong here - flagged explicitly as such, not silently vague.

**Type consistency:** `ingest_file`'s return type (`list[ClientRecord], IngestionRun, bool`) is consistent between Task 4's definition and Task 7's call site. `ClientRecordOut.fields: dict` (Task 7) matches `ClientRecord.fields: Mapped[dict]` (Task 2) and the frontend `ClientRecordOut.fields: Record<string, string | null>` (Task 8). `ColumnMapping`/`FieldResolution` names match exactly between `mapping.py`'s dict shape, `schemas.py`'s Pydantic models, and `types.ts`.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-16-dynamic-schema-mapping.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
