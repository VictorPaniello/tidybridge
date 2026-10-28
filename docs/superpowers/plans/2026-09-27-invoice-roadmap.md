# Invoice Extraction Roadmap

Two goals, in this order:
1. **Earn an FDE position.** Show a real integration with AI in production, measured by evals, used by a real client.
2. **Launch a product.** Small Spanish gestorías/asesorías pay monthly to stop typing supplier invoices into their accounting software.

Each phase ends with an **exit check**. Don't start the next phase until it passes. Only Phase 1 has a detailed implementation plan today (`2026-09-27-invoice-extraction.md`). Each later phase gets its own detailed plan when it starts, because what we learn in the pilot will change it.

**Owner key:** 🧑 Victor (dashboards, people, legal, labeling) · 🤖 Claude (code, docs) · 🤝 both

---

## Phase 0: Prerequisites (🧑, run alongside Phase 1)

None of these need code, and some take days of waiting, so start them on day 1.

| # | Task | Why |
|---|---|---|
| 0.1 | Create an Anthropic Console account and API key; **set a monthly spend limit** (e.g. $20) | Caps the damage from a bug or abuse before quotas exist |
| 0.2 | Accept Anthropic's DPA in the Console (Settings → Legal) | Needed before any real client document goes through the API |
| 0.3 | Set `ANTHROPIC_API_KEY` on **staging only** (Railway) | Production has open registration and no quota yet (see Phase 3) |
| 0.4 | Check your self-employed (autónomo) status or how you'd invoice legally | You can't charge the first client without it |
| 0.5 | Start collecting invoices for the eval set (your own, public samples, generated) | Phase 1 Task 4 is blocked on about 30 labeled documents |
| 0.6 | Finish the pending Postgres move to EU West | EU clients will ask where their data lives; must be done before Phase 3 |

**Exit check:** API key works on staging, a spend limit is set, the DPA is accepted, and at least 10 invoices are collected.

---

## Phase 1: Extraction MVP (🤖 builds, 🧑 labels) · about 2–3 days

**Goal:** a PDF or photo of an invoice uploaded on staging becomes a validated, deduplicated record, and you have real accuracy numbers.

**Detailed plan:** `docs/superpowers/plans/2026-09-27-invoice-extraction.md`

| Task | What |
|---|---|
| 1 | `extract.py`: Claude structured output, invoice → rows, trustworthy flags (uncertain fields, totals arithmetic including IRPF), tax ID normalization, token usage logged per call, credit notes and European dates in the prompt |
| 2 | Wire it into `/records/upload`: invoice fields typed in `schema.yaml`, dedup on tax ID + invoice number, 400/502 errors |
| 3 | Frontend upload accepts invoices; README section; privacy page lists Anthropic |
| 4 | Eval script plus about 30 labeled invoices; first accuracy run committed |

**FDE output:** the README "Invoice extraction" section with real eval numbers. This is already enough to talk about in interviews.

**Exit check:** full test suite green, one real invoice processed on staging end to end, eval run committed, and the eval shows which model to use (Opus 5 vs Sonnet 5: accuracy vs cost per invoice).

---

## Phase 2: Concierge pilot (🧑 sells, 🤝 runs) · Oct 1–20 (Q3 VAT deadline), then ongoing

**Goal:** one real gestoría gets real value, with you running the tool for them. **No new product UI yet.** You are the review step. This tells us what Phase 3 actually needs before we build it.

Starts as soon as Phase 1 works on staging. Doesn't need Phase 1's eval to be finished.

| # | Task | Owner |
|---|---|---|
| 2.1 | 90-second demo video: messy phone photo → clean import file → a flagged invoice explained | 🧑 |
| 2.2 | One "for gestorías" section on the marketing site with the offer | 🤖 |
| 2.3 | Outreach: 20 gestorías in your city (walk in, LinkedIn, the regional association of gestores). Offer: *"Send me last quarter's invoices for one client; within 24h you get them back ready to import into your software, doubtful ones flagged. Free."* | 🧑 |
| 2.4 | For each pilot, find out: **which accounting software they use**, its import format, their volume per quarter, how they receive invoices (email? paper? WhatsApp photos?) | 🧑 |
| 2.5 | Build **export in that software's import format** (an option on the existing `/records/export`) | 🤖 |
| 2.6 | Run their invoices yourself: upload, review, correct, export, deliver. Keep a log: time spent, every error, every question they ask | 🧑 |
| 2.7 | Add the pilot's real invoices (with permission, in `evals/invoices/private/`) to the eval set; rerun it | 🤝 |

**FDE output:** a case study covering the client's problem, what you built, what broke, and before/after numbers (hours saved, accuracy). **Start applying to FDE roles here.**

**Exit check:** at least one gestoría has used the results for a real quarter and said they'd pay (or paid), and you have a list of what they needed that the product doesn't do.

---

## Phase 3: Self-serve product (🤖 builds) · about 1–2 weeks

**Goal:** a gestoría can process a quarter without you in the loop, and nobody can run up your bill.

Informed by the Phase 2 log. This is the expected shape:

| # | Task | Why |
|---|---|---|
| 3.1 | **Store the original document** for each upload (Postgres to start, R2 later), deleted along with the upload; `GET /ingestion-runs/{id}/document` | Reviewers can't check a flag without seeing the document |
| 3.2 | **Edit and approve records**: `PATCH /records/{id}` (re-validates, change logged), `POST /records/{id}/approve` | Today a wrong value can't be fixed, only deleted |
| 3.3 | **Only push reviewed invoices downstream**: webhooks, provisioning and exports only for clean or approved records | Stops wrong numbers reaching the accounting software |
| 3.4 | **Review screen**: document on the left, fields on the right, flags highlighted, approve button | The daily workflow for the gestoría |
| 3.5 | **Monthly document quota per user**, checked before the model call | Protects your bill; the same mechanism the paid plans use |
| 3.6 | **Multi-file upload + iPhone photos (HEIC)** | Quarter-end means 50–200 invoices; iPhones default to HEIC |
| 3.7 | **Invoice view separate from client records** (filter by document type) | Mixing them is confusing |
| 3.8 | Spanish tax ID (NIF/CIF) checksum as another trustworthy flag | Catches misread tax IDs deterministically |
| 3.9 | Terms: tidybridge is a pipeline, not an invoice archive (the legal 4–6 year retention stays in their accounting software); human review is required | Resolves the conflict with the 365-day retention and limits your liability |

Only after 3.5 is done: set `ANTHROPIC_API_KEY` in **production**.

**Exit check:** the pilot gestoría processes their next batch alone, and a new signup can't exceed the free quota.

---

## Phase 4: Paid launch (🤝) · after Phase 3

**Goal:** first paying customers, then self-serve payment.

| # | Task | Owner |
|---|---|---|
| 4.1 | First 3–5 clients: invoice by hand, paid by bank transfer. **No Stripe yet** | 🧑 |
| 4.2 | Pricing, adjusted with the real cost per invoice from Phase 1: Pilot free (1 quarter, 300 invoices) · €49/month (500 invoices) · €149/month (2,500 invoices, multiple users) | 🧑 |
| 4.3 | Stripe Checkout (subscriptions) + Customer Portal + one webhook that sets the user's plan and quota; Stripe Tax for EU VAT | 🤖 |
| 4.4 | Cost dashboard: tokens → € per user per month, from the Phase 1 usage logs | 🤖 |
| 4.5 | Onboarding: signup → pick your accounting software → first upload | 🤖 |
| 4.6 | Referral ask to each paying gestoría (gestores know each other) | 🧑 |

**Exit check:** at least 3 paying customers, and your margin per invoice is positive after Anthropic costs.

---

## Later: build only when something triggers it

| Feature | Trigger |
|---|---|
| Direct API integration (Holded, etc.) | A paying client's software has an API and asks for it |
| Email-in (`invoices@…` forwarding) | Pilots say invoices arrive mostly by email |
| Line items | A client needs per-line accounting |
| Structured e-invoices as input (Facturae/UBL) | The B2B e-invoicing mandate (2027 for companies over €8M, 2028 for everyone) reaches your clients |
| Refusal fallbacks, batch API, prompt caching | The eval shows refusals, or the bill shows cost |
| EU inference location (`inference_geo`) | A client requires EU-only processing |

---

## Timeline at a glance

```
Day 1-3     Phase 0 (Victor, dashboards)  ║  Phase 1 (build)
Oct 1-20    Phase 2 concierge pilot, during the Q3 VAT deadline rush
            → case study → start FDE applications
Late Oct    Phase 3 self-serve (shaped by the pilot log)
Nov         Phase 4 first paying clients → Stripe once there are 3+
```
