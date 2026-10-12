# Session handoff: 2026-10-12

Picks up from `2026-10-07-eu-legal-release-handoff.md`. Covers PRs
#104–#105, the LLM provider research, and graphify. Short version: we
chose Mistral, then found that **Mistral's free plan can't create API
keys**. The provider decision is open again: **pay for Mistral, or use
Groq for free**.

## Where things stand right now

- `main` = `staging` + #104 (`.gitignore` only). No code changes today.
- **PR #105 is open:** the plan for the Mistral switch
  (`docs/superpowers/plans/2026-10-12-mistral-extraction.md`). **Don't
  merge it as is**: Task 0 assumes a free Mistral API key, and there
  isn't one. Either update it (if Mistral pay-as-you-go) or close it and
  write a Groq plan.
- Extraction is still **off everywhere** (no LLM key on staging or
  production).
- A Mistral account exists (Studio, signed up with **hello@tidybridge.dev**,
  "Default Workspace", training opt-out turned off). It's on the
  **Free plan**, which shows: "No hay ningún plan activo actualmente en esta
  organización, no puedes crear claves API". **No key exists, nothing is
  in `.env`, and no card has been added.**

## The LLM decision (what to pick up first)

### What we need from a provider ("lawful")
The invoices contain personal data (autónomos' names, NIFs, addresses).
The gestoría is the controller, Tidybridge the processor, and the LLM a
sub-processor. So, under GDPR Art. 28 and 44–46 and what `/dpa` already
promises:
1. a **DPA** with the provider,
2. **no training** on the data,
3. data **in the EU**, or a valid transfer safeguard (SCCs or the
   EU-US Data Privacy Framework),
4. listed on `/dpa` and `/privacy`.

### Checked on primary sources (input: github.com/mnfst/awesome-free-llm-apis)
- **Anthropic:** `inference_geo` is only `global` or `us`, and workspace
  storage is only US. So it can never be "EU only". Kept as the eval
  benchmark.
- **Gemini free:** its terms say "only Paid Services when making API
  Clients available to users" in the EEA. Ruled out.
- **OpenRouter / Kilo / LLM7 / Hugging Face / Ollama Cloud:** route to
  providers that may log or train, and give you no contract. **NVIDIA:**
  "do not submit personal or confidential data". **Cohere trial:**
  non-commercial use only. **Z AI / ModelScope / SiliconFlow:** Chinese,
  with real-name ID checks. **OVHcloud free:** anonymous, so no DPA. All ruled out.
- **Mistral:** EU-hosted by default (EU endpoint `api.eu.mistral.ai`
  costs 1.1x). Its DPA applies to API customers. 30 days' retention for
  abuse monitoring; zero data retention on paid plans only. Feedback
  (thumbs) and Labs/preview models aren't covered by the training
  opt-out. OCR 4.x: **$5 per 1,000 annotated pages**. Its docs still say free API
  access needs no card, **but the console says otherwise** (see above).
- **Groq free:** DPA built into the Services Agreement ("electronic
  acceptance … constitutes Customer's signature to the DPA"), with the SCCs
  deemed signed. No training on customer data. No retention by default,
  and zero data retention available to every customer. 15 days' notice of
  sub-processor changes. **US-based.** Only vision model: `qwen/qwen3.8-27b`,
  **max 3 images per request, no PDFs**. Open question: does a **free**
  signup accept the Services Agreement (needed for the DPA) or only the
  website's terms of use?
- **Cloudflare Workers AI free:** doesn't train on customer content; DPA
  under DPF/SCCs, but "from the date … Customer signed or … otherwise
  agreed". Unclear whether it covers free accounts. US. No PDFs.

### The two real options
| | **Mistral pay-as-you-go** (Claude's recommendation) | **Groq free** |
|---|---|---|
| Cost | about $1 per pilot gestoría (200 invoices); set a spending cap of about $5/month | €0, until the free limits change |
| "Data stays in the EU" | **Yes** | **No:** `/dpa` and `/privacy` must name a US sub-processor plus SCCs |
| Code | small: PDF/image in, JSON schema out (plan in #105) | more: PDF → page images (use `pypdfium2`, **not PyMuPDF, which is AGPL**), max 3 pages per call |
| Accuracy | dedicated document OCR model | general 27B vision model, untested |

**Next step for Victor:**
- **Mistral:** in Studio click **Actualizar**, screenshot the options
  *without confirming*, then decide. If paying, add a spending cap at once
  and create the key `tidybridge-staging`.
- **Groq:** sign up with hello@, confirm the agreement you accept is the
  **Services Agreement**, and turn on zero data retention in Data Controls.

Either way the key goes **only** in local `.env` and on Railway **staging**,
never in chat. **Production gets no key** until the monthly quota exists
(roadmap 3.5), because of open signup.

### Plan #105 notes (if Mistral)
- `call_model()` keeps its signature. It dispatches on `EXTRACTION_MODEL`:
  `claude-*` goes to Anthropic (eval only, never on a server), anything else
  to Mistral `POST /v1/ocr` with `document_annotation_format` set to json_schema,
  using plain `httpx` (no SDK).
- Unknowns still to settle in Task 0: whether the EU endpoint serves OCR,
  the pinned model id, Mistral's sub-processor list (trust.mistral.ai,
  and subscribe hello@ to changes), Mistral's page limit for annotations, and
  whether `"strict": true` accepts pydantic's `$defs` schema.

## graphify (installed on the old laptop only)
- The `graphify` command-line tool (`uv tool install graphifyy`) and the
  `/graphify` skill (`graphify install`; it also added a 3-line section to
  the global `~/.claude/CLAUDE.md`).
- Git hooks (`graphify hook install`): post-commit and post-checkout
  rebuild the **code-only** graph in the background (no LLM). Log:
  `~/.cache/graphify-rebuild.log`.
- **Skipped on purpose:** `graphify claude install` (it adds hooks that nudge
  Claude before every search or file read, and edits the project's CLAUDE.md),
  and the docs/PDF "meaning" pass (it needs subagents).
- Output is in `graphify-out/` (gitignored in #104). Open
  `graphify-out/graph.html`.
- **On the new device:** none of this exists. To repeat it:
  `uv tool install graphifyy && graphify install && cd ~/projects/tidybridge && graphify hook install && graphify update .`
  Then delete the `.gitattributes` it creates (not needed, because graph.json is
  never committed).
- Obsidian: graphify can export to it (`graphify export obsidian`). Not
  worth it unless you start using Obsidian anyway.

## Leftovers on the old laptop
- An untracked `.gitattributes` (from `graphify hook install`): delete it.
- A local branch `docs/mistral-extraction-plan`, which is PR #105.

## Still open from 2026-10-07 (unchanged)
1. **Pilot inbox:** Proton Mail Plus for hello@. Blocks accepting
   invoices by email.
2. Small fixes: hide "or invoice" on the upload button while extraction
   is off; landing "24 hours" → "2 working days" (your call).
3. Product: store the original document (3.1), monthly quota (3.5),
   export in the pilot's accounting format (2.5).
4. Yours: a Spanish lawyer reads `/privacy`, `/terms`, `/dpa`; autónomo
   registration + Aviso legal; **revoke the Manus API key**; production
   backup check; pilot outreach (until 2026-10-20).

## How we work (reminders)
- Feature branch → PR into `staging` → you test → promote. **Every change
  gets its own new PR.**
- Plans get approval before code; explain each step as it's done.
- Be critical, including about Claude's own claims. Today's example:
  "Mistral free has API access" came from Mistral's docs and turned out
  wrong; the console is what counts.
- No browser automation, no subagents, no co-author lines unless asked.
- Customer-facing contact is always `hello@tidybridge.dev`.
