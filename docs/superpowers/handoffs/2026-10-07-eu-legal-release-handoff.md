# Session handoff: 2026-10-07

Picks up from `2026-10-03-review-gate-handoff.md`. Covers PRs #93–#102.
Short version: Railway is sorted and everything runs in the EU; the legal
pages were reviewed claim by claim and now include a DPA; a public
webhook test URL that would have leaked client data was removed; and
everything on `staging` is now in production (#102).

## Where things stand right now

- **`main` = `staging`** (full release #102, merged and checked live).
  Production has the review gate, the records page work, `/dpa` and the
  updated legal pages, and the invoice extraction code (switched **off**:
  no `ANTHROPIC_API_KEY`, so PDF uploads get a clean 400).
- **Railway:** Hobby plan. **Every service in production and staging is
  in EU West (Amsterdam).** The staging worker now deploys `staging`.
- Tests: 227 backend, 53 frontend. CI green on every PR. No open PRs.
- **Local Postgres doesn't start on boot.** To run backend tests
  locally: `sudo systemctl start postgresql` (or rely on CI).

## Today, in order

### Railway (done by you)
- Hobby plan, so the Oct 10 credit deadline is gone.
- Staging webhook worker → branch `staging`.
- **EU West migration** with Railway's region dropdown: Postgres first
  (the volume migrates by itself, short downtime, works on Hobby), then
  the API, worker and crons. Production, then staging. Records intact,
  health check OK. My earlier claim that Postgres needed a manual
  dump/restore was wrong; Railway's docs say the dropdown migrates
  volumes.

### Legal review → `/dpa` and fixes (#93, #94, #98, #101)
Reviewed `/privacy` and `/terms` against GDPR Arts. 13/28/32 and the CC0
[General-Legal templates](https://github.com/General-Legal/legal-templates)
(`dpa-global` was the useful one; the privacy and terms templates are
US-centric).
- **New `/dpa` (GDPR Art. 28):** the only sub-processors of client data
  are **Railway** (EU West, SCCs) and the **LLM provider** (only when
  extraction is on; today Anthropic: SCCs, contractually no training).
  It also has a security annex of measures that really exist, 30 days'
  notice for new sub-processors, breach notice "without undue delay, and
  where possible within 48 hours", "not an invoice archive" (4–6 years
  stays with the customer), eval use of invoices only with written
  permission, and a **free-pilot section** (DPA accepted by email
  *before* any invoices; the email provider is named in that email;
  copies deleted after delivery).
- **Privacy:** EU hosting, a transfers section where each US provider's
  safeguard was checked on its own site (DPF: Vercel, Resend, Cloudflare,
  GitHub; SCCs: Railway, Anthropic), Cloudflare added, legal bases fixed
  (GitHub login under contract; IPs, logs and backups under legitimate
  interest), server logs disclosed.
- **Terms:** the current product, "checking the results is your job",
  "not an archive", the DPA clause, business use.
- **Contact everywhere is `hello@tidybridge.dev`** (#101, with a test).
- It's a developer's draft: **a Spanish lawyer should read it before the
  first paid contract.**

### The webhook.site leak (closed)
Production had `WEBHOOK_URL` pointing at a public **webhook.site** test
URL: every clean or approved record from any account would have been
posted where anyone with the link could read it. Only your test data
had reached it. **Removed from the API and the worker; staging never had
it.** Webhooks are a global server setting, not per customer, so the
legal pages now say the hosted service forwards to no webhook.

### Worker hotfix (#96, → `main`)
Removing `WEBHOOK_URL` while a delivery was queued would crash the
worker in a loop (`httpx.post(None)` → `TypeError`). The worker now
leaves jobs pending when the URL isn't set (same for `PROVISIONING_URL`).

### Landing (#99 → `main`, from #95 + #98)
Redesign (two-audience split, motion, a11y), plus copy that matches the
product:
- no "not pooled into a shared store" (records share one table,
  isolated per account);
- no "every new record fires a webhook";
- no totals check (it only runs in extraction);
- the pilot promises **a clean spreadsheet within 24 hours** (option a),
  not an accounting-software import, plus "you get a DPA to accept
  before sending invoices".

### Full release (#102, staging → main)
Checked live: `/health` OK, the new approve endpoint answers 401 (not
404), the live bundle has `/dpa`, "Needs review" and hello@, and `/docs`
is 404 (API docs off).

## Next days

### 1. Pilot email inbox (you, before any pilot sends invoices)
Personal Gmail has no DPA with Google, so pilot invoices can't land
there. Decided: **Proton Mail Plus** (€3.99/month yearly) as a real
mailbox for `hello@`, not a redirect. Proton's DPA applies automatically
to any business user; mail stays in Switzerland (EU adequacy, no
transfer to justify).
1. Buy Mail Plus, add `tidybridge.dev` as a custom domain.
2. Cloudflare DNS: turn off Email Routing for `hello@`, use Proton's MX,
   add Proton's DKIM.
3. **SPF: one record for both Proton and Resend** (Resend sends the
   app's password resets). Send me the current SPF record first and I'll
   write the merged one.
4. Stop Gmail's "send mail as" for `hello@`.
5. Then I update `/privacy` (Cloudflare out, Proton in) and you name
   Proton in the pilot DPA email.

**Until this is done, don't accept invoices by email.**

### 2. LLM provider: research, then choose (me, plan first)
Goal: the provider that's best for the DPA and the gestorías, not just
the cheapest. Today the DPA names Anthropic (US, SCCs). An EU-hosted
provider would make the DPA's "your data stays in the EU" true with no
exceptions. Research and compare, on primary sources:
- **Mistral** (France, EU-hosted; the earlier lean, with a free
  Experiment tier with training opt-out): DPA terms, data retention,
  whether the free tier's terms allow processing client data, PDF and
  image support, JSON schema output, price per 1k pages.
- **Anthropic with EU data processing** (if available on the API):
  the DPA, where inference runs, price.
- Any other EU option worth a look (for example an EU-region deployment
  on a major cloud), only if it beats both.
- For each: is it a processor under a DPA, where is data processed and
  stored, retention, training, sub-processors, price per invoice, and
  extraction quality (decided by the eval on ~30 labeled invoices).

Output: a short comparison and a recommendation for your approval. Then
the provider switch (code + `/privacy` + `/dpa`) as its own PR.

### 3. Small fixes (me, quick PRs)
- **Hide "or invoice" on the upload button** while extraction is off
  (today it accepts PDFs and production refuses them).
- **Landing "24 hours" → "2 working days"?** Your call: extraction is
  off, so a quarter (50–200 invoices) by hand in a day is heavy.

### 4. Product (me, plans first)
- **Store the original document (roadmap 3.1):** for invoices, "review"
  means checking the flag against the PDF, and today it isn't kept.
- **Monthly document quota (3.5):** production can't get an LLM key
  without it.
- **Export in the pilot's accounting-software format (2.5):** once a
  gestoría says which software it uses.

### 5. Yours, outside the code
- **A Spanish lawyer** reads `/privacy`, `/terms`, `/dpa` before the
  first paid contract.
- **Autónomo status** before charging; then the **Aviso legal** (NIF,
  address) on the app and the landing (LSSI Art. 10).
- **Revoke the Manus API key** pasted on 2026-09-27.
- **Production backup check:** run `tidybridge-backup` once with
  "Run now" and confirm it succeeds in EU West, and glance at the next
  retention run.
- Pilot outreach (until 2026-10-20), once the inbox is ready.

## Still open / parked
- WIP branch `fix/upload-missing-required-column` (one commit, no PR):
  keep or delete.
- `~/projects/tidybridge-backup-2026-10-02.bundle` can be deleted.
- Unresolved, and doesn't matter any more: whether the API was ever in
  EU West before today (my old notes say yes, you say no).
- Records-page filters not built (triggers in the #89 plan).

## How we work (reminders for the next session)
- Feature branch → PR into `staging` → you test → promote. Landing-only
  changes can go to `main` by cherry-pick, then merge `main` back into
  `staging` (history-only PR).
- **Every change gets its own new PR.**
- **Be critical:** say plainly when something is wrong, including what
  you say.
- Customer-facing contact is always `hello@tidybridge.dev`.
- Plans get your approval before code; explain each step as it's done.
- Brand and sales material is private; no browser automation, no
  subagents, no co-author lines, unless you ask.
