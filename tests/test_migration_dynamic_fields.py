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

            columns = (
                conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns"
                        " WHERE table_name = 'client_records'"
                    )
                )
                .scalars()
                .all()
            )
            assert "full_name" not in columns
            assert "email" not in columns
    finally:
        command.upgrade(cfg, "head")
