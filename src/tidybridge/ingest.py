"""Ingestion pipeline: take an uploaded file, clean it via tidycsv, persist
the results, and trigger a webhook for each newly inserted record.

Note on reusing tidycsv's lower-level functions instead of its `clean()`
convenience wrapper: `clean()` returns `clean_df` with its index reset to
0..N-1 after deduplication, while `result.issues` still carries each issue's
*original* row_index from before dedup. That's fine for tidycsv's own CLI,
which only ever prints `row_index` as a label for a human to cross-reference
against their source file - it never needs to align an issue back to a
specific row of `clean_df` programmatically. This service does need that
alignment (to know which persisted record `has_issues`), so it calls
`coerce_and_validate` and `flag_duplicates` directly instead of `clean()`:
`flag_duplicates` does not reset the index, so the surviving rows keep their
original position and can be matched against `issues` directly.

Note on the schema passed in vs. the schema actually used: `schema` (loaded
once from examples/schema.yaml by load_schema()) is now only the *reference*
mapping.py's default_resolution() consults for alias/type hints - it's no
longer passed to coerce_and_validate()/flag_duplicates() directly. Each
upload builds its own dynamic Schema from that shape's resolution (saved, or
computed fresh) - see
docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md."""

from __future__ import annotations

import logging
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session
from tidycsv.cleaner import coerce_and_validate, flag_duplicates, load_input, map_columns
from tidycsv.schema import Schema

from tidybridge.config import settings
from tidybridge.mapping import (
    apply_mapping,
    build_schema,
    compute_fingerprint,
    default_dedup_key_fields,
    default_resolution,
)
from tidybridge.models import ClientRecord, ColumnMapping, IngestionRun
from tidybridge.provisioning import enqueue_provisioning
from tidybridge.webhooks import enqueue_delivery

logger = logging.getLogger(__name__)


def load_schema() -> Schema:
    return Schema.load(Path(settings.schema_path))


def ingest_file(
    db: Session, filename: str, content: bytes, schema: Schema, owner_id: uuid.UUID
) -> tuple[list[ClientRecord], IngestionRun, bool]:
    # Generated here, up front, rather than left to IngestionRun's own
    # id default at flush() below - this is the correlation_id logged
    # against *every* stage of this upload (received, failed if it never
    # finishes, completed, and later - via ClientRecord.ingestion_run_id
    # - each webhook/provisioning attempt the worker makes for it), so it
    # has to exist before the riskiest work (tidycsv parsing) even runs.
    correlation_id = uuid.uuid4()
    logger.info(
        "upload.received",
        extra={
            "correlation_id": str(correlation_id),
            "owner_id": str(owner_id),
            "source_file": filename,
        },
    )

    try:
        suffix = Path(filename).suffix or ".csv"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)

        try:
            raw = load_input(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

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
            # Not blank by default: when the shape includes an
            # alias-matched email column, that's the same identity
            # tidybridge always assumed before dynamic mapping existed -
            # re-uploading an unchanged file stays a no-op with zero
            # configuration. Only a genuinely novel shape with nothing
            # email-like gets no default (see default_dedup_key_fields).
            dedup_key_fields = default_dedup_key_fields(resolution)

        dynamic_schema = build_schema(resolution)
        # apply_mapping()'s output already has exactly dynamic_schema's
        # field names - map_columns() here is a defensive no-op in terms
        # of content (each name self-matches its own trivial alias), but
        # it's still the real tidycsv pipeline stage, not skipped: it
        # normalizes column order to dynamic_schema.fields and guards
        # against apply_mapping ever producing an unexpected extra column.
        mapped = map_columns(apply_mapping(raw, resolution), dynamic_schema)
        coerced, issues = coerce_and_validate(mapped, dynamic_schema)
        deduped, dropped = flag_duplicates(coerced, dedup_key_fields)

        issue_map: dict[int, list[dict]] = {}
        for issue in issues:
            issue_map.setdefault(issue.row_index, []).append(
                {"field": issue.field, "issue": issue.issue}
            )

        # Created up front - rows_clean/rows_flagged are filled in below
        # once the loop that computes them finishes, but rows_total/
        # rows_dropped_duplicates are already known here, and run.id
        # needs to exist before any ClientRecord below can reference it.
        run = IngestionRun(
            id=correlation_id,
            owner_id=owner_id,
            source_file=filename,
            rows_total=len(raw),
            rows_clean=0,
            rows_flagged=0,
            rows_dropped_duplicates=dropped,
        )
        db.add(run)
        db.flush()

        inserted: list[ClientRecord] = []
        skipped_existing = 0
        for idx in deduped.index:
            # Column-wise .at[] access, not deduped.iterrows()/.to_dict():
            # both build a fresh per-row Series spanning every column, and
            # pandas infers a single dtype for that Series just like it
            # does for a column - so a correctly-None cell comes back as
            # float NaN yet again once it's inside a row-Series, even
            # though the source column holds it fine. Same root cause as
            # the fix upstream in tidycsv, different call site.
            row_issues = issue_map.get(idx)
            field_values = {col: deduped.at[idx, col] for col in deduped.columns}

            existing = None
            if dedup_key_fields:
                # Scoped to this owner: two different engineers uploading
                # a client with the same key values are two separate
                # records, not a duplicate of each other's - each
                # engineer's dedup is their own.
                conditions = [ClientRecord.owner_id == owner_id]
                for key in dedup_key_fields:
                    conditions.append(ClientRecord.fields[key].astext == str(field_values.get(key)))
                existing = db.execute(select(ClientRecord).where(*conditions)).scalars().first()
            if existing:
                # Already ingested - re-uploading the same list is a
                # no-op, not an error. Counted, not just skipped
                # silently: without this, rows_total stops summing to
                # rows_clean + rows_flagged + rows_dropped_duplicates
                # on a re-upload, and the run's own numbers no longer
                # account for every row.
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

        run.rows_flagged = sum(1 for r in inserted if r.has_issues)
        run.rows_clean = len(inserted) - run.rows_flagged
        run.rows_skipped_existing = skipped_existing

        # Enqueued in the same transaction as the run/records themselves,
        # not after - a job only ever exists for a record that actually
        # made it into the database, never an orphan left behind by a
        # rolled-back ingest.
        for record in inserted:
            enqueue_delivery(db, record)
            enqueue_provisioning(db, record)

        db.commit()
    except Exception as exc:
        # Pure visibility, not error handling: nothing here is caught to
        # be recovered from, only logged before the same exception
        # propagates on to the caller exactly as it would without this
        # try/except (POST /records/upload still 500s). Without this, an
        # upload that dies mid-ingest (a bad file, a DB error) leaves
        # zero trace of the attempt ever happening - not even
        # upload.received's correlation_id is enough on its own to know
        # the run never finished.
        logger.info(
            "upload.failed",
            extra={
                "correlation_id": str(correlation_id),
                "owner_id": str(owner_id),
                "source_file": filename,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        raise

    logger.info(
        "upload.completed",
        extra={
            "correlation_id": str(correlation_id),
            "owner_id": str(owner_id),
            "source_file": filename,
            "rows_total": run.rows_total,
            "rows_clean": run.rows_clean,
            "rows_flagged": run.rows_flagged,
            "rows_dropped_duplicates": run.rows_dropped_duplicates,
            "rows_skipped_existing": run.rows_skipped_existing,
        },
    )
    return inserted, run, mapping_is_default
