#!/usr/bin/env python3
"""Invite someone to tidybridge - the only way an account is created.

Creates the account (if new) and emails a 7-day link where the invitee
sets their password (auth.py's UserManager.invite). Run it again to send
a fresh link to a pending invite.

Run against production: railway run python scripts/invite.py ana@example.com
"""

from __future__ import annotations

import asyncio
import sys

from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.exceptions import UserAlreadyVerified

from tidybridge.auth import UserManager
from tidybridge.auth_db import AsyncSessionLocal
from tidybridge.auth_models import OAuthAccount, User


async def invite(email: str) -> None:
    async with AsyncSessionLocal() as session:
        await UserManager(SQLAlchemyUserDatabase(session, User, OAuthAccount)).invite(email)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/invite.py <email>")
    try:
        asyncio.run(invite(sys.argv[1]))
    except UserAlreadyVerified:
        sys.exit(f"{sys.argv[1]} already accepted an invitation - they can sign in.")
    print(f"Invitation sent to {sys.argv[1]}")
