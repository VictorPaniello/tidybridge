# Session handoff: 2026-10-28

Picks up from `2026-10-12-mistral-release-handoff.md`. Covers PRs
#128–#131, on the new Fedora laptop. Short version: **Phase 1 is closed**
(a realistic invoice extracts correctly from both a PDF and a phone photo,
and dedup works); a real **supplier/customer swap** bug was found and fixed
with a measured eval; the record page no longer shows developer
integrations to a gestoría. Victor decided to **improve the app before
outreach**; next up is **Spanish + English UI**.

## Where things stand right now

- `staging` = `main` + #126 (previous handoff) + #128–#131. **Not yet
  released to `main`.** Open a release PR (staging → main) when ready;
  production then gets C3 ("Upload file" only, since it has no Mistral key)
  and the hidden integrations.
- Extraction: on in staging (Mistral EU), off in production (unchanged).
- Local laptop: Postgres doesn't start at boot (`sudo systemctl start
  postgresql` before running tests). The Mistral key is now in local `.env`
  (Victor added it; never in chat).

## What was done

### C2 - formula-looking text flagged (#128)
Extracted text fields starting with `=`, `+` or `@` become an issue
("starts like a spreadsheet formula"). `-` left out on purpose (invoice
numbers like `-0042` are real). The CSV export already neutralizes them
(#117/#118); this makes them visible in review. The old stash with this
test was on the old laptop; rewritten.

### C3 - upload button only offers invoices where extraction is on (#129)
`/health` reports `extraction`; the records page shows "Upload file or
invoice" + PDF/images only where it's true, else "Upload file" + CSV/Excel.

### Supplier/customer swap (#130) - the important one
- Found testing on staging: the same PDF came back once with the
  **customer** ("Facturar a") as supplier, marked **Clean**. The swapped
  tax ID also broke dedup (key = `supplier_tax_id` + `invoice_number`), so
  a re-upload became a second record.
- Cause: nothing told the model who the supplier is (field was just
  "Supplier Name", one party slot, no prompt definition).
- Fix: field descriptions + one prompt sentence defining supplier
  (issues, gets paid) vs customer (under *Facturar a / Cliente /
  Destinatario*); new fields **`customer_name`, `customer_tax_id`**
  (normalized + check digit validated); same tax ID on both parties →
  issue. `examples/schema.yaml` and `frontend/src/lib/fieldNames.ts`
  include the new fields.
- **Real eval** (`mistral-ocr-4-1`, 10 runs per file, ~$0.20 total):
  PDF 8/10 → **10/10**, photo 10/10 → 10/10. One invoice only: an
  improvement, not proof of 0%. The ~30-invoice eval is still the real check.
- Verified on staging afterwards: correct parties, Clean, and re-upload
  shows "1 already ingested".

### Hide developer integrations (#131)
`/health` also reports `webhooks` / `provisioning` (whether
`WEBHOOK_URL` / `PROVISIONING_URL` are set - server config, not roles).
New `useHealth()` hook (`frontend/src/lib/health.ts`) used by the records
and record detail pages. Each section shows only if configured **or** the
record already has history there; delete dialogs mention webhook history
only when webhooks are on. If staging still shows them, `WEBHOOK_URL` is
set on Railway staging - unset it for demos.

### Test invoice (private, not in git)
`~/Downloads/tidybridge-test-invoice/`: `factura-F-2026-0117.pdf`, a
phone-photo version `-foto.jpg`, the `.html` source, and `party_eval.py`
(runs real extraction N times per file and counts party mix-ups:
`uv run python ~/Downloads/tidybridge-test-invoice/party_eval.py 10 <files>`,
~$0.005 per call). All data made up; NIF `12345678Z` and CIF `B65432106`
have valid check digits. Expected values: supplier Laura Martí Soler /
12345678Z, customer Ferretería Roca e Hijos, S.L. / B65432106, F-2026-0117,
2026-10-27, EUR, 1130.00 / 237.30 / 169.50 / 1197.80.

### Vercel missed a push
The #130 merge (`960462e`) got **no Vercel deployment at all** (not
skipped, not failed - absent), so the staging frontend was stale while
Railway had the new backend. Fixed with Vercel → Deployments → ⋯ →
**Create Deployment** → `staging`. ("Redeploy" would rebuild the old
commit.) #131 deployed normally. If it happens again, look at the GitHub →
Vercel integration, not at `ignoreCommand` (that would show a canceled
build, not nothing).

Also: after merging, wait for **both** Railway and Vercel to finish before
testing - the first retest of #130 hit the old backend by ~1 minute.

## What's next

### Claude: Spanish + English UI (agreed plan)
- No i18n library: a small `i18n.ts` with `es` and `en` dictionaries and
  `t("key")`. **Spanish by default**; language picker in Settings, stored
  in the browser.
- Column headers from dictionaries too ("IVA", "NIF proveedor"...) instead
  of humanized field names ("Vat Amount").
- Backend issue texts are English: add a stable `code` to each issue
  (e.g. `tax_id_check_digit`) and translate in the frontend.
- Fix while there: "1 rows processed", "Client records" title on an
  invoice page, "Flagged" vs "Needs review" (same state, two names),
  "Ingested"/"Already ingested" jargon.
- Landing and legal pages are **not** in this phase.
- PRs: (2) i18n + main pages (records, upload history, record detail);
  (3) the rest (login, register, settings) + backend issue codes.

### Pilot readiness: what the app still needs before the first gestoría
Checked against the code and `plans/2026-09-27-invoice-roadmap.md`.
Split into what blocks a pilot, what's worth having, and what to **ask**
the gestorías rather than build.

**A. Blocks a pilot** (the demo works without these)
1. **Production can't extract.** No Mistral key there until the monthly
   quota (3.5), because signup is open. Staging is no alternative: its DB
   isn't in the EU yet, so no real client data there. Cheaper than the
   quota: **invite-only signup** (an allowlist of emails, env var) plus
   Mistral's €10 spending cap as the backstop. Small PR, then the
   production key.
2. **The original document isn't stored** (3.1). Every issue says "check
   against the document", but the document is gone after extraction.
   Reviewing needs the invoice beside the fields (3.4). Without it,
   review is awkward and it shows in a demo.
3. **One file per upload, no HEIC** (3.6). Quarter end is 50–200
   invoices; iPhones save photos as HEIC by default and the picker
   refuses them. A gestoría trying their own iPhone in a demo fails.

**B. Worth having before the pilot**
4. **Error alerts.** If an extraction fails for a pilot today, nobody
   finds out. A simple alert on Railway logs is enough to start.

**C. Ask, don't build** (questions for outreach; answers shape Phase 3+)
- Invoices with **several VAT rates** (21% + 10%): we store one
  `vat_amount`; the *libro registro* needs base and cuota per rate.
- **Grouping by the gestoría's client**: each gestoría handles dozens of
  autónomos; the app has no such concept.
- **Issued vs received** invoices; which **accounting software** (2.5);
  **several users** per gestoría?

**Proposed order:** i18n → original document + side-by-side review
(3.1 + 3.4) → multi-file + HEIC (3.6) → invite-only signup + production
key. About 5–6 PRs. **That's the line: then outreach starts**, even with
things left to improve. Everything in C is the gestorías' call.

### Product docs, brand and marketing (Paney/Pansch style)
Victor wants Tidybridge documented like `~/Developer/Paney` and
`~/Developer/Pansch`: `docs/PRD.md`, `TRD.md`, `DESIGN-BRIEF.md`,
`APP-FLOW.md`, `IMPLEMENTATION-PLAN.md` (Paney also has `DATA-SCHEMA.md`),
each with figures drawn by `docs/generate.py` into `docs/img/*.png` (screens,
flows, diagrams, made-up data, real brand fonts, rendered by headless
Chrome), plus a `Brand/` kit (brand board, logos, symbol, wordmark, icons,
`generar.py` + export script). Same section skeletons as Paney:
- **PRD**: problem, who it's for, goals/non-goals, what it does,
  roadmap, success, constraints, open questions.
- **TRD**: platform, architecture, decisions, build/deploy, data flow,
  security and privacy, quality bar, technical debt.
- **DESIGN-BRIEF**: brief, brand foundations, principles, colour, type,
  layout, components, key screens, motion, voice and copy, accessibility,
  assets.
- **APP-FLOW**: navigation, ways in, journeys (J1 signup → first upload →
  review → export; quarter-end batch; invoice by email once hello@ exists),
  screens S01…
- **IMPLEMENTATION-PLAN**: the phases above, each with time and risks.

**Differences from Paney, decide first:**
1. **The tidybridge repo is PUBLIC** (Paney/Pansch are private). The
   TRD, APP-FLOW, DESIGN-BRIEF, IMPLEMENTATION-PLAN and screen images can
   live in the repo's `docs/`. The **PRD's business parts** (pricing,
   competitors, pilot targets) and the **marketing plan** should not: put
   them in the private brand folder.
2. **The brand mostly exists** in `~/projects/tidybridge-brand` (private):
   lockup, mark, wordmark, Geist, colours, guidelines page on claude.ai,
   ES/EN decks for gestorías and FDE, pilot one-pager, LinkedIn banner,
   avatar, OG image, email signature, outreach guide. Missing vs Paney:
   a consolidated brand board and a check that the **app UI** uses the brand
   tokens (the landing does). Don't redo the brand; extend it.
3. **`tidybridge-brand` has no git and no backup.** Losing the laptop
   loses the whole kit. First step: `git init` + a **private** GitHub repo.

**Marketing and publicity: a plan to write, not to run yet.** Draft as
`MARKETING.md` in the brand folder:
- Audience: Spanish gestorías (ICP: small, 2–10 people, many autónomo
  clients). A second, technical audience exists (FDE deck, open source).
- Channels, warmest first: personal network and intros → walk-ins/calls
  → founder posts on LinkedIn (build in public, the eval numbers, one
  pilot case study once there is one) → **colegios/asociaciones de
  gestores administrativos** (talks, newsletters) → partner listings in
  accounting software marketplaces (once 2.5 exists) → Spanish content/SEO
  ("automatizar facturas gestoría") → small, high-intent Google Ads only
  after a pilot converts. Developer side: GitHub README, a "Show HN"-style
  launch of the open-source pipeline.
- Rules: **no mass cold email** (LSSI art. 21); B2B prospecting on
  legitimate interest, with opt-out; never advertise an accuracy number
  before the ~30-invoice eval exists; "24 h" vs "2 working days" decided
  first.

**Order:** the PRD (short, it sharpens the outreach questions) and the
brand-folder backup now; the rest of the docs alongside the build phases;
don't let docs delay outreach.

### Victor
1. Release staging → main (and check both production deployments).
2. Proton Mail for hello@ (pilots need somewhere to send invoices).
3. Collect ~30 invoices for the eval.
4. "24 h" vs "2 working days" on deck/landing.
5. Put a limit on pre-outreach polishing - nobody says what's missing
   until they see it.

### Still open from before (unchanged)
Lawyer reads `/privacy`, `/terms`, `/dpa` (now also: customer names/tax
IDs are extracted - check the pages still describe the data correctly);
autónomo registration + Aviso legal; revoke the Manus API key; production
backup check; staging DB to EU West; redeploy the production backend on
Railway (new python image).

## How we work (reminders)
- Feature branch → PR into `staging` → you test → release PR to `main`.
  Every change gets its own new PR.
- Plans before code; explain each step. Be critical, including about
  Claude's claims.
- No browser automation, no subagents, no co-author lines.
- Spend the least on paid APIs: tests mock Mistral; real calls only when
  they answer something a mock can't (today's party eval was one).
