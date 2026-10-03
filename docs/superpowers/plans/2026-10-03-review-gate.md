# Review gate: approve step + only reviewed records go downstream

Roadmap 3.2 (approve half; `PATCH /records/{id}` already exists) and 3.3.

## Problem

Ingest enqueues a webhook job and a provisioning job for **every** record,
flagged or not (`ingest.py`, the loop after `rows_flagged`). The worker
sends whatever is pending. So an invoice with a flagged total reaches the
receiver before anyone has looked at it, and there's no way to say "I
checked this flag, it's fine".

## Rule

A record is **ready** when `has_issues` is false **or** someone approved it.
Only ready records leave tidybridge (webhook, provisioning).

## Design: one choke point, in the worker

Jobs keep being enqueued exactly as today. The worker's two claim queries
(`process_due_jobs`, `process_due_provisioning_jobs`) join `client_records`
and only claim jobs whose record is ready. A flagged record's job just sits
`pending` until the record is fixed (PATCH) or approved; then the next
poll sends it.

Why here and not at enqueue time: records change readiness in four places
(ingest, PATCH, mapping review re-flag, approve). Guarding at the worker
covers all four with one change, including the nasty case where a mapping
review *re-flags* a record whose job is already pending. Gating at enqueue
time would need a guard in each of the four places.

## Changes

1. **Migration + model:** `client_records.approved_at` (timestamptz,
   nullable). Null means not approved.
2. **Worker:** both claim queries get
   `.join(ClientRecord).where(or_(~has_issues, approved_at.is_not(None)))`
   and `with_for_update(skip_locked=True, of=<job table>)` so the record row
   isn't locked too.
3. **`POST /records/{id}/approve`:** sets `approved_at = now()` (idempotent:
   approving twice keeps the first time). Returns the record. Approving a
   clean record is allowed and harmless.
4. **`PATCH /records/{id}`:** an edit clears `approved_at`. The approval
   was for the old values; if the edit leaves it clean it's ready anyway,
   if it's still flagged it needs a fresh look.
5. **Manual replays** (`/webhooks/replay`, provisioning replay): `409` if
   the record isn't ready, "Approve or fix this record first". Otherwise
   the replay button would be a way around the gate.
6. **Status shown to the user:** `GET /records/{id}/webhook-status` returns
   `"awaiting_review"` instead of `"pending"` when the job is pending and
   the record isn't ready (same for provisioning status). The CSV export
   gets an `approved_at` column.
7. **Schema out:** `ClientRecordOut.approved_at`.
8. **Frontend (record detail page):** an "Approve" button inside the
   "Validation issues" box, shown when the record is flagged and not
   approved. When approved: "Approved on <date>" instead. The status
   badge handles `awaiting_review`.

## Not doing (and when)

- **Export filtering.** The CSV export keeps every record (it's also how
  you see what's flagged). Filtering to ready-only belongs in the pilot's
  accounting-software export (2.5), once we know the format.
- **Re-sending after an edit to an already-delivered record.** Unchanged
  from today: use the manual replay. Add auto-resend if the pilot needs it.
- **Bulk approve.** Add when a pilot batch shows it's needed.
- **Approval audit trail (who approved).** One user per account today;
  add `approved_by` when there are teams.

## Tests (pytest)

- Worker skips a pending job for a flagged, unapproved record; sends it
  after approve; sends it after a PATCH that makes it clean.
- Worker still sends clean records immediately (existing tests stay green).
- Mapping review re-flags a record with a pending job → worker skips it.
- Approve: 404 on someone else's record, idempotent, sets `approved_at`.
- PATCH clears `approved_at`.
- Replay on a not-ready record → 409.
- webhook-status says `awaiting_review`.
- Frontend (vitest): Approve button shows for flagged records, calls the
  endpoint, then shows "Approved".

## Rollout

PR into `staging`, you test it there (upload a CSV with a bad row, see the
webhook status say "awaiting review", approve, see it go). Migration is
additive (one nullable column), safe to run before the code deploys.

**Behavior change to know about:** after this ships, flagged records that
are already sitting `pending` in production stop being sent until approved.
That's the point, but it applies to existing rows too.
