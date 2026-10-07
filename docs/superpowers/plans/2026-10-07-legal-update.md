# Legal pages update: DPA, transfers, EU hosting, current product

From the 2026-10-07 review of `PrivacyPage.tsx` and `TermsPage.tsx`
against GDPR Arts. 13, 28 and 32 and the CC0 templates in
[General-Legal/legal-templates](https://github.com/General-Legal/legal-templates)
(`privacy-policy-gdpr`, `dpa-global`, `terms-of-use`). This is a
developer's good-faith draft, **not legal advice**: a Spanish lawyer
should read the result before the first paying gestoría.

Frontend only (`frontend/src/pages/`, `App.tsx`, `Layout.tsx`). No backend
changes.

## Ground truth the pages must match (checked in code / Railway, 2026-10-07)

| Who | What they get | Where | Client data? |
|---|---|---|---|
| Railway (US company) | API, Postgres, worker, crons, backups | **EU West, Amsterdam** (since 2026-10-07) | **Yes** |
| LLM provider: Anthropic today, Mistral likely | invoice PDFs/images, only when extraction is switched on (it's off) | US (Anthropic) / EU (Mistral) | **Yes, when on** |
| Vercel | static frontend files | US company | No (the browser talks to the API directly) |
| Resend | password-reset emails (`config.py`), and Gmail "send as" for `hello@` | US | No (account emails only) |
| Cloudflare | Email Routing for `hello@tidybridge.dev` | US company | No (emails people send you) |
| GitHub | optional login | US | No |

The split matters: only **Railway** and the **LLM provider** are
*sub-processors* of client data (they go in the DPA). The rest only touch
your users' own account data or emails (they go in the privacy page).

## 1. New page: Data Processing Agreement (`/dpa`)

Adapted from `dpa-global`, **EU parts only** (no US state annex, no Swiss
annex, no CCPA language). Plain English, same style as the current pages.
Covers GDPR Art. 28(3) point by point:

1. **Roles and scope:** the customer (the gestoría) is controller,
   tidybridge is processor, for the client and invoice data they upload.
   Subject matter, duration, nature and purpose, data types (names,
   emails, phones, tax IDs, invoice amounts), data subjects (the
   customer's clients and suppliers).
2. **Instructions:** process only to provide the service as configured
   (clean, validate, store, flag, export, forward to the customer's own
   webhook), and tell the customer if an instruction seems unlawful.
3. **Confidentiality:** only Victor has access; anyone added later is
   bound to confidentiality.
4. **Security (Art. 32):** an annex listing the **real** measures, each
   checked against the README/code when writing: TLS, hashed passwords,
   per-account data isolation (`owner_id`), least-privilege DB role,
   revocable sessions, rate limiting, 30-day backups, EU hosting, the
   review gate (flagged records don't leave until approved).
5. **Sub-processors:** the table above's two (Railway; the LLM provider,
   only when extraction is on), with location and transfer safeguard.
   Customer authorizes these; **30 days' notice** by email before adding
   or replacing one, with the right to object (and leave).
6. **Data subject requests:** help the customer answer them; the
   self-service delete and export already cover most.
7. **Breaches:** notify the customer **without undue delay, and within
   48 hours** of becoming aware, with what's known (gives them room for
   their own 72-hour AEPD deadline).
8. **End of service:** data deleted when the account is deleted
   (immediate, already true), backups age out within 30 days; the
   customer can export first.
9. **Audits:** information on request; an audit at the customer's cost
   with reasonable notice.
10. **International transfers:** client data stays in the EU (Railway
    Amsterdam), except invoice documents sent to a non-EU LLM provider,
    which happens only under the safeguard named in the sub-processor
    list.
11. **Invoice retention:** tidybridge isn't the archive. Spanish law's
    4–6 year invoice retention stays with the customer's accounting
    software; tidybridge keeps data up to one year.

**How it binds:** the Terms say the DPA forms part of them whenever a
customer uploads client data (clickwrap counts as "in writing, including
electronic form", Art. 28(9)). Linked from the Terms, the Privacy page and
the footer. A gestoría that wants a signed copy can get one by email; not
building e-signing.

## 2. Privacy page update

- **Where data lives:** new short section: hosted in the EU (Amsterdam).
- **International transfers (Art. 13(1)(f)):** new section naming which
  providers are US companies (Railway, Vercel, Resend, Cloudflare,
  GitHub, Anthropic if used) and the safeguard each relies on (EU-US Data
  Privacy Framework certification or Standard Contractual Clauses).
  **Each provider's mechanism checked on its own site when writing,** not
  assumed. Where one can't be confirmed, the page says SCCs only if their
  DPA confirms it.
- **Third parties list:** add **Cloudflare** (email routing); Resend also
  carries replies from `hello@`; Railway's location.
- **Legal bases:**
  - GitHub login: contract (Art. 6(1)(b)), not consent. It's a login
    method for the account contract.
  - New: IP addresses for rate limiting and security, and the 30-day
    backups: legitimate interest (Art. 6(1)(f)).
- **Rights:** add "withdraw consent" only if any consent-based processing
  remains after the change above (likely none, then omit).
- **Processor section:** link to the DPA.
- **LLM provider:** keep Anthropic as written while it's the code's only
  provider, but **drop "doesn't use it to train its models"** unless it's
  verified against Anthropic's current commercial terms when writing. The
  Mistral switch updates this paragraph in its own PR.
- "Last updated: October 2026".

## 3. Terms update

- **"What this is":** describe the current product: CSV/Excel and invoice
  uploads (extraction may be off), validation and flags, **flagged
  records wait for your review before being sent anywhere**, export,
  webhooks.
- **Human review is your job:** flags help, but you're responsible for
  checking data before using it in your accounting or tax filings.
- **Not an archive:** keep invoices in your accounting software for the
  legal retention period; tidybridge keeps data up to one year.
- **DPA clause:** the DPA forms part of these terms for client data.
- **Business use:** the service is for professionals using it for their
  business (keeps consumer-protection wording as is for anyone it still
  applies to).
- "Last updated: October 2026".

## Not doing now (and when)

- **Aviso legal (LSSI Art. 10: NIF, postal address)** on the app and the
  marketing site: when you register as autónomo / before charging.
- **Spanish versions** of the pages: when a gestoría asks, or with the
  Aviso legal.
- **Cookie banner:** still not needed (one strictly necessary cookie).
- **Notifying existing users of the change:** no paying users yet; the
  updated date is enough.
- **Lawyer review:** yours, before the first paid contract.

## Tests

- Vitest: `/dpa` renders; the footer, Terms and Privacy link to it.
- The Register and Complete Profile checkboxes keep linking Terms and
  Privacy (the DPA is reached through the Terms).
- Lint and build.

## Rollout

One PR into `staging`. You read the three pages there end to end (that's
the real review for this one), then promote. The marketing site is
untouched.
