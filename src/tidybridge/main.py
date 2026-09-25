"""tidybridge API."""

from __future__ import annotations

import csv
import io
import secrets
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy import Date, Float, cast, delete, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from starlette.concurrency import run_in_threadpool

# Registers users/oauth_account on Base.metadata - not used directly here,
# but tests' create_all() (see conftest.py) needs every table module
# imported somewhere in this chain to know about them.
import tidybridge.auth_models  # noqa: F401
from tidybridge.auth import (
    UserCreate,
    UserRead,
    UserUpdate,
    auth_backend,
    current_active_user,
    fastapi_users,
    forgot_password_handler,
    get_github_oauth_client,
    make_github_authorize_redirect,
    oauth_redirect_backend,
)
from tidybridge.auth_models import User
from tidybridge.config import settings
from tidybridge.db import get_db
from tidybridge.ingest import UnreadableFileError, ingest_file, load_schema
from tidybridge.logging_setup import configure_logging
from tidybridge.mapping import validate_resolution
from tidybridge.models import (
    ClientRecord,
    ColumnMapping,
    IngestionRun,
    ProvisioningAttempt,
    ProvisioningJob,
    WebhookDelivery,
    WebhookJob,
)
from tidybridge.provisioning import replay_provisioning
from tidybridge.schemas import (
    BulkDeleteRecordsIn,
    BulkDeleteRecordsOut,
    ClientRecordOut,
    ColumnMappingIn,
    ColumnMappingOut,
    DailySuccessRatePoint,
    DeliverySuccessStats,
    IngestionRunOut,
    IngestionRunsPage,
    IngestResult,
    ProvisioningAttemptOut,
    ProvisioningJobStatusOut,
    RecordsPage,
    WebhookDeliveryOut,
    WebhookJobStatusOut,
)
from tidybridge.webhooks import notify_new_record

# Nothing else in this process configures logging - Python's root logger
# defaults to WARNING with zero handlers attached, so a plain
# logger.info(...) anywhere under the "tidybridge" namespace (auth.py's
# password-reset logging, notably) would be silently discarded at the
# effective-level check before it ever reached output, in both `uvicorn
# --reload` locally and the real Dockerfile CMD on Railway - found by
# actually looking for the logged reset link during manual testing and
# finding nothing, not by inspecting this in isolation. uvicorn's own
# dictConfig (uvicorn.config.LOGGING_CONFIG) only wires up its own
# "uvicorn"/"uvicorn.access" loggers, so this app's own logger needs its
# own explicit level + handler - configure_logging() (logging_setup.py)
# does that, as structured JSON rather than plain text, and is also
# called from scripts/webhook_worker.py's own entrypoint, since that
# process never imports this module.
configure_logging()

# Schema is Alembic-managed now (see alembic/), not created on startup -
# `alembic upgrade head` runs before the app starts (Dockerfile's CMD;
# locally, run it by hand once after pulling schema changes). The previous
# Base.metadata.create_all() on every startup only ever created missing
# tables, never altered existing ones - real bugs found once a column
# needed adding to an already-deployed table (see CHANGELOG).
#
# docs_url/redoc_url/openapi_url are None in production (settings.
# enable_api_docs=False there) - see its own docstring in config.py for
# why: not a security boundary, just no reason to leave the whole API
# schema publicly browsable once this is actually live.
app = FastAPI(
    title="tidybridge",
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url="/redoc" if settings.enable_api_docs else None,
    openapi_url="/openapi.json" if settings.enable_api_docs else None,
)

# Only the configured frontend origin may call this API from a browser -
# not "*", since credentialed requests (the Authorization header the SPA
# sends on every authenticated call) are never allowed with a wildcard
# origin anyway, and there's exactly one legitimate frontend for this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition isn't on the browser's default CORS-safelisted
    # response headers - without exposing it explicitly, the frontend's
    # fetch() for GET /records/export can't read the filename the backend
    # generated (see api/client.ts's exportRecords()), even though the
    # response itself comes through fine either way.
    expose_headers=["Content-Disposition"],
)

# Rate limiting: a generous default across the whole API as a general flood
# safety net, with a much stricter limit specifically on /login and
# /register - the two endpoints a brute-force or credential-stuffing
# attempt would actually hammer. Keyed on the caller's IP; this relies on
# get_remote_address reading the real client IP from what Railway's proxy
# forwards, not uvicorn's own socket peer (see the Dockerfile's
# --proxy-headers) - otherwise every request behind that proxy would share
# one bucket and one abusive caller could rate-limit every legitimate one.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# Defense-in-depth response headers - neither FastAPI/Starlette nor
# anything else in front of this API (Railway passes requests straight
# through, no CDN/reverse-proxy config of its own) add any of these by
# default. Registered last (Starlette's middleware stack runs the
# most-recently-added one outermost), so it still applies to CORS
# preflight responses and SlowAPI's own 429s, not just routes that reach
# a normal handler.
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Harmless to send over plain HTTP too (browsers only ever honor it on
    # an HTTPS response) - Railway terminates TLS in front of this app in
    # production, see the README's Deployment section.
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# Optional, and normally a no-op: staging_gate_password is unset in
# production, so this whole check is skipped there. It exists for the
# staging sandbox environment, which has no platform-level protection of
# its own the way its frontend does (Vercel's own Preview Deployment
# Protection already blocks every path on staging.tidybridge.dev without
# a Vercel login - see README's Deployment section) - without this,
# anyone who found the staging API's URL directly could call it. Not
# real HTTP Basic Auth: this API already uses the Authorization header
# for actual login sessions (Authorization: Bearer <token>), so a second
# credential scheme on that same header would collide with it - a
# separate custom header sidesteps that entirely. Registered last (see
# add_security_headers above for why that makes it outermost), so an
# unauthorized caller is rejected before CORS or rate-limiting ever run.
#
# /auth/github/authorize and /auth/github/callback are exempt: both are
# reached by a top-level browser navigation, never a fetch() the
# frontend's request() helper could attach this header to - authorize
# is where the app redirects the whole page (see githubAuthorizeUrl's
# docstring, on the CSRF cookie needing a first-party navigation),
# callback is where GitHub itself redirects the browser back, and
# GitHub has no way to know about this header at all. Gating them was
# never enforceable, only broke GitHub login on staging. The narrow
# gap this opens - someone could reach these two routes without the
# password and complete a GitHub login/registration - still leaves
# them locked out of every other route without it, since those are all
# fetch()'d with the header attached by the properly configured
# frontend build.
_STAGING_GATE_EXEMPT_PATHS = {"/auth/github/authorize", "/auth/github/callback"}


@app.middleware("http")
async def require_staging_gate_password(request: Request, call_next):
    if (
        settings.staging_gate_password is None
        or request.method == "OPTIONS"
        # CORS preflight never carries custom headers - rejecting it here
        # would break every real request before the browser even sends it.
        or request.url.path in _STAGING_GATE_EXEMPT_PATHS
    ):
        return await call_next(request)
    supplied = request.headers.get("x-staging-password", "")
    if not secrets.compare_digest(supplied, settings.staging_gate_password):
        return JSONResponse(status_code=401, content={"detail": "Staging access required"})
    return await call_next(request)


_STRICT_AUTH_LIMIT = "5/minute"

_jwt_router = fastapi_users.get_auth_router(auth_backend)
for _route in _jwt_router.routes:
    if _route.path == "/login":
        _route.endpoint = limiter.limit(_STRICT_AUTH_LIMIT)(_route.endpoint)
app.include_router(_jwt_router, prefix="/auth/jwt", tags=["auth"])

_register_router = fastapi_users.get_register_router(UserRead, UserCreate)
for _route in _register_router.routes:
    if _route.path == "/register":
        _route.endpoint = limiter.limit(_STRICT_AUTH_LIMIT)(_route.endpoint)
app.include_router(_register_router, prefix="/auth", tags=["auth"])

# Both routes get the strict limit: /forgot-password because it's the
# enumeration/spam-mail surface (an attacker hammering it either floods a
# victim's inbox or - if the response ever timed differently - could probe
# which emails are registered), /reset-password because it's a brute-force
# surface against the token itself, same threat model as /login above.
_reset_router = fastapi_users.get_reset_password_router()
for _route in _reset_router.routes:
    if _route.path == "/forgot-password":
        # Swapped for forgot_password_handler (auth.py) the same way
        # /authorize is swapped onto the GitHub router below - the
        # library's own endpoint can't tell the frontend a GitHub-only
        # account was refused a reset token (see UserManager.
        # forgot_password()'s docstring for why it's refused at all).
        # The route's own decorator-configured status_code (202) still
        # applies - only the endpoint function underneath is replaced.
        _route.endpoint = limiter.limit(_STRICT_AUTH_LIMIT)(forgot_password_handler)
    elif _route.path == "/reset-password":
        _route.endpoint = limiter.limit(_STRICT_AUTH_LIMIT)(_route.endpoint)
app.include_router(_reset_router, prefix="/auth", tags=["auth"])

# Registered *before* the generic users router below, and matched on the
# literal path "/users/me" - fastapi-users' own router already has a
# DELETE /users/{id}, but it's superuser-only (an admin deleting some
# other account by id), not a self-service route for a caller to delete
# their own. Registration order matters here: FastAPI/Starlette matches
# routes in the order they were added, so this literal "/me" path must
# be registered first or a parameterized "/{id}" route from the router
# below would shadow it and try (and fail) to parse "me" as a user id -
# the exact class of routing-shadow bug this project has hit before with
# PATCH /users/me (see CHANGELOG/README's Bugs section).
@app.delete("/users/me", status_code=204)
def delete_own_account(
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    """Permanently erase the caller's own account and everything tied to
    it - every client record, ingestion run, and (via client_records'
    own further cascade) webhook delivery they own, plus any linked
    GitHub OAuth account and access token. Real deletion via ON DELETE
    CASCADE at the database level (migration e986a7123298, extended by
    the accesstoken table's own FK), the same principle DELETE /records/
    {id} already uses - not a soft-delete flag some other query could
    still surface. The cascade takes the caller's own session token out
    with it, so the bearer token they authenticated with is immediately
    invalid too, not just self-invalidating on next lookup.
    """
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["users"]
)

_github_oauth_client = get_github_oauth_client()
if _github_oauth_client is not None:
    _github_router = fastapi_users.get_oauth_router(
        _github_oauth_client,
        # oauth_redirect_backend, not auth_backend: the callback ends
        # with a 302 to the frontend carrying the JWT in the URL
        # fragment (see auth.py's RedirectTransport), instead of a bare
        # JSON body on the API's own origin - regular email+password
        # login is untouched, still bearer_transport/auth_backend.
        oauth_redirect_backend,
        settings.jwt_secret,
        # A user who registered with email+password and later signs in
        # with GitHub using the same email gets linked to that same
        # account instead of silently creating a second one.
        associate_by_email=True,
    )
    # /authorize's own default response is JSON (meant to be fetch()'d by
    # a SPA), which breaks the CSRF cookie it sets under third-party-
    # cookie-blocking browsers when the SPA is on a different origin -
    # see github_authorize_redirect's docstring. Swapped the same way
    # rate limiting is swapped onto /login and /register above: mutating
    # the sub-router's route before include_router() re-derives the final
    # route (dependant included) from the mutated endpoint.
    for _route in _github_router.routes:
        if _route.path == "/authorize":
            _route.endpoint = make_github_authorize_redirect(_github_oauth_client)
    app.include_router(_github_router, prefix="/auth/github", tags=["auth"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


_MAX_UPLOAD_BYTES = settings.max_upload_size_mb * 1024 * 1024
_UPLOAD_CHUNK_BYTES = 1024 * 1024


async def _read_upload_within_limit(file: UploadFile) -> bytes:
    """Reads in bounded chunks and aborts as soon as the limit is crossed,
    rather than trusting the Content-Length header (a client can send
    whatever it wants there) or reading the whole body before checking."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_UPLOAD_CHUNK_BYTES):
        total += len(chunk)
        if total > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/records/upload", response_model=IngestResult)
# Stricter than the API-wide 60/minute default: this route does CSV
# parsing plus one DB round-trip per row, so it's the one endpoint where
# a burst of requests (accidental retry loop, or deliberate abuse) turns
# into real CPU/DB load rather than a handful of cheap SELECTs. 20/minute
# still comfortably covers a person re-uploading a corrected file a few
# times in a row.
@limiter.limit("20/minute")
async def upload_records(
    request: Request,
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> IngestResult:
    content = await _read_upload_within_limit(file)
    schema = load_schema()
    # ingest_file does CPU-bound CSV parsing and several synchronous DB
    # round-trips (schema mapping/validation via tidycsv, one INSERT per
    # row) - no longer a blocking httpx.post to the webhook receiver too,
    # since the automatic post-ingest notification is now enqueue_delivery()
    # (a fast DB insert, see webhooks.py/webhook_worker.py) instead of a
    # direct notify_new_record() call, but the CSV/DB work alone still
    # justifies offloading. This route is `async def` (needed for `await
    # file.read()` above), and FastAPI only auto-offloads *sync* `def`
    # routes to a worker thread - a sync call made directly inside an
    # async route runs straight on the single event loop thread instead,
    # stalling every other in-flight request for as long as it takes.
    # run_in_threadpool moves it off the loop, the same mechanism FastAPI
    # itself uses for sync routes. Found via a deliberate scalability/
    # performance review, not a user report.
    try:
        outcome = await run_in_threadpool(
            ingest_file, db, file.filename or "upload.csv", content, schema, user.id
        )
    except UnreadableFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run = outcome.run
    return IngestResult(
        ingestion_run_id=run.id,
        rows_total=run.rows_total,
        rows_clean=run.rows_clean,
        rows_flagged=run.rows_flagged,
        rows_dropped_duplicates=run.rows_dropped_duplicates,
        rows_skipped_existing=run.rows_skipped_existing,
        mapping_is_default=outcome.mapping_is_default,
        fingerprint=outcome.fingerprint,
        field_resolutions=outcome.field_resolutions,
        dedup_key_fields=outcome.dedup_key_fields,
        records=[ClientRecordOut.model_validate(r) for r in outcome.records],
        sample_values=outcome.sample_values,
    )


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

    target_run_id = body.apply_to_run_id
    if not target_run_id and body.old_resolutions:
        latest_run = db.execute(
            select(IngestionRun)
            .where(IngestionRun.owner_id == user.id)
            .order_by(IngestionRun.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if latest_run is not None:
            target_run_id = latest_run.id

    if target_run_id and body.old_resolutions:
        old_by_raw = {e.raw_column: e.target_field for e in body.old_resolutions}
        new_by_raw = {e.raw_column: e.target_field for e in body.field_resolutions}
        rename_map: dict[str, str] = {}
        drop_fields: set[str] = set()
        for raw_col, new_target in new_by_raw.items():
            old_target = old_by_raw.get(raw_col)
            if old_target and old_target != new_target:
                if new_target is None:
                    drop_fields.add(old_target)
                else:
                    rename_map[old_target] = new_target

        if rename_map or drop_fields:
            run_records = db.execute(
                select(ClientRecord).where(
                    ClientRecord.ingestion_run_id == target_run_id,
                    ClientRecord.owner_id == user.id,
                )
            ).scalars().all()
            for rec in run_records:
                updated_fields = dict(rec.fields)
                for old_k, new_k in rename_map.items():
                    if old_k in updated_fields:
                        updated_fields[new_k] = updated_fields.pop(old_k)
                for drop_k in drop_fields:
                    updated_fields.pop(drop_k, None)
                rec.fields = updated_fields
                flag_modified(rec, "fields")

    db.commit()
    return ColumnMappingOut(field_resolutions=resolution, dedup_key_fields=body.dedup_key_fields)


@app.get("/ingestion-runs", response_model=IngestionRunsPage)
def list_ingestion_runs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> IngestionRunsPage:
    base_query = select(IngestionRun).where(IngestionRun.owner_id == user.id)
    total = db.execute(select(func.count()).select_from(base_query.subquery())).scalar_one()

    page_query = base_query.order_by(IngestionRun.created_at.desc()).limit(limit).offset(offset)
    runs = db.execute(page_query).scalars().all()

    return IngestionRunsPage(
        items=[IngestionRunOut.model_validate(r) for r in runs],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/ingestion-runs/{run_id}", response_model=IngestionRunOut)
def get_ingestion_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> IngestionRun:
    run = db.get(IngestionRun, run_id)
    if run is None or run.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Ingestion run not found")
    return run


@app.get("/records", response_model=RecordsPage)
def list_records(
    has_issues: bool | None = None,
    # Lets a caller go from "this run had 3 flagged rows" (an
    # IngestionRun) to "show me exactly those rows" - no separate
    # ownership check needed here beyond the owner_id filter already
    # below: passing another engineer's run_id just matches zero of
    # *this* caller's records, never leaks anyone else's.
    ingestion_run_id: uuid.UUID | None = None,
    # 500 is a hard ceiling regardless of what a caller asks for, not just
    # a default - previously this endpoint had no limit at all, so a
    # client with (say) 50,000 records made one query and one response
    # body pull every row in at once. 100 is the default page size for a
    # caller that doesn't ask for a specific one.
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecordsPage:
    base_query = select(ClientRecord).where(ClientRecord.owner_id == user.id)
    if has_issues is not None:
        base_query = base_query.where(ClientRecord.has_issues == has_issues)
    if ingestion_run_id is not None:
        base_query = base_query.where(ClientRecord.ingestion_run_id == ingestion_run_id)

    # Counted against the same filtered base_query (not a second,
    # separately-filtered one) so total always matches what has_issues
    # actually scoped the page to, not the caller's total record count.
    total = db.execute(select(func.count()).select_from(base_query.subquery())).scalar_one()

    page_query = base_query.order_by(ClientRecord.created_at.desc()).limit(limit).offset(offset)
    records = db.execute(page_query).scalars().all()

    return RecordsPage(
        items=[ClientRecordOut.model_validate(r) for r in records],
        total=total,
        limit=limit,
        offset=offset,
    )


_STATS_CHANNEL_MODELS: dict[str, type[WebhookDelivery] | type[ProvisioningAttempt]] = {
    "webhook": WebhookDelivery,
    "provisioning": ProvisioningAttempt,
}
_MAX_STATS_RANGE_DAYS = 366


@app.get("/stats/delivery-success", response_model=DeliverySuccessStats)
def get_delivery_success_stats(
    channel: Literal["webhook", "provisioning"],
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DeliverySuccessStats:
    date_to = date_to or datetime.now(UTC).date()
    date_from = date_from or (date_to - timedelta(days=29))
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to")
    if (date_to - date_from).days > _MAX_STATS_RANGE_DAYS:
        raise HTTPException(
            status_code=400, detail=f"Range too wide - max {_MAX_STATS_RANGE_DAYS} days"
        )

    model = _STATS_CHANNEL_MODELS[channel]
    range_start = datetime.combine(date_from, time.min, tzinfo=UTC)
    range_end = datetime.combine(date_to, time.max, tzinfo=UTC)

    # Neither WebhookDelivery nor ProvisioningAttempt carries owner_id -
    # only client_records does - so scoping this caller's stats to their
    # own records needs an actual join, not just a WHERE.
    daily = (
        select(
            cast(model.attempted_at, Date).label("day"),
            func.count().label("attempts"),
            func.count().filter(model.success).label("successes"),
        )
        .join(ClientRecord, ClientRecord.id == model.record_id)
        .where(ClientRecord.owner_id == user.id)
        .where(model.attempted_at.between(range_start, range_end))
        .group_by(cast(model.attempted_at, Date))
        .cte("daily")
    )
    rated = select(
        daily.c.day,
        daily.c.attempts,
        daily.c.successes,
        (cast(daily.c.successes, Float) / daily.c.attempts).label("success_rate"),
    ).cte("rated")
    # The window function: each day's rate averaged with up to 6 preceding
    # days that actually had attempts - smooths the noise a single quiet
    # day (one attempt, 0% or 100%) would otherwise put on a chart.
    query = select(
        rated.c.day,
        rated.c.attempts,
        rated.c.successes,
        rated.c.success_rate,
        func.avg(rated.c.success_rate)
        .over(order_by=rated.c.day, rows=(-6, 0))
        .label("rolling_7d_rate"),
    ).order_by(rated.c.day)

    points = [
        DailySuccessRatePoint(
            day=row.day,
            attempts=row.attempts,
            successes=row.successes,
            success_rate=row.success_rate,
            rolling_7d_rate=row.rolling_7d_rate,
        )
        for row in db.execute(query).all()
    ]
    return DeliverySuccessStats(
        channel=channel, date_from=date_from, date_to=date_to, points=points
    )


def _format_issues(issues: list[dict] | None) -> str:
    """One readable line per validation issue - "field: issue; field:
    issue" - rather than the raw JSON GET /records/{id} returns, since
    this is meant to be opened directly in a spreadsheet."""
    if not issues:
        return ""
    return "; ".join(f"{issue['field']}: {issue['issue']}" for issue in issues)


# Registered before GET /records/{record_id} - the literal "export" path
# would otherwise be shadowed by {record_id} trying (and failing) to
# parse it as a UUID, the exact class of routing-shadow bug this project
# has hit before (see README's Bugs section, and DELETE /users/me above).
@app.get("/records/export")
def export_records(
    ingestion_run_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """A CSV download of every one of the caller's own records matching
    the filter - not the paginated JSON GET /records returns, since the
    whole point of exporting is getting everything out in one file, not
    a page at a time. Same ownership/filter semantics as GET /records
    (see its own comments) - just unpaginated and shaped as CSV instead
    of JSON."""
    base_query = select(ClientRecord).where(ClientRecord.owner_id == user.id)
    if ingestion_run_id is not None:
        base_query = base_query.where(ClientRecord.ingestion_run_id == ingestion_run_id)
    records = db.execute(base_query.order_by(ClientRecord.created_at.desc())).scalars().all()

    # Webhook status lives on WebhookJob (one row per record needing a
    # notification), not on ClientRecord itself - see get_record_webhook_status
    # above for the same not_configured/status/attempt_number/available_at
    # shape, one record at a time. Fetched here as a single bulk query keyed
    # by record_id rather than one query per record in the loop below.
    jobs_by_record_id = {
        job.record_id: job
        for job in db.execute(
            select(WebhookJob).where(WebhookJob.record_id.in_([r.id for r in records]))
        ).scalars()
    }

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "full_name",
            "email",
            "signup_date",
            "amount",
            "phone",
            "has_issues",
            "issues",
            "webhook_status",
            "webhook_attempt_number",
            "webhook_available_at",
        ]
    )
    for record in records:
        job = jobs_by_record_id.get(record.id)
        writer.writerow(
            [
                record.full_name,
                record.email,
                record.signup_date,
                record.amount,
                record.phone,
                record.has_issues,
                _format_issues(record.issues),
                job.status if job else "not_configured",
                job.attempt_number if job else None,
                job.available_at if job else None,
            ]
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    filename = f"tidybridge-records-{timestamp}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_owned_record(db: Session, record_id: uuid.UUID, user: User) -> ClientRecord:
    """404, not 403, when the record belongs to someone else - existence of
    another engineer's client record shouldn't be observable at all."""
    record = db.get(ClientRecord, record_id)
    if record is None or record.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@app.get("/records/{record_id}", response_model=ClientRecordOut)
def get_record(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ClientRecord:
    return _get_owned_record(db, record_id, user)


@app.get("/records/{record_id}/webhooks", response_model=list[WebhookDeliveryOut])
def get_record_webhooks(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list:
    _get_owned_record(db, record_id, user)
    # Ordered explicitly - now that a single delivery can produce several
    # rows (one per retry attempt, see webhooks.py), an unordered query
    # no longer reliably reads as "the retry history in order it
    # happened" the way a single-row-per-delivery result always did.
    query = (
        select(WebhookDelivery)
        .where(WebhookDelivery.record_id == record_id)
        .order_by(WebhookDelivery.attempted_at, WebhookDelivery.id)
    )
    return db.execute(query).scalars().all()


@app.get("/records/{record_id}/webhook-status", response_model=WebhookJobStatusOut)
def get_record_webhook_status(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> WebhookJobStatusOut:
    """The automatic post-ingest delivery pipeline's current state for one
    record - see WebhookJobStatusOut's docstring for what each status
    means."""
    _get_owned_record(db, record_id, user)
    job_query = select(WebhookJob).where(WebhookJob.record_id == record_id)
    job = db.execute(job_query).scalar_one_or_none()
    if job is None:
        return WebhookJobStatusOut(status="not_configured", attempt_number=None, available_at=None)
    return WebhookJobStatusOut(
        status=job.status, attempt_number=job.attempt_number, available_at=job.available_at
    )


@app.post("/records/{record_id}/webhooks/replay", response_model=WebhookDeliveryOut)
def replay_webhook(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> WebhookDelivery:
    """Manually re-sends the notification for one record, on demand - a
    real, separate action from the automatic retries in webhooks.py, not
    another one of them. This is what a human actually does mid-incident:
    a client says "our endpoint was down, we just fixed it, please resend
    the last few" - waiting for an automatic retry schedule that already
    exhausted itself doesn't help at that point.

    Replays the record's *current* payload, not a stored historical one -
    webhooks.py never persisted the literal bytes of a past attempt, only
    its outcome (status_code/success/error), so there is no historical
    payload to resend verbatim. In practice this is the same payload
    every time regardless: nothing in this API ever mutates a
    ClientRecord's fields after ingest, only deletes it outright, so
    "current" and "at first delivery" are the same data.

    Goes through the exact same signing/retry path as the original
    delivery (same settings.webhook_max_attempts, same backoff) - a
    replay that hits another transient failure retries the same way an
    original delivery would, rather than failing after one try.
    """
    record = _get_owned_record(db, record_id, user)
    delivery = notify_new_record(db, record)
    if delivery is None:
        raise HTTPException(status_code=400, detail="No webhook URL is configured")
    return delivery


@app.get("/records/{record_id}/provisioning-status", response_model=ProvisioningJobStatusOut)
def get_record_provisioning_status(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProvisioningJobStatusOut:
    """The automatic post-ingest provisioning pipeline's current state
    for one record - same shape/purpose as get_record_webhook_status
    above."""
    _get_owned_record(db, record_id, user)
    job = db.execute(
        select(ProvisioningJob).where(ProvisioningJob.record_id == record_id)
    ).scalar_one_or_none()
    if job is None:
        return ProvisioningJobStatusOut(
            status="not_configured", attempt_number=None, available_at=None, remote_id=None
        )
    return ProvisioningJobStatusOut(
        status=job.status,
        attempt_number=job.attempt_number,
        available_at=job.available_at,
        remote_id=job.remote_id,
    )


@app.get("/records/{record_id}/provisioning", response_model=list[ProvisioningAttemptOut])
def get_record_provisioning(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list:
    _get_owned_record(db, record_id, user)
    query = (
        select(ProvisioningAttempt)
        .where(ProvisioningAttempt.record_id == record_id)
        .order_by(ProvisioningAttempt.attempted_at, ProvisioningAttempt.id)
    )
    return db.execute(query).scalars().all()


@app.post("/records/{record_id}/provisioning/replay", response_model=ProvisioningJobStatusOut)
def replay_provisioning_endpoint(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ProvisioningJobStatusOut:
    """Manually re-enqueues provisioning for one record, on demand - see
    replay_provisioning()'s docstring in provisioning.py for how this
    differs from replay_webhook above."""
    record = _get_owned_record(db, record_id, user)
    if not settings.provisioning_url:
        raise HTTPException(status_code=400, detail="No provisioning URL is configured")
    job = replay_provisioning(db, record)
    return ProvisioningJobStatusOut(
        status=job.status,
        attempt_number=job.attempt_number,
        available_at=job.available_at,
        remote_id=job.remote_id,
    )


@app.post("/records/bulk-delete", response_model=BulkDeleteRecordsOut)
def bulk_delete_records(
    body: BulkDeleteRecordsIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> BulkDeleteRecordsOut:
    """Same real-deletion semantics as delete_record below, just for a
    whole selection in one request/transaction instead of one round-trip
    per row - the "select all" checkbox on the records table could
    otherwise mean dozens of individual DELETE calls landing inside the
    same rate-limit window. POST, not DELETE-with-a-body: some HTTP
    clients/proxies drop a body on DELETE, and this is already not
    idempotent in the way DELETE implies (a second identical call
    deletes nothing more, which is fine, but the id list itself isn't a
    resource being removed)."""
    if not body.record_ids:
        return BulkDeleteRecordsOut(deleted_count=0)
    result = db.execute(
        delete(ClientRecord).where(
            ClientRecord.owner_id == user.id,
            ClientRecord.id.in_(body.record_ids),
        )
    )
    db.commit()
    return BulkDeleteRecordsOut(deleted_count=result.rowcount)


@app.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    """Real deletion, not a soft-delete flag - the GDPR right-to-erasure
    case this exists for means the data actually has to stop existing, not
    just stop being shown. The FK's ON DELETE CASCADE (see models.py) takes
    the record's webhook_deliveries audit trail with it - keeping delivery
    logs that still carry the erased record's id around would defeat the
    point."""
    record = _get_owned_record(db, record_id, user)
    db.delete(record)
    db.commit()
