# Session handoff: 2026-09-24 → 2026-09-25

Everything below happened in one long Claude Code session, all merged into
`staging` (not yet promoted to `main` — see "What's next"). Starting point
was a report that cleaned data wasn't standardized enough; it grew into a
full pass on the column-mapping review screen and the records table.

## What we did, in order

1. **String cleaning gap (tidycsv)** — `_coerce_string` only did `.strip()`,
   so `"John    Doe"` survived "cleaning" with its internal whitespace
   intact. Fixed upstream in the `tidycsv` repo (collapses runs of
   whitespace to a single space), then pinned tidybridge's `uv.lock` to
   that commit. PR #42.

2. **Mapping review screen gives real feedback** (PR #43) — Save used to
   silently update the mapping and leave the engineer on the same screen
   with a static "Saved." (no navigation, no indication of what changed,
   and a failed save had no `catch` at all — errors vanished silently).
   Now: success navigates back to records with a summary of what changed
   (renamed/dropped fields, type changes); failure shows the backend's
   actual error inline.

3. **Per-field "required" flag** (PR #44) — Dynamic schema mapping had
   forced every field to `required=False` unconditionally, so a blank
   value in *any* field (including a customer's name) was silently
   coerced to `None` and never flagged. Added a real opt-in `required`
   checkbox per field on the review screen; alias-matched fields
   (`full_name`, `email`) default to required, matching pre-dynamic-mapping
   behavior.

4. **Sample raw values on the review screen** (PR #45) — the review
   screen gave no indication of what a raw column actually contained.
   Upload now captures up to 3 real pre-cleaning values per raw column
   and shows them under each column name.

5. **UI polish** (PR #46) — sticky header/footer, wider page container,
   row hover on tables that lacked it, and inline validation on the
   "Field name" input (red border + message, Save disabled) mirroring the
   backend's `target_field` regex — instead of only failing after a
   round-trip to the API.

6. **Unreadable upload file → specific 400, not a bare 500** (PR #47) —
   an empty/corrupted file crashed deep in `pandas`/`openpyxl` with
   nothing catching it, so FastAPI's default handler produced a bare 500
   with no `detail`. Added `UnreadableFileError` (a distinct type, not a
   bare `ValueError`, so it can't swallow unrelated errors from elsewhere
   in the pipeline) → `HTTPException(400, <specific message>)`.

7. **Bulk delete on the records table** (PR #48) — per-row checkboxes,
   a header "select all" (scoped to the currently filtered/searched
   rows), and a "Delete (N)" button. Backend `POST /records/bulk-delete`
   deletes the whole selection in one transaction — chosen over looping
   individual `DELETE` calls specifically to avoid a large "select all"
   burning through the 60/minute rate limit.

8. **Mapping-review save redirect + toast** (PR #49) — Save used to
   redirect to `/?ingestion_run_id=<upload>`, filtering the records view
   down to just that upload (a surprising side effect, left a "Showing
   only records from one upload" banner). Now always lands on the
   unfiltered view. The "Mapping saved." summary also auto-dismisses
   after 6s instead of sitting there forever.

9. **Countdown ring on the toast's dismiss button** (PR #50) — pure CSS
   `stroke-dashoffset` animation matching the 6s auto-dismiss, so the
   countdown is visible.

10. **Header-row jump + stale review prompt + layout width** (PR #51) —
    three separate bugs from one review pass:
    - The bulk-delete button's own padding stacked on top of the header
      cell's padding, making the whole header row (and everything below
      it) grow ~6px the instant anything got selected, then shrink back.
      Fixed with a fixed `h-5` instead of stacked padding.
    - Saving a mapping never flipped `mapping_is_default` in the cached
      upload result, so "New shape — review the field names/types?" kept
      showing even right after being reviewed and saved.
    - Upload stats line rewritten (two-line layout, no em dash); shared
      container widened, side padding shrunk.

11. **GitHub OAuth blocked on staging by the staging-access gate**
    (PR #52) — `require_staging_gate_password` rejected every request
    without an `X-Staging-Password` header, including
    `/auth/github/authorize` and `/auth/github/callback` — but neither
    can ever carry that header (one's a top-level browser redirect, the
    other is GitHub's own redirect back). Both are now exempt.

12. **Hide the upload preview table once reviewed** (PR #53) — the small
    preview table in the upload summary was redundant once a mapping had
    been reviewed and saved, since the same rows are already in the full
    table below it. Now gated on `mapping_is_default`, same as the
    "Review mapping" prompt beside it.

All 12 PRs merged into `staging`. Backend is at 180 passing tests
(`uv run pytest`, `uv run ruff check .` clean); frontend at 35 passing
tests (`npx vitest run`, `npm run lint`, `npm run build` clean).

## What's still open / known-but-not-fixed

- **GitHub OAuth login on staging still doesn't fully work.** PR #52
  fixed the staging-gate blocker, but there's a second, separate issue:
  the GitHub OAuth App's registered "Authorization callback URL" points
  at *production*'s callback, not staging's — GitHub OAuth Apps only
  support one registered callback URL. This needs a **second** GitHub
  OAuth App (Settings → Developer settings → OAuth Apps → New OAuth App)
  with its callback set to `https://staging-api.tidybridge.dev/auth/github/callback`,
  then Railway's staging environment's `GITHUB_CLIENT_ID`/
  `GITHUB_CLIENT_SECRET` need to point at that new app instead of the
  ones inherited from production when staging was duplicated. Pure
  dashboard work, nothing left to fix in code.

- **`staging` has not been promoted to `main`.** Everything above is
  live on `staging` only. `main` is still 36 files / ~6900 lines behind
  (this includes the entire dynamic-schema-mapping feature from earlier,
  not just this session's work) — worth a deliberate look before
  promoting, not a rubber-stamp merge.

- **Pending DB region migration** (older, unrelated item from memory):
  the API was moved to EU West at some point; Postgres has not been
  migrated to match yet. Not touched this session.

## Possible next steps

- Promote `staging` → `main` once you've had a chance to exercise the
  mapping-review flow and bulk-delete yourself.
- Set up the second GitHub OAuth App for staging (above) if GitHub login
  on staging matters before that promotion.
- The mapping review screen still has no per-field type-mismatch warning
  (e.g. picking `date` for a column that's obviously not date-shaped) —
  came up during this session as a "could be nicer" but wasn't asked for.
- No test CSVs were left specifically for the bulk-delete flow at scale
  (e.g. 60+ rows, to exercise the rate-limit reasoning behind the
  one-transaction bulk-delete endpoint) — worth generating one if that
  path needs real verification.
