# Session handoff: 2026-10-12 (afternoon)

Picks up from `2026-10-12-llm-provider-handoff.md`. Covers PRs #108–#125.
Short version: **invoice extraction runs on Mistral (EU) on staging**, the
CSV export carries invoice fields safely, the landing has a real footer, and
the legal pages moved to `tidybridge.dev`. Extraction is still **off in
production** (no key until the quota exists). The next thing that matters is
**gestoría outreach before 20 Oct**, not more code.

## Where things stand right now

- **Release #125 is open** (staging → main): the legal pages on
  tidybridge.dev (#123) plus the search placeholder (#124). Merge it; then
  check both Vercel production deployments are Ready, that
  `tidybridge.dev/privacy` renders, and that `app.tidybridge.dev/privacy`
  redirects there. Until it ships, staging's legal links 404 (they point at
  production's landing).
- Everything else is in production: releases #113, #115, #122.
- **Local leftover:** `git stash@{0}` holds C2's unfinished test
  (`test_formula_looking_text_is_flagged`). Pop it when doing C2, or drop it.

## What was done

### Mistral extraction (#108, #109)
- Plan #105's Task 0 was fixed for pay-as-you-go (#108). Victor's Mistral
  account: **pay-as-you-go, €10/month spending limit**, key
  `tidybridge-staging` in local `.env` and on Railway **staging** only.
  Training opt-out and Labs both off. Zero data retention isn't
  self-serve (so the pages keep "up to 30 days"). hello@ is subscribed to
  sub-processor changes.
- Task 0 test calls (about $0.07, made-up invoices): `POST /v1/ocr` on
  `api.eu.mistral.ai` with `mistral-ocr-4-1` and a strict pydantic `$defs`
  schema works; 12 pages didn't hit a limit.
- #109: `call_model()` goes to Mistral by default; a `claude-*`
  `EXTRACTION_MODEL` still goes to Anthropic, for evals only.
  - **IRPF withholding** is stored positive, negative on a credit note (the
    model returns it as printed, e.g. −150, which broke the totals check).
  - `/dpa` and `/privacy` name Mistral AI. Hosting and inference are in the
    EU, but Mistral's security and network providers include non-EU ones
    (Cloudflare, CrowdStrike, affiliates), so the pages carry one SCC/DPF
    sentence and link Mistral's sub-processor list. Lawyer still to review.
- Verified on staging end to end with a made-up PDF
  (`factura-prueba-F-2026-0042.pdf`). **A real invoice of Victor's own has
  not been tested yet.**

### Records and export (#110, #111, #116–#118, #120, #121, #124)
- X icon on dismiss buttons (#110); error banners can be dismissed (#121).
- Fields in `schema.yaml` order, and invoices link by supplier name, not
  currency (#111). JSONB reorders keys shortest-first, so order comes from
  the schema.
- **Export CSV includes invoice fields** (#116): columns come from the
  records' own fields, schema order first.
- **CSV injection guard** (#117, #118, found by the background security
  review): text cells starting with `= + - @`, tab or CR get a `'` prefix;
  only plain numbers (`[+-]digits[.digits]`) are left alone.
- **Export never worked on staging** (#120): it was the one call that built
  its own `fetch` and skipped the staging gate header. Production was never
  affected (no gate there). All calls now share `apiHeaders()`.
- Search box says "Search records…" (#124).

### Landing (#112, #114, #119, #123)
- Three-column footer (Product, Open source, Legal) with the full logo
  (#112, #114). **The lockup is now public with Victor's consent**, inlined
  as `marketing/src/components/Logo.tsx`; nothing else from the brand kit.
- #119: each Vercel project skips its build when its folder didn't change
  (`ignoreCommand`). Skipped builds can show as "Error"/"Canceled" in
  Vercel's list.
- #123: legal pages at `tidybridge.dev/privacy`, `/terms`, `/dpa` (Vite
  multi-page + Vercel `cleanUrls`); header/footer shared via
  `marketing/src/site.tsx`; the landing now has vitest and CI runs it.

### Vercel failures today (not our code)
"Git information retrieval failed" on random deployments from 12:22 UTC:
a **GitHub incident** (Actions, Pull Requests, Issues). Redeploy fixes it.
If it keeps happening after GitHub resolves the incident, look again.

### Outreach guide (private)
`~/projects/tidybridge-brand/output/tidybridge-outreach-guide.pdf`
(built by `scripts/build_outreach.py`): the 8-day plan, channels from
warmest to coldest, Spanish scripts (WhatsApp intro, LinkedIn, call/visit,
follow-up), the four questions, objections, and a printable contact log.
For Victor only. The pitch itself is the existing deck and one-pager.

## What's next

### Victor (this week, before 20 Oct)
1. **Outreach**: network intros first, then walk-ins/calls, then LinkedIn.
   **No mass cold email** (LSSI art. 21). Log every contact.
2. Merge release #125 and do the three checks above.
3. A real invoice of your own on staging (closes Phase 1).
4. Proton Mail for hello@ (pilots need somewhere to send invoices).
5. Decide "24 h" vs "2 working days" (deck and landing say 24 h).
6. Collect ~30 invoices for the eval (then about €0.15 to run on Mistral).

### Claude (when asked)
- **C2**: flag extracted text fields starting with `= + @` as issues
  (`extract._issues`); test is in the stash.
- **C3**: hide "or invoice" on the upload button where extraction is off.
  Needs the frontend to know; plan first (likely a small backend flag).
- **2.5**: export in the pilot's accounting software format, once known.
- Phase 3 after a pilot says yes: 3.1 store the original document, 3.5
  monthly quota (then the production key), 3.6 multi-file + HEIC, 3.7
  invoices separate from client records.

### Still open from before (unchanged)
Lawyer reads `/privacy`, `/terms`, `/dpa`; autónomo registration + Aviso
legal; revoke the Manus API key; production backup check; staging DB to
EU West.

## Memory notes changed on this PC
- `invoice-extraction-direction`: Mistral pay-as-you-go chosen, Task 0
  results, the IRPF sign fix.
- `brand-kit-private`: the lockup is public on the landing with consent.

## How we work (reminders)
- Feature branch → PR into `staging` → you test → release PR to `main`.
  Every change gets its own new PR. Keep `staging`.
- Plans before code; explain each step. Be critical, including about
  Claude's claims. Today: the "Vercel concurrency limit" theory was wrong;
  the real cause was a GitHub incident, found only once the actual error
  message was read.
- No browser automation, no subagents, no co-author lines.
- Spend the least on paid APIs: tests mock Mistral; real calls only when
  they answer something a mock can't.
