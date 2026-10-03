# Session handoff: 2026-10-03, evening

Picks up where `2026-10-03-brand-kit-handoff.md` (afternoon, #84) left
off. Covers PRs #85–#90. Short version: flagged records now wait for a
human before going anywhere, and the records page is built around that
(Review button, Needs review / Approved cards, upload picker). Railway is
still the next thing with a deadline.

## Where things stand right now

- **`staging`** = `main` + invoice extraction (#72) + tax ID check (#75)
  + everything below (#85–#90). Not promoted to `main` yet.
- **`main`** unchanged since the afternoon (#83 brand removal).
- Tests: 225 backend (pytest), 42 frontend (vitest). All green. Lint and
  build clean.
- No open PRs.
- Local branches: only `main`, `staging`, and
  `fix/upload-missing-required-column` (one unmerged WIP commit, no PR;
  delete with `git branch -D` if you don't need it). The ~25 stale ones
  from merged PRs are gone.

## Today (evening), in order

### Review gate (#85, roadmap 3.2 approve + 3.3)
The biggest open risk from the invoice review: webhooks and provisioning
fired for **every** record at upload, flagged or not, so a wrong total
could reach a client's software before anyone looked.
- **Rule:** a record is *ready* when it has no flags or someone approved
  it. Only ready records go out.
- **Where:** in the worker's two claim queries (`ClientRecord.is_ready()`),
  not at upload. That one check covers every way flags change: upload,
  edit, mapping review, approve. Jobs are still created at upload; a
  flagged record's job just waits.
- `POST /records/{id}/approve` (idempotent) + **Approve** button on the
  record page. Editing a record clears its approval.
- Held jobs show **"Awaiting review"**; manual "Resend" on an unready
  record returns 409. CSV export gained `approved_at`.
- New nullable column `client_records.approved_at` (migration
  `c7d2e9a41b30`, additive).
- **Behavior change:** flagged records already queued stop being sent
  until approved.

### Records page, built around the gate (#86–#90)
- **#86** Review button next to Delete on rows that need review (opens
  the record; no approving from the list, on purpose). Approved rows show
  "Approved".
- **#87** The upload banner's "2 clean / 3 flagged" and the stat cards
  became clickable filters. We decided **no auto-dismiss timer** on the
  banner: it's what's left to do, and it's kept in sessionStorage on
  purpose.
- **#88** Removed the All / Clean / Flagged pills (the cards do the same).
- **#89** Plan: `docs/superpowers/plans/2026-10-03-records-filters.md`.
- **#90** Cards are now **Total · Clean · Needs review · Approved** (they
  add up; the old Flagged card counted approved records too). The status
  pill reads "Needs review". An **upload picker** next to search drives
  the existing `?ingestion_run_id=` param, so the cards and the **export**
  follow it: pick an upload → export = just that batch. It replaced the
  "Showing only records from one upload" bar.

### Test file
`~/Downloads/review-gate-test.csv` (not in the repo): 2 clean, 3 flagged
(bad email, blank name, bad date), 1 duplicate. Emails are `.v3`, not yet
uploaded. If you re-test after uploading it, change them (the upload
skips emails the account already has).

## Tomorrow

### 1. Railway (you, by 2026-10-05; credit ends ~2026-10-10)
Unchanged, still the only hard deadline:
1. **Pick a plan** (Workspace → Plans). Production stops when the credit
   runs out.
2. **Staging webhook worker → Settings → Source → Branch = `staging`.**
   Now more important: until this is done the staging worker runs `main`
   code, which has **no review gate**, so flagged records still get sent
   on staging. It also replaces the build stuck "Building" for ~5 days.
3. Check which region the production API, Postgres and worker are in.
4. Leave `databridge-backup-volume` alone.

Send me: the plan you picked, the worker's new active commit, the regions.

### 2. Test #85–#90 on staging (you, after Railway step 2)
Upload `review-gate-test.csv`:
1. Banner: "6 rows processed · 2 clean · 3 flagged · 1 duplicate skipped".
2. Cards: Clean 2 · Needs review 3 (60%) · Approved 0. Each card filters.
3. Review button only on the 3 rows that need review.
4. Approve Elena → "Approved on …"; back in the list: Needs review 2,
   Approved 1, her row says Approved with no Review button.
5. Edit Pablo's date to `2026-09-23` → flag clears, row is Clean.
6. Resend webhook on the blank-name record → refused ("fix or approve it
   first").
7. Upload picker: pick the upload, then All uploads. Export with the
   upload picked → only its rows.
8. Re-upload the same file → "5 already ingested", counts not clickable.

Steps 4–6 need `WEBHOOK_URL` set on staging for the status badges.

### 3. Me: store the original document (roadmap 3.1), plan first
For an invoice, "review" means checking the flagged total against the
PDF, and today the PDF isn't kept after upload. 3.1: store it with its
upload (Postgres to start), delete it with the upload, "View document"
on the record page. Needs a migration, so I write the plan for your
approval first. It's the step before the review screen (3.4).

### 4. Then
- Postgres to EU West (after Railway; runbook for your approval).
- Monthly document quota (3.5): production can't get an LLM key without
  it. Less urgent until a gestoría says yes.
- Pilot outreach continues (until 2026-10-20), and the open items below.

## Still open / parked (unchanged from the afternoon)
- **Manus API key** pasted in chat on 2026-09-27: revoke if not done.
- **Autónomo status** before charging the first client.
- `~/projects/tidybridge-backup-2026-10-02.bundle` can be deleted.
- Promoting `staging` → `main` still waits on the invoice extraction exit
  check (LLM key, privacy page, DPA). If you want the review gate in
  production before that, it can be cherry-picked like #76/#83 were.
- Records-page filters not built, with their triggers in the #89 plan:
  problem type (when extraction is on), delivery status, invoice vs
  client records, date range.

## How we work (reminders for the next session)
- Feature branch → PR into `staging` → you test → promote. A
  landing-only change can go to `main` on its own (cherry-pick), then
  merge `main` back into `staging`.
- **Every change gets its own new PR**, even small follow-ups; don't add
  to a PR you may already have merged.
- Plans get your approval before code; explain each step as it's done.
- Brand and sales material is private; ask before publishing anything.
- No browser automation, no subagents, no co-author lines, unless you ask.
