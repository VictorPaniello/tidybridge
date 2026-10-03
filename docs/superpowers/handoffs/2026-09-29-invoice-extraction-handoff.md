# Session handoff: 2026-09-25 → 2026-09-29

Picks up where `2026-09-25-mapping-review-session-handoff.md` left off
(PR #54). Covers PRs #55–#72. Short version: a round of fixes and polish,
a landing-page redesign, inline record editing, then the start of the
invoice extraction direction - its Phase 1 code is on `staging`, switched
off until an API key is set.

## Where things stand right now

- **`main`** is at PR #71: everything up to and including the landing-page
  motion work is live in production.
- **`staging`** is `main` + PR #72 (invoice extraction Phase 1). Not
  promoted yet, on purpose - see "Next" below.
- **Invoice extraction is deployed on staging but off.** No
  `ANTHROPIC_API_KEY` is set anywhere, so a PDF/image upload returns a
  clear 400 ("isn't enabled") and CSV/Excel uploads behave exactly as
  before.
- Tests: 204 backend (pytest), 37 frontend (vitest). All green.
- No open PRs.

## What we did, in order

### Fixes and polish (PRs #55–#59)
- **#55** Changing a field's type on the mapping review screen now
  re-validates the records already ingested with that mapping, not just
  future uploads.
- **#58** A blank required field no longer turns into the string `"nan"`
  when a mapping is re-saved (a pandas dtype gotcha: build DataFrames with
  `dtype=object` when values can be `None`).
- **#56** Type dropdown options were unreadable in dark mode.
- **#59** Header nav wraps on narrow screens; table field names are
  humanized.

### Landing page (PRs #61, #63, #65, #70)
- Redesigned `marketing/` (#61), sticky header (#63), "How it works"
  section and a wider container (#65).
- Motion (#70): the hero's SCIM payload streams in line by line, with a
  "Sent" indicator once it's done; capability icons lift on hover; the
  nav logo fades in. All respect reduced-motion.
- Deliberately *not* done: an AI-generated landing page. We stuck with
  the hand-built design.

### Records table and inline editing (PRs #64, #67)
- **Inline editing** (#67): `PATCH /records/{id}` fixes a flagged record
  in place and re-validates it against the types its upload was cleaned
  with. Needed a new column, `IngestionRun.resolution` (migration
  `a146263fe066`). Frontend: Edit/Save/Cancel on the record detail page.
- **Motion on the records table**: tried several versions, and you found
  most of them distracting (the filter pill sliding in from above, rows
  moving like they were scrolling). **Final decision: no motion on table
  rows or filtering.** What stayed: press feedback on buttons, and a fixed
  width/height for the "Delete (N)" column so the table doesn't jump when
  it appears.

### Docs (PR #68)
- README and CHANGELOG brought up to date. Among other things, removed
  the now-false claim that records are never changed after ingest.

### Invoice extraction, Phase 1 (PR #72)
The plan lives in `docs/superpowers/plans/2026-09-27-invoice-roadmap.md`
(phases 0–4) and `2026-09-27-invoice-extraction.md` (Phase 1 in detail).
All four Phase 1 tasks are done:

1. **`src/tidybridge/extract.py`**: sends a PDF/image to Claude and gets
   back validated structured output (supplier, tax ID, number, date,
   currency, net/VAT/withholding/total), one row per invoice. Flags come
   from fields the model says it's unsure of plus a
   `net + VAT - withholding = total` check (so Spanish IRPF invoices
   aren't falsely flagged), not from a confidence score. Tax IDs are
   normalized so dedup works.
2. **Wired into `POST /records/upload`**: after extraction, invoices go
   through the same mapping/validation/dedup/webhook pipeline as a CSV.
   Same invoice twice = no second record. 400 for a bad document, 502 if
   Anthropic is down (with nothing half-written in the DB).
3. **Frontend + docs**: the upload button accepts invoices; the privacy
   page lists Anthropic as a sub-processor and invoices as a data
   category; README section; `.env.example`.
4. **`scripts/eval_extraction.py`**: measures accuracy per field against
   invoices you label by hand in `evals/invoices/labels.jsonl` (real ones
   go in `evals/invoices/private/`, which is gitignored). Not run yet.

Decisions made along the way:
- Default model is **`claude-sonnet-5`** (`EXTRACTION_MODEL` to change it).
  The eval will tell us whether Opus is worth the extra cost.
- **No money spent yet.** Every test fakes the model call. Only the smoke
  test and the eval run cost anything (a few cents per document).
- **Fix found on the way:** SCIM provisioning was being queued for records
  that aren't users (an invoice, or a CSV row with no email) and sent
  `userName: null`. Now those are skipped, and a manual replay of one
  returns a 400.

## Next

### You (no code, can start any time)
1. **Decide on the Anthropic key.** If yes: create it in the Console, set a
   monthly spend limit (e.g. $20), accept the DPA (Settings → Legal).
   The $100 "cloud session" credit in your Claude account is a separate
   pool and very likely doesn't pay for API calls - check the Console's
   own Billing page.
2. **Check one privacy-page claim** before this reaches `main`: that
   Anthropic doesn't train on the documents. Verify against their current
   commercial terms.
3. **Set `ANTHROPIC_API_KEY` on the staging service in Railway only.**
   Not production: production has open signup and no per-user quota yet,
   so anyone could spend the key.
4. **Upload one real invoice on staging** and check: fields correct,
   flags only on genuinely doubtful values, re-uploading creates nothing
   new.
5. **Start collecting and labeling ~30 invoices** (mix of clean PDFs,
   phone photos, IRPF freelancer invoices, a non-EUR one, a multi-invoice
   PDF, a couple of non-invoices). Label format is in the eval script's
   docstring.

### Me, once you're back
- Smoke test against the real API with one invoice (confirms the SDK call
  and the model ID work - the only thing the tests can't prove).
- Promote `staging` → `main` once step 4 above works.
- Run the eval with both models, commit the results, put the real numbers
  in the README (that's the FDE talking point).

### After that: Phase 2, the pilot
- The roadmap aims the pilot at **Oct 1–20** (the Q3 VAT deadline rush),
  which starts in two days. It doesn't need the eval to be finished, only
  a working staging upload.
- Your side: outreach to gestorías, find out which accounting software
  they use.
- My side: export in that software's import format (roadmap task 2.5).
  This is what completes the FDE story: invoices *into* the software the
  client already uses. Extraction alone is a demo, not an integration.

## Still open / parked

- **Per-row "Edit" shortcut on the records table**: you said "not right
  now". Parked, not rejected.
- **Postgres EU West migration**: still pending (API is already in EU
  West). The roadmap needs it done before Phase 3.
- **Autónomo status** (roadmap 0.4): needed before charging the first
  client.
- **The Manus API key pasted in chat on 2026-09-27**: rotate or revoke it
  if you haven't. It's in the conversation history in plain text.
- `feat/invoice-extraction` still exists on GitHub after the merge;
  delete it whenever you like (never delete `staging`).

## How we work (reminders for the next session)

- Feature branch → PR into `staging` → you test → "promote" PR
  `staging` → `main`.
- If a promotion PR shows "BEHIND", merge `origin/main` into `staging`
  first (an empty bookkeeping merge) - happens after every promotion.
- No browser automation unless you ask; you test in your own browser.
  No subagents unless you ask.
- Plans get your approval before code; explain each step as it's done.
