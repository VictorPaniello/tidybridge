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
