#!/usr/bin/env python3
"""Entrypoint for the background webhook-delivery worker - see
tidybridge.webhook_worker for the actual logic. Unlike scripts/
backup_db.py and scripts/retention_sweep.py (one-shot jobs run on a Cron
Schedule), this runs continuously: deploy it as its own long-lived
Railway service (a Start Command, not a Cron Schedule), restarted by
Railway itself if it ever crashes.

Run manually: python scripts/webhook_worker.py
"""

from __future__ import annotations

import sys
import time

from tidybridge.db import SessionLocal
from tidybridge.logging_setup import configure_logging
from tidybridge.webhook_worker import process_due_jobs, process_due_provisioning_jobs

POLL_INTERVAL_SECONDS = 2.0


def main() -> None:
    # Python fully buffers stdout by default whenever it isn't a TTY -
    # true for every real deployment of this long-running process (a
    # Docker container's stdout, Railway's log collector), so unbuffered
    # output would otherwise sit in that buffer and never reach the
    # platform's logs at all, not just late - confirmed live on Railway:
    # the container showed Active with zero log lines. Reconfiguring here
    # fixes it at the source, for any way this script ends up invoked,
    # rather than relying on every future deploy remembering `python -u`
    # or setting PYTHONUNBUFFERED=1 by hand. logging.StreamHandler writes
    # through this same stdout, so it needs the same fix.
    sys.stdout.reconfigure(line_buffering=True)
    logger = configure_logging()

    logger.info("worker.started", extra={"poll_interval_seconds": POLL_INTERVAL_SECONDS})
    while True:
        db = SessionLocal()
        try:
            processed = process_due_jobs(db) + process_due_provisioning_jobs(db)
            if processed:
                logger.info("worker.batch_processed", extra={"jobs_processed": processed})
        finally:
            db.close()
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
