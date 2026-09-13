"""Structured (JSON) logging, shared by the FastAPI app (main.py) and the
standalone worker process (scripts/webhook_worker.py) - the worker runs
as its own long-lived process and never imports main.py, so it needs its
own call to configure_logging() to get the same JSON output Railway's log
stream sees from the web process.

Every log line is one JSON object: level/logger/event (the log message
text) plus whatever fields the call site passed via `extra={...}` - e.g.
logger.info("webhook.attempt", extra={"correlation_id": ..., ...}). That
correlation_id is IngestionRun.id (see ingest.py) - already the thing
every record from one upload points back to - not a separately invented
field, and it's what lets one log line for a webhook/provisioning
attempt (made later, in the worker's own process) be traced back to the
upload that caused it."""

from __future__ import annotations

import json
import logging

# Every attribute a bare LogRecord already carries - anything else on
# record.__dict__ is a field the call site passed via extra={...}.
_STANDARD_RECORD_FIELDS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", (), None)))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        payload.update(
            (key, value)
            for key, value in record.__dict__.items()
            if key not in _STANDARD_RECORD_FIELDS
        )
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> logging.Logger:
    """Idempotent - safe to call from both main.py (import time) and the
    worker script's main(), and safe to call more than once (pytest
    re-imports/re-runs this across a whole test session)."""
    logger = logging.getLogger("tidybridge")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger
