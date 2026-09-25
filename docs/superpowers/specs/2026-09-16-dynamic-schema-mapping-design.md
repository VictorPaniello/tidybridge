# Dynamic schema mapping: design

**Supersedes `2026-09-16-column-mapping-design.md` (PR #37) entirely** - not an
amendment. That doc kept a fixed 5-field schema with unmatched columns
captured into a side-bag `extra_fields`, plus a blocking mapping prompt
whenever a *required* field had no match. Both ideas were rejected during
further brainstorming: a side-bag still treats unmatched data as
second-class, not "a column like any other," and requiring anything at all
reintroduces exactly the first-upload friction this feature exists to
remove. This doc replaces it completely.

## Problem

tidybridge cleans uploads against one fixed schema (`examples/schema.yaml`):
`full_name`, `email`, `signup_date`, `amount`, `phone`. Any column that
doesn't match one of those five is silently dropped, and a required field
with no match crashes ingest (the still-paused
`fix/upload-missing-required-column` bugfix branch, superseded by this spec
the same way the prior spec superseded it).

The real need: an engineer should be able to upload a CSV/Excel file shaped
however their client's export tool shaped it, have every column - not just
five - actually mapped and cleaned as itself, and see exactly what they
uploaded. Nothing should be required to make that happen.

## Explicit scope decisions

Confirmed during brainstorming, in order:

1. **Storage is a single JSONB `fields` column on `ClientRecord`, not a
   separate EAV table** - matches this codebase's existing JSON-column
   conventions (`issues`).
2. **No automatic type-sniffing from values.** A column's type is
   alias-matched (`schema.yaml`'s existing alias list, now used purely as a
   type *hint*, not a contract) or plain string. An engineer can override a
   type explicitly; nothing is guessed from the data itself - heuristic
   sniffing is a reliable source of confidently-wrong coercions.
3. **Deduplication key is entirely engineer-chosen, per shape, optionally
   composite** (more than one field). Defaults to no key - no dedup - until
   an engineer sets one for that shape.
4. **Nothing is ever required to proceed.** Every upload ingests
   immediately under either a saved or an automatically-computed default
   resolution - never a blocking prompt. Reviewing/adjusting a shape's
   resolution is optional and entirely prospective: it changes how *future*
   uploads of that shape resolve, never reprocesses rows already ingested
   under the old resolution.
5. **This spec covers ingest -> dynamic storage -> dedup -> the immediate
   upload-results table only** (the rows from *one* upload, which always
   share one shape - no column-overflow problem). Explicitly out of scope,
   each its own future spec once this ships and `fields`' real shape is
   proven: the persistent multi-upload `/records` list page (many shapes
   over time - a real column-overflow/UI problem), dynamic webhook
   payloads, dynamic SCIM provisioning, dynamic CSV export.
6. **tidycsv itself is never modified.** Every upload builds a `Schema`
   object on the fly from that shape's resolution (every field
   `required=False`), and runs the exact same `map_columns`/
   `coerce_and_validate`/`flag_duplicates` tidycsv already has - confirmed
   `flag_duplicates(df, key_columns)` already accepts an arbitrary column
   list, so an engineer-chosen (possibly composite) dedup key needs zero
   tidycsv changes.
7. **`examples/schema.yaml`'s role narrows.** Its field/alias list is still
   read - purely as the source of type hints for default resolutions (deciding
   whether an unmatched header looks like a known `email`/`amount`/etc.) -
   but its `key_columns` entry is no longer consulted anywhere; deduplication
   is entirely `dedup_key_fields`, per owner per shape, now.

## Data model

### `ClientRecord` (modified)

| before | after |
|---|---|
| `full_name`, `email`, `signup_date`, `amount`, `phone` (fixed columns) | `fields: JSONB` |

Everything else (`id`, `owner_id`, `ingestion_run_id`, `source_file`,
`has_issues`, `issues`, `created_at`) is unchanged.

**Migration:** backfill every existing row's five legacy columns into
`fields` (e.g. `{"full_name": "...", "email": "...", ...}`, omitting nulls),
then drop the legacy columns - one migration, not a phased rollout, matching
this project's existing single-instance, pragmatic-tradeoff conventions
(documented the same way elsewhere in the README) rather than a
zero-downtime multi-step rollout this project's scale doesn't need.

### `column_mappings` (new)

One row per shape an owner has explicitly saved a resolution for - looked
up by fingerprint on every upload; a shape with no row here just uses the
computed default (see below).

| column | type | notes |
|---|---|---|
| `id` | UUID | |
| `owner_id` | UUID FK → `users`, `ondelete=cascade` | |
| `header_fingerprint` | string | sha256 of the sorted, trimmed+lowercased raw column names |
| `field_resolutions` | JSON | see shape below |
| `dedup_key_fields` | JSON list of target field names | empty by default |
| `created_at` | datetime | |

Unique on `(owner_id, header_fingerprint)`.

**`field_resolutions` shape** - one entry per raw column, always:

```json
[
  {"raw_column": "First Name", "target_field": "full_name", "type": "string"},
  {"raw_column": "Last Name",  "target_field": "full_name", "type": "string"},
  {"raw_column": "E-mail",     "target_field": "email",     "type": "email"},
  {"raw_column": "Age",        "target_field": "age",       "type": "string"},
  {"raw_column": "Internal ID","target_field": null,        "type": null}
]
```

- `target_field: null` means excluded entirely - the only way a column is
  ever dropped, and only when an engineer explicitly says so.
- **Sharing a `target_field` *is* combining.** No separate "combine" flag:
  any two or more entries that resolve to the same non-null `target_field`
  are joined with a single space, in the raw file's own column order, into
  that one field - one rule, not two fields that could disagree with each
  other.

### Default resolution (no saved mapping yet)

For a fingerprint with no `column_mappings` row: every raw column gets
`target_field` = its own header, normalized (trim, lowercase, runs of
non-alphanumeric characters collapsed to a single underscore, leading/
trailing underscores stripped, prefixed with `field_` if what's left starts
with a digit or is empty) - the same `^[a-z][a-z0-9_]{0,99}$` shape
"Mapping management" validates on save, so a default resolution is always
already valid, never rejected if the engineer saves it unchanged. `type` =
the alias-matched type if the normalized header matches a known alias in
`schema.yaml`, else `"string"`. No dedup key, and no two columns share a
`target_field` by default. If two raw
columns normalize to the same `target_field` by coincidence, the second
(and third, etc.) gets a numeric suffix (`full_name_2`) rather than
silently overwriting the first.

## Upload/ingest flow

**`POST /records/upload`** - one endpoint, one request, no pause:

1. Existing size/extension checks (unchanged).
2. `load_input()` → raw dataframe with raw headers.
3. Compute the fingerprint from those headers.
4. Look up `column_mappings` for `(owner_id, fingerprint)`. Found → use its
   `field_resolutions`/`dedup_key_fields`. Not found → compute the default
   resolution in memory (not persisted unless the engineer later saves one).
5. Build a per-upload `Schema`: one `FieldSpec` per distinct non-null
   `target_field` (entries sharing one collapse to a single field),
   `required=False`,
   type from the resolution.
6. `apply_mapping()` (new, `ingest.py`, runs before `map_columns()`):
   renames directly-mapped columns onto their `target_field`, builds any
   shared `target_field`'s value by joining its source columns with a
   single space in file column order, and drops `target_field: null`
   entries. Output has
   exactly the synthetic schema's field names - `map_columns()` and
   everything after it runs completely unchanged.
7. `flag_duplicates(deduped, dedup_key_fields)` - empty list means no dedup,
   exactly as `flag_duplicates` already behaves for an empty key list.
8. Persist each row's `ClientRecord.fields` as the resulting
   `{field: cleaned_value}` dict; `has_issues`/`issues` exactly as today.
9. Response includes `mapping_is_default: true/false` - `true` means this
   upload just used a computed default because no one's reviewed this shape
   yet, so the frontend can offer the (entirely optional) review step.

## Mapping management

Small, separate from upload - only reached if an engineer chooses to.

- **`GET /column-mappings/{fingerprint}`** - the saved resolution, or the
  computed default if none exists yet. Scoped to `owner_id == current_user.id`.
- **`PUT /column-mappings/{fingerprint}`** - saves/replaces the resolution
  for that shape, going forward only. Validates: every `dedup_key_fields`
  entry is an actual `target_field` present in the resolution, and every
  non-null `target_field` matches `^[a-z][a-z0-9_]{0,99}$` (basic sanity,
  not a content restriction). 400 with a specific reason on any violation,
  nothing persisted.

## Security

The prior spec's biggest new-attack-surface item - a file persisted
server-side across two requests - **no longer applies**: this is a single-
request flow, no temp storage, no `pending_uploads`. What's left:

- **Field-name validation on save.** `PUT /column-mappings` accepts
  engineer-supplied `target_field` names - the same allow-list regex above
  keeps them from becoming pathological JSON keys (unbounded length,
  control characters) before they're ever written to `fields`.
- **Ownership scoping.** Both mapping-management endpoints filter by
  `owner_id` - a fingerprint isn't secret, but one owner's saved resolution
  must never apply to (or be readable by) another owner.
- **Forward-looking, not built now:** once CSV export touches dynamic
  `fields` values (deferred - see "Out of scope"), the standard
  CSV-injection neutralization (a leading `'` on any value starting with
  `=`/`+`/`-`/`@`) applies then, the same note the prior spec already made
  for `full_name`.

## Frontend

- **Upload-results table**: renders `fields` dynamically - one column per
  distinct field name across *this* upload's records (always one consistent
  set, since one file resolves to one schema). Max width isn't a concern
  here specifically because of that - it only becomes one for the deferred,
  multi-shape persistent list page.
- If `mapping_is_default: true`, a dismissible affordance: "New shape -
  review the field names/types we picked?" linking to the review screen.
- **Review screen** (voluntary): one row per raw column - editable
  target-field name, a type dropdown, a "combine into" picker, and a way to
  designate one or more fields as the dedup key. Saves via
  `PUT /column-mappings/{fingerprint}`.
- **`RecordDetailPage.tsx`**: renders `record.fields` as a key/value list.

## Testing strategy

Real Postgres-backed tests, matching this project's existing convention:

- Unseen fingerprint, no alias matches → every column becomes its own
  string field, ingest succeeds immediately, `mapping_is_default: true`.
- An alias-matched column still gets typed cleaning - a malformed email is
  still flagged in `issues`, exactly as today.
- A saved mapping applies silently on a later upload of the same
  fingerprint - `mapping_is_default: false`, no review affordance.
- Two entries sharing a `target_field` join with a single space, in file
  column order.
- Dedup: a single-field key skips already-ingested rows on re-upload; a
  composite key requires all key fields to match; no key configured means
  every row inserts, every time.
- Two raw columns normalizing to the same default `target_field` get a
  numeric suffix, not a silent overwrite.
- `PUT /column-mappings/{fingerprint}` rejects a `target_field` that
  doesn't match the allowed pattern (starts with a digit, contains a space,
  etc.) with 400, nothing persisted.
- Owner isolation: owner A's saved mapping for a shape never applies to
  owner B uploading an identically-shaped file.
- Migration test: seed a legacy-shaped row, run the backfill, assert
  `fields` has the expected keys/values and the legacy columns are gone.

## Out of scope (explicitly, for this spec)

- **The persistent multi-upload `/records` list page going dynamic** - real
  column-overflow problem across differently-shaped uploads over time,
  needs its own design (max-width/truncation strategy) - separate future
  spec.
- **Dynamic webhook payloads, dynamic SCIM provisioning, dynamic CSV
  export** - each hardcodes the five legacy fields today; each becomes its
  own spec once `fields`' real shape exists to design against.
- **Retroactive reprocessing.** Changing a shape's saved mapping never
  touches rows already ingested under the old one.
- **CSV-injection neutralization** - not applicable yet, since export isn't
  touched by this spec.
