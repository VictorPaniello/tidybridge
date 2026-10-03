# Session handoff: 2026-10-02 → 2026-10-03

Picks up where `2026-09-29-invoice-extraction-handoff.md` left off
(PR #72). Covers PRs #73–#77. Short version: chose a free LLM direction
(decision only, no code), set up `hello@tidybridge.dev`, put a "For
gestorías" pilot section live in production, and added a Spanish tax ID
check to extraction. Next is Railway housekeeping, then the database move.

## Where things stand right now

- **`main`** is PR #71 plus the landing page section (#76). Live at
  **https://tidybridge.dev/#gestorias** (verified on the live site).
- **`staging`** is `main` plus invoice extraction (#72) and the tax ID
  check (#75), plus this doc and the previous handoff (#77). `main` has
  already been merged back into `staging`, so the next promotion won't
  be "BEHIND".
- **Invoice extraction is still off everywhere.** No LLM key is set.
- Tests: 216 backend (pytest), all green. Frontend (37 vitest) untouched
  this session.
- No open PRs.

## What we did, in order

### Free LLM decision (no code)
You didn't want to pay for an LLM yet, so we compared the free options
for reading invoices. What decides it is privacy: real client invoices,
and the privacy page promises they aren't used for training.

| Option | Verdict |
|---|---|
| Gemini free tier | No. Trains on your data, humans may review it |
| OpenRouter free models | No. 50 requests/day, provider (and its policy) varies |
| Ollama on your laptop | Dev/eval only. 4 GB GPU, and Railway can't reach your laptop |
| Groq free tier | Doesn't train, but images only (no PDF), 3 images per request, US-based |
| **Mistral Document AI** | **Chosen direction.** Reads PDFs directly into a JSON schema, EU-hosted |

The plan: **Mistral free tier ("Experiment") with training switched off**
(Admin Console → Privacy) for staging and the start of the pilot. Mistral
says the free tier is for evaluation and prototyping, so **switch on
pay-as-you-go once a client pays** (about $5 per 1,000 pages, same key,
no code change). Claude stays in the code as an option, and the eval will
compare them.

**Decision: the LLM work waits until it's actually needed** (when a
gestoría is ready to send invoices). Until then we do the work that
doesn't need it.

### Email: `hello@tidybridge.dev` (done by you)
- **Receiving:** Cloudflare Email Routing forwards it to your Gmail.
- **Sending:** Gmail "Send mail as" through Resend's SMTP, so replies come
  from `hello@`. SPF, DKIM and DMARC all pass.
- Your replies share Resend's free 100 emails/day with the app's
  password-reset emails. Plenty for a pilot.

### For gestorías section (PRs #73, #74, released in #76)
- New section at the end of the landing page, in English, anchored at
  `#gestorias`: pitch plus the free pilot offer from roadmap 2.3.
- "Join the free pilot" opens an email to `hello@tidybridge.dev` with the
  subject filled in; the address underneath is a `mailto:` link too.
- **Released on its own (#76)**, by copying just these two commits onto
  `main`, not by promoting all of `staging`. Promoting `staging` would
  have put an "Upload file or invoice" button in production that only
  answers "isn't enabled", and a privacy page naming Anthropic as a
  sub-processor when nothing goes to Anthropic and the provider is
  probably changing.

### Spanish tax ID check (PR #75, roadmap 3.8)
- Every Spanish tax ID ends in a check character, so a misread one can be
  caught with plain code instead of trusting the model. A failed check
  flags `supplier_tax_id`, like the totals check does.
- Covers DNI, NIE and CIF, with or without an `ES` prefix. Foreign or
  truncated IDs are left alone so non-Spanish suppliers aren't flagged.
- Known shortcut (`ponytail:` comment in `extract.py`): it accepts either
  the digit or the letter ending for every company type.
- Side find: the test invoices used `B12345678`, which isn't a valid CIF
  (should end in 4). Now `B12345674`.

### Smaller things
- **Claude co-author lines:** Claude Code's attribution is switched off,
  so new commits and PRs don't include it. You decided to **leave the
  past commits as they are**: rewriting history was prepared and verified
  but never pushed.
- Left over from that: `~/projects/tidybridge-backup-2026-10-02.bundle`
  can be deleted.
- `feat/invoice-extraction` is gone from GitHub.

## Next

### 1. Railway (you, within 2 days, so by 2026-10-05)
Spotted in the staging dashboard on 2026-10-02:
1. **Credit: "8 days or $2.16 left"** (so roughly until 2026-10-10).
   When it runs out, Railway stops the services, **production included**.
   Pick a plan under Workspace → Plans (Hobby is $5/month including $5 of
   usage).
2. **Staging webhook worker runs `main`'s code.** Its active deployment
   is PR #71. Settings → Source → Branch should be `staging`.
3. **A worker build has been stuck "Building" for about 5 days.** Changing
   the branch (step 2) starts a fresh build. If it still hangs, cancel it
   and send me the build logs.
4. **Check the production API's region.** The 2026-09-13 notes say it was
   moved back from EU West as a temporary fix; the last handoff said it's
   in EU West. The migration runbook depends on which it is.
5. Leave `databridge-backup-volume` alone until we know what's on it.

### 2. Postgres to EU West (both of us, after step 1; roadmap 0.6)
I write a runbook for your approval first. Outline:
1. Create a new Postgres in EU West.
2. `pg_dump -Fc` the old one, `pg_restore --no-owner --no-acl` into the new one.
3. Briefly pause writes, copy anything written in between.
4. Point `DATABASE_URL` on the API and the worker at the new database.
5. Check row counts and logs.
6. Delete the old database after a day of it working.
7. Move the API and the worker to EU West.

Do staging first as a rehearsal, then production. Needed before Phase 3.

### 3. Pilot outreach (you, now; the window closes Oct 20)
- Send gestorías to **https://tidybridge.dev/#gestorias**.
- Ask each one (roadmap 2.4): **which accounting software they use**, its
  import format, invoices per quarter, how invoices reach them (email,
  paper, WhatsApp photos).
- The 90-second demo video (2.1) needs extraction working, so it comes
  after step 4.

### 4. When a gestoría says yes: switch the LLM on
- **You:** Mistral account, training off (Admin Console → Privacy), API key.
- **Me (plan first, for your approval):** add Mistral as an extraction
  provider next to Claude, behind an `EXTRACTION_PROVIDER` setting. Only
  `call_model` in `src/tidybridge/extract.py` changes. Update the privacy
  page to name the real sub-processor.
- **You:** set the key on **staging only**, upload one real invoice and
  check the fields, the flags, and that re-uploading creates nothing new.
- **Me:** promote `staging` → `main` once that works. Production keeps the
  key off until per-user quotas exist (Phase 3).

### 5. After that
- **Export in the pilot's accounting software format** (roadmap 2.5).
  This is what completes the FDE story: invoices into the software the
  client already uses. Waits on the answer from step 3.
- **Eval** (Phase 1 Task 4): you label about 30 invoices
  (`evals/invoices/labels.jsonl`, real ones in the gitignored
  `evals/invoices/private/`); I run it on Mistral and Claude and put the
  numbers in the README.
- **Phase 3** (self-serve: store the original document, approve step,
  review screen, quotas, HEIC/multi-file upload) is shaped by what the
  pilot shows, so it waits for the pilot.

## Still open / parked

- **Manus API key** pasted in chat on 2026-09-27: revoke it if you
  haven't.
- **Autónomo status** (roadmap 0.4): needed before charging the first
  client.
- **Per-row "Edit" shortcut on the records table**: parked, not rejected.
- **Tax IDs in CSV uploads** aren't check-digit validated, only extracted
  invoices. Add if a client needs it.
- **Privacy page "doesn't train" claim** on `staging` names Anthropic. It
  gets rewritten for the real provider in step 4, before reaching `main`.

## How we work (reminders for the next session)

- Feature branch → PR into `staging` → you test → "promote" PR
  `staging` → `main`.
- If a promotion PR shows "BEHIND", merge `origin/main` into `staging`
  first. Also needed after a landing-only release like #76.
- Landing page previews: every PR gets a Vercel preview link in its
  comments (`tidybridge-landing` project). They need a Vercel login, so
  don't send them to clients.
- No browser automation unless you ask; you test in your own browser.
- **No subagents unless you ask.**
- **No "Co-Authored-By: Claude" lines** in commits or PRs.
- Plans get your approval before code; explain each step as it's done.
