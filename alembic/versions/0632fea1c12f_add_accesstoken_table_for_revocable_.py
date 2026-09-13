"""add accesstoken table for revocable sessions

Revision ID: 0632fea1c12f
Revises: bef5b3fffd6e
Create Date: 2026-09-13 19:38:08.862372

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from fastapi_users_db_sqlalchemy.generics import GUID, TIMESTAMPAware


revision: str = "0632fea1c12f"
down_revision: Union[str, Sequence[str], None] = "bef5b3fffd6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    One row per issued login session (auth.py's DatabaseStrategy),
    replacing the old stateless JWT - lets POST /auth/jwt/logout actually
    revoke a session instead of being a no-op. ondelete="cascade" on
    user_id: deleting a user (DELETE /users/me) must take their sessions
    with it, the same principle every other FK in this project follows.
    """
    op.create_table(
        "accesstoken",
        sa.Column("token", sa.String(length=43), primary_key=True),
        sa.Column("created_at", TIMESTAMPAware(timezone=True), nullable=False),
        sa.Column(
            "user_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="cascade"),
            nullable=False,
        ),
    )
    # Matches DatabaseStrategy.read_token's query (WHERE created_at >=
    # <lifetime cutoff>), evaluated on every authenticated request.
    op.create_index(
        op.f("ix_accesstoken_created_at"), "accesstoken", ["created_at"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_accesstoken_created_at"), table_name="accesstoken")
    op.drop_table("accesstoken")
