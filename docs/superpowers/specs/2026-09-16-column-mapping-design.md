# Arbitrary-schema ingestion (column mapping): design

## Problem

tidybridge cleans CSV/Excel uploads against one fixed schema
(`examples/schema.yaml`): `full_name`, `email`, `signup_date`, `amount`,
`phone`. `map_columns` (tidycsv) recognizes a column only if its header
matches one of that field's known aliases - anything else is silently
dropped, and a *required* field with no matching column crashes ingest with
an unhandled `KeyError` deep inside the per-row loop (`ingest.py`), surfaced
to the caller as a bare 500 (the still-paused `fix/upload-missing-required-column`
bugfix branch, root-caused but not yet built).

The real problem underneath that bug is bigger than a missing validation
check: different client companies export completely differently-shaped
data, and an engineer using tidybridge today can only ever upload the five
fields the schema happens to define. Real FDE work means handling whatever
shape a client's export tool produces, not enforcing one fixed contract on
every source. This spec makes ingestion schema-agnostic: any CSV/Excel file
can be uploaded, its columns mapped (once, and remembered) to what
tidybridge understands, and anything that doesn't fit the five canonical
fields is kept, not dropped.

## Explicit scope decisions

Confirmed during brainstorming, in order:

1. **Supersedes, not complements, the paused bugfix branch.** With mapping
   in place, a required field with no source column is caught at the
   mapping-submission step (a normal 400 back to the UI), not deep inside
   `ingest.py` as a `KeyError`. Recommend closing
   `fix/upload-missing-required-column` rather than also merging it -
   building both would mean two different mechanisms catching the same
   condition.
2. **A narrower "schema drift detection" idea (alert-only, schema stays
   fixed) was considered and rejected** in favor of this bigger capability -
   an alert on top of a fixed schema doesn't change what actually happens
   to a client's data, which is the actual thing the user needs.
3. **Combine semantics: concatenate with a single space.** No separator/
   order configuration - matches the original first_name + last_name →
   full_name motivating example, and keeps the mapping screen simple.
4. **Fingerprint matching is normalized: trimmed + lowercased, order-
   insensitive.** Two uploads from the same client's export tool where a
   header casing or a stray trailing space differs still count as the same
   shape - only an actual change to the column set re-prompts.
5. **Full-stack scope.** This spec covers both the API and the
   mapping-screen UI, not backend-only - the point is an engineer can
   actually see and act on an unmapped shape, not just receive a JSON
   response.
6. **The uploaded file is stored server-side, temporarily, across the
   pause.** One file selection - the engineer uploads once, resolves the
   mapping, and the paused upload resumes - rather than re-uploading the
   same file a second time after mapping it.
7. **tidycsv itself is never modified.** A new step runs *before*
   `map_columns()`, producing a dataframe tidycsv already recognizes
   (exactly the five canonical field names, nothing else). All of
   tidycsv's own coercion/validation/dedup logic keeps working unchanged.

## Data model

### `column_mappings`
One row per (owner, header shape) the owner has already resolved - looked
up on every upload before deciding whether a prompt is needed.

| column | type | notes |
|---|---|---|
| `id` | UUID | |
| `owner_id` | UUID FK → `users`, `ondelete=cascade` | |
| `header_fingerprint` | string | sha256 of the sorted, trimmed+lowercased raw column names, joined by a delimiter |
| `mapping` | JSON | list of `{raw_column, action, target_field?}` - see "The mapping shape" below |
| `created_at` | datetime | |

Unique on `(owner_id, header_fingerprint)`.

### `pending_uploads`
One row per upload paused on an unseen shape, short-lived by design.

| column | type | notes |
|---|---|---|
| `id` | UUID | used as `pending_upload_id`, and as the server-generated temp filename - never derived from the client's own filename |
| `owner_id` | UUID FK → `users`, `ondelete=cascade` | |
| `filename` | string | the client's original filename, stored only as a display string - never used to build a filesystem path |
| `storage_path` | string | server-generated path under a fixed temp directory |
| `raw_headers` | JSON | list of the file's raw column headers, in file order |
| `sample_rows` | JSON | first few rows, raw string values, for the mapping screen to show alongside each header |
| `created_at` | datetime | |

Swept by a new script, `scripts/sweep_pending_uploads.py` - same
Railway Cron Schedule pattern as `scripts/retention_sweep.py` (a separate
script, not an addition to it: retention concerns a *client's* data
lifecycle, this concerns leftover temp state from an interrupted upload
flow, an unrelated axis). Rows (and their temp files) older than 1 hour are
deleted - generous for a human to finish a mapping screen, short enough
that abandoned uploads can't accumulate.

### `ClientRecord.extra_fields`
New nullable JSON column: a `{raw_column: value}` dict of whatever the
engineer marked "extra data" for that row. `null`/absent when nothing was
marked extra (every upload against an already-known mapping with no extras
leaves this exactly as it is today).

### The mapping shape
`column_mappings.mapping` and the mapping-submission request body share one
shape - a list with one entry per raw column:

```json
[
  {"raw_column": "First Name", "action": "combine", "target_field": "full_name"},
  {"raw_column": "Last Name",  "action": "combine", "target_field": "full_name"},
  {"raw_column": "E-mail",     "action": "map",     "target_field": "email"},
  {"raw_column": "Age",        "action": "extra"},
  {"raw_column": "Internal ID","action": "ignore"}
]
```

`action` is one of `map` (rename this one column onto `target_field`),
`combine` (this column is one of possibly several joined with a single
space into `target_field` - order within the group follows the raw file's
own column order), `extra` (kept per-row in `extra_fields`, not part of the
schema), or `ignore` (dropped entirely). Every schema field marked
`required` in `schema.yaml` must be covered by at least one `map`/`combine`
entry, or the submission is rejected (see "Upload/mapping flow").

## Upload/mapping flow

**`POST /records/upload`** (existing endpoint, same file input) - response
becomes a discriminated body instead of always `IngestResult`:

1. Parse the raw file's headers (before any schema-aware work).
2. Compute the normalized fingerprint, look up `column_mappings` for
   `(owner_id, fingerprint)`.
3. **Known shape:** apply the saved mapping (see "Applying a mapping"
   below), run the existing ingest path unchanged, return
   `{"status": "completed", ...IngestResult}` - identical behavior to
   today from the caller's point of view.
4. **Unseen shape:** validate the file's extension against an allow-list
   (`.csv`, `.xlsx`, `.xls`) - reject anything else with 400 before
   persisting. Otherwise, store the file (server-generated path), insert a
   `pending_uploads` row, and return
   `{"status": "mapping_required", "pending_upload_id", "headers", "sample_rows"}`.
   Still a `200` - this is an expected branch, not an error.

**`GET /records/upload/{pending_upload_id}`** - re-fetches `headers`/
`sample_rows` for a `pending_uploads` row owned by the caller (404 if it
doesn't exist or belongs to someone else). Covers a page refresh mid-mapping
without losing the paused upload.

**`POST /records/upload/{pending_upload_id}/mapping`** - body is the
mapping shape above.

1. Look up the `pending_uploads` row, scoped to `owner_id == current_user.id`
   (404 otherwise).
2. Validate every required schema field is covered - 400, nothing persisted,
   if not.
3. Upsert the `column_mappings` row for `(owner_id, fingerprint)` - so the
   *next* upload of this shape skips straight to step 3 of the upload flow.
4. Apply the mapping to the stored file, run the existing ingest path,
   delete the `pending_uploads` row and its temp file.
5. Return the same `IngestResult` shape a normal completed upload returns.

If step 4's parse fails (corrupt content, once mapped), the failure is
handled the same way `ingest_file` already handles a parse failure today -
logged, propagated as an error response - and the `pending_uploads` row and
temp file are still cleaned up, not left orphaned.

**Applying a mapping** (`ingest.py`, new `apply_mapping()`, called before
`map_columns()`): renames `map`ped columns onto their target field name,
builds each `combine` target field by joining its source columns with a
single space (in file column order), collects `extra` columns into a
per-row dict carried alongside the dataframe, and drops `ignore`d columns.
Output: a dataframe with exactly the schema's field names as columns, plus
a row-aligned `extra_fields` dict - exactly what `map_columns()` already
expects, so nothing downstream of it changes. `ingest_file()` takes the
optional `extra_fields` alongside and sets it on each `ClientRecord` it
creates.

## Security

New attack surface, specifically from the file now living across two
requests instead of being deleted within one:

- **No filename-derived paths.** `storage_path` is server-generated
  (keyed by `pending_uploads.id`), never built from the client's `filename`
  - closes path traversal outright.
- **Extension allow-list, not a silent default.** Today's
  `Path(filename).suffix or ".csv"` (`ingest.py`) defaults to CSV for any
  unrecognized or missing extension - fine when the temp file is deleted
  within the same request, riskier once it can linger for up to an hour.
  This adds an explicit `{.csv, .xlsx, .xls}` check at upload time.
- **Ownership check on every pending-upload operation.** Both new endpoints
  filter by `owner_id == current_user.id`, 404 (not 403) on a mismatch -
  same pattern already used for every other owned resource in this
  codebase.
- **Bounded disk usage.** The 1-hour sweep plus a cap on how many
  *unresolved* `pending_uploads` one owner can have at once - otherwise the
  existing per-upload size cap (`max_upload_size_mb`) and rate limit
  (20/minute) could still be multiplied by an unbounded number of abandoned
  mapping flows.
- **Clean failure on the second parse.** Covered above - a corrupt file
  that only fails to parse *after* mapping still gets a clean error and
  cleanup, not an orphaned temp file.

Not new risk, worth naming so it isn't assumed: pandas' CSV/Excel readers
don't execute formulas or macros on read, so there's no code-execution risk
from file *content* itself - only from what happens if that content is
later re-exported (next paragraph).

**Forward-looking, not built now:** `extra_fields` stores fully
attacker-controlled free text, unlike the five typed/validated canonical
fields. `GET /records/export` doesn't touch `extra_fields` in this spec (see
"Out of scope"), so there's no export path for it yet - but whenever one
exists, values starting with `=`, `+`, `-`, or `@` need the standard
CSV-injection neutralization (a leading `'`) before being written, or a
spreadsheet app will treat them as formulas on open. `export_records`
doesn't do this for `full_name` today either (a pre-existing, unrelated
gap) - noted here so it isn't forgotten, not fixed by this spec.

## Frontend

- **Mapping screen**, shown when `uploadFile()`'s response has
  `status: "mapping_required"` (replaces today's always-`IngestResult`
  return type in `client.ts`). One row per raw header: 1-2 sample values
  next to it, and an action control (each schema field / "Combine into
  \<field>" / "Extra data" / "Ignore"). Submit is disabled until every
  required schema field has at least one column assigned - the same
  requirement the backend enforces, checked client-side first so the
  engineer isn't round-tripping to discover it.
- **`RecordDetailPage.tsx`** (already exists) gets a new section rendering
  `extra_fields` as a plain key/value list when present. The records list/
  table view is unaffected - stays exactly the fixed five columns it shows
  today (see "Out of scope").

## Testing strategy

Real Postgres-backed tests, matching this project's existing convention
(no mocked DB):

- Unseen fingerprint → `mapping_required` response with the file's actual
  headers/sample rows; nothing ingested yet, `pending_uploads` row exists.
- Submitting a valid mapping → ingest completes, `column_mappings` row
  persisted, `ClientRecord.extra_fields` populated exactly as mapped.
- A second upload of the same shape → `completed` immediately, no prompt,
  mapping applied silently.
- Mapping submission missing a required field → 400, no `column_mappings`
  row written, no records created.
- `GET /records/upload/{id}` for another owner's pending upload → 404.
- `POST .../mapping` for another owner's pending upload → 404.
- Upload with a disallowed extension → 400, nothing persisted.
- Sweep script deletes `pending_uploads` rows (and temp files) past the
  TTL, leaves fresh ones untouched.

## Out of scope (explicitly, for this spec)

- **Webhook payloads and SCIM provisioning mapping** keep using only the
  five canonical fields - `extra_fields` doesn't flow to either in v1.
- **The records list/table view** keeps its current fixed columns; extras
  only ever surface on the record detail page, not a fully dynamic table -
  avoids a much larger UI problem for v1.
- **CSV-export formula-injection neutralization** - see "Security" above;
  a real gap, but not triggered by this spec since `extra_fields` isn't
  exported yet.
- **Editing a saved mapping after the fact.** Once resolved, a shape's
  mapping is fixed; correcting a mistake means the schema.yaml-defined
  required fields still gate every future upload of that shape the same
  way. Revisiting a saved mapping is future work, not this spec.
