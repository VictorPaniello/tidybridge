# Records page filters: review status cards + upload picker

Follow-up to the review gate (#85–#88). Frontend only: no backend or
migration changes. Starts from `staging` **after #88 merges** (it touches
the same stat cards).

## Problem

1. **The Flagged card is wrong since the review gate.** It counts every
   record with `has_issues`, approved ones included. Approve Elena and the
   card still says "Flagged 3" while her row says "Approved". The number
   that matters now is what still needs a human.
2. **Filtering by upload is a detour.** `?ingestion_run_id=` already
   works (records are fetched for that upload only, and the export
   respects it), but the only way in is Upload history → "View records".
   In the pilot you work one client's batch at a time, so this should be
   one click on the records page.

## 1. Review status cards

Four cards instead of three, each one a filter (same behavior as today):

| Card | Counts | Filter shows |
|---|---|---|
| Total records | everything | all |
| Clean | `!has_issues` | clean |
| **Needs review** | `has_issues && !approved_at` | flagged, not approved |
| **Approved** | `has_issues && approved_at` | flagged, approved |

- The percentage moves to **Needs review** ("1 (20%)"): that's the to-do
  share. The amber color goes with it; Approved uses the clean color.
- `Filter` becomes `"all" | "clean" | "needs_review" | "approved"`. Every
  record is in exactly one of clean / needs_review / approved, so the
  three add up to Total.
- Reuse `statusLabel()` from #86 for both the counts and the filter, so
  the cards, the status pill and the sort can't disagree.
- **Status pill:** "Flagged" becomes **"Needs review"**, matching the card
  (the Review button already sits on those rows).
- **Upload banner:** "3 flagged" stays worded as is (it's what the upload
  found) but its click goes to **Needs review**. The CountFilter test
  updates accordingly.
- Layout: `grid-cols-2 sm:grid-cols-4`, so phones get a 2×2 grid instead
  of four squeezed cards.

## 2. Upload picker

A dropdown in the empty spot left of the search box:

```
[ All uploads ▾ ]                                  [ Search… ]
  All uploads
  review-gate-test.csv · 3 Oct 18:40 · 5 rows
  clientes-q3.xlsx · 1 Oct 10:02 · 120 rows
```

- A native `<select>` (keyboard, mobile picker and screen readers for
  free), options from the existing `api.listIngestionRuns()`, newest
  first. Label: file name · date · `rows_total` rows.
- It **drives the existing `?ingestion_run_id=` URL param**, nothing new:
  picking an upload sets it, "All uploads" clears it. So the fetch, the
  cards (they count what's loaded), the export and the Upload history
  links all keep working as they do today, and a filtered view stays
  shareable / survives a reload.
- The "Showing only records from one upload … Clear filter" bar is
  removed: the dropdown shows the same thing and "All uploads" is the
  clear.
- After a new upload, the run list is refetched so the new file appears.
  The picker is not switched to it automatically: the banner's counts
  already cover "what did this upload do".
- An `?ingestion_run_id=` that isn't in the list (deleted upload, someone
  else's id) shows as "All uploads" and loads nothing, same as today's
  behavior for an unknown id. Not worth more handling.
- Hidden when there are no uploads; disabled during an upload, like the
  cards.

## Not doing (and when)

- **Problem-type filter** (invalid email / date / missing / totals):
  when invoice extraction is switched on and flags get more varied.
- **Delivery status filter:** needs per-record job status in the list
  response (backend change). When failed deliveries become a real issue.
- **Invoice vs client records** (roadmap 3.7): when extraction is on.
- **Date range:** the upload picker covers "when" for how the pilot works.

## Tests (vitest, `RecordsPage.test.tsx`)

- Cards: with one clean, one flagged and one approved record, the counts
  are 1 / 1 / 1 and each card filters to exactly its record.
- The banner's "N flagged" goes to Needs review.
- Picker: lists the uploads from `listIngestionRuns`; choosing one calls
  `listRecords` with that run id; "All uploads" calls it without one.
- Opening the page with `?ingestion_run_id=` preselects that upload.
- Existing tests updated where they click "Flagged" or expect the
  "Showing only records from one upload" bar.

## Rollout

One PR into `staging`. Test there with `review-gate-test.csv` (fresh
emails): Needs review 3 → approve one → Needs review 2, Approved 1; pick
the upload in the dropdown, then "All uploads"; export with an upload
picked gives only that upload's rows.
