# Switch invoice extraction to Mistral Document AI: Implementation Plan

> **For agentic workers:** Victor runs this inline, with no subagents: use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invoice PDFs and images are read by Mistral Document AI, hosted in the EU, instead of Anthropic in the US. The legal pages name Mistral as the only LLM sub-processor. Claude stays callable for the eval comparison only.

**Architecture:** `extract.call_model()` keeps its signature `(content: bytes, media_type: str) -> ExtractedInvoices`, so `ingest.py`, `main.py` and every test that monkeypatches it stay unchanged. Inside, it dispatches on `settings.extraction_model`: a `claude-*` id goes to the existing Anthropic code and anything else goes to Mistral's `POST /v1/ocr`. That endpoint takes a JSON schema (`document_annotation_format`) and returns the filled JSON as a string (`document_annotation`). Mistral is called with plain `httpx`, which is already a dependency, so no SDK is added.

**Tech Stack:** Python 3.11, httpx, pydantic, pytest, React + vitest (legal pages).

**Spec:** the LLM research and Victor's approval (2026-10-12, in chat; summarized in the 2026-10-07 handoff, "Next days #2"), plus `docs/superpowers/plans/2026-09-27-invoice-extraction.md` for how extraction works today.

## Global Constraints

- The provider is **Mistral AI (France)**. Use the EU endpoint `https://api.eu.mistral.ai` if Task 0 confirms that it serves the OCR model.
- **Never send thumbs-up/down feedback to Mistral**, because its DPA §2.3 lets it train on feedback even with the opt-out. **Never use Labs or preview models**, because the opt-out doesn't cover them.
- The API key is never pasted in chat or committed. It goes only in `.env` locally and in Railway variables.
- **Production stays off**: no `MISTRAL_API_KEY` on production until the monthly quota exists (roadmap 3.5). Production has open signup.
- Every change goes in its own PR into `staging`. Customer-facing contact is `hello@tidybridge.dev`.
- No co-author lines in commits.

## Review Focus

1. **A multi-page PDF beyond Mistral's page limit for annotations.** Expect a clean 400 that says to split the file, never a 500. Task 1 has a test for this.
2. **Mistral returns 200 with `document_annotation: null` or JSON that doesn't fit the schema.** Expect a 400 ("couldn't be read"), not a crash. Task 1 has tests for both.
3. **429 from the free tier's rate limit, or 401 from a revoked key.** Expect a 502 ("try again in a minute"), and no ingestion run left behind. Task 1 has tests for both. The existing upload test covers "no run left behind".
4. **A JPEG or PNG invoice**, which must go as `image_url`, not `document_url`. Task 1 has a test for this.
5. **`EXTRACTION_MODEL=claude-…` with only `MISTRAL_API_KEY` set.** Expect "isn't enabled", never a call made with no key. Task 1 has a test for this.

---

### Task 0: Unknowns only Victor can settle (no code)

These decide one config default and the wording of the legal pages, so they come first.

- [ ] **Step 1: Put the key in local `.env`** (it's gitignored). Add the line `MISTRAL_API_KEY=<your key>`. Don't paste it in chat.
- [ ] **Step 2: Check that the EU endpoint serves OCR.** Run:
```bash
! set -a; . ./.env; set +a; curl -s https://api.eu.mistral.ai/v1/models -H "Authorization: Bearer $MISTRAL_API_KEY" | grep -o '"id":"[^"]*ocr[^"]*"' | sort -u
```
Expected: one or more ids such as `"id":"mistral-ocr-…"`. **If there's at least one**, `mistral_api_base` defaults to `https://api.eu.mistral.ai` and the pages can say "processed in the EU". **If there's none**, run the same command against `https://api.mistral.ai`, use that as the default, and Task 3 keeps a "may be processed outside the EU" sentence.
- [ ] **Step 3: Choose the pinned model id.** From that list, take the newest **stable** dated OCR id, not `-latest`, so eval results stay comparable. It becomes the `extraction_model` default in Task 1.
- [ ] **Step 4: Check Mistral's sub-processors.** In the Trust Center → Subprocessors tab, note which ones are outside the EU and what for. Subscribe hello@ to change notices. Send me the list; it decides Task 3's wording.

### Task 1: Mistral call in `extract.py`

**Files:**
- Modify: `src/tidybridge/config.py:77-86`
- Modify: `src/tidybridge/extract.py`
- Test: `tests/test_extract.py`, `tests/test_invoice_upload.py` (fixtures only)

**Interfaces:**
- Produces: `settings.mistral_api_key: str | None`, `settings.mistral_api_base: str`, `extract.extraction_enabled() -> bool`, `extract.call_model(content, media_type) -> ExtractedInvoices` (signature unchanged).

- [ ] **Step 1: Config.** In `config.py`, replace the `anthropic_api_key` / `extraction_model` block with:

```python
    mistral_api_key: str | None = None
    """Enables invoice extraction (see extract.py): PDF/image uploads to
    /records/upload are read by Mistral Document AI into the same rows a
    CSV would produce. None disables it - a document upload then gets a
    400 saying so, and CSV/Excel uploads are unaffected. Same
    disable-when-unset convention as webhook_url and provisioning_url."""
    mistral_api_base: str = "https://api.eu.mistral.ai"
    """The EU endpoint keeps inference in the EU (what /dpa promises).
    Regional endpoints cost 1.1x list price."""
    anthropic_api_key: str | None = None
    """Only for comparing Claude in scripts/eval_extraction.py - never set
    on a deployed server: /dpa names Mistral as the only LLM
    sub-processor."""
    extraction_model: str = "<pinned id from Task 0 step 3>"
    """A claude-* id goes to Anthropic, anything else to Mistral's OCR
    endpoint. scripts/eval_extraction.py takes --model to compare."""
```

- [ ] **Step 2: Write the failing tests.** In `tests/test_extract.py`, change the `enabled` fixture to set `mistral_api_key`. Change `test_disabled_without_api_key` to set `mistral_api_key` to None. Then add:

```python
import httpx  # top of the file, with the other imports


class _Resp:
    def __init__(self, status: int, body: dict | None = None, text: str = ""):
        self.status_code, self._body, self.text = status, body, text
        self.is_error = status >= 400

    def json(self):
        return self._body


def _mistral(monkeypatch, response=None, exc=None):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        if exc:
            raise exc
        return response

    monkeypatch.setattr(extract.httpx, "post", fake_post)
    monkeypatch.setattr(settings, "mistral_api_key", "k")
    monkeypatch.setattr(settings, "extraction_model", "mistral-ocr-test")
    return sent


def _ok(annotation):
    return _Resp(200, {"document_annotation": annotation, "usage_info": {"pages_processed": 1}})


def test_mistral_pdf_request_and_parsed_invoices(monkeypatch):
    payload = ExtractedInvoices(invoices=[_invoice()]).model_dump_json()
    sent = _mistral(monkeypatch, _ok(payload))
    result = extract.call_model(b"%PDF", "application/pdf")
    assert result.invoices[0].invoice_number == "F-2026-001"
    assert sent["url"] == f"{settings.mistral_api_base}/v1/ocr"
    assert sent["headers"]["Authorization"] == "Bearer k"
    doc = sent["json"]["document"]
    assert doc["type"] == "document_url"
    assert doc["document_url"].startswith("data:application/pdf;base64,")
    fmt = sent["json"]["document_annotation_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["schema"] == ExtractedInvoices.model_json_schema()
    assert sent["json"]["document_annotation_prompt"] == extract._PROMPT


def test_mistral_image_goes_as_image_url(monkeypatch):
    sent = _mistral(monkeypatch, _ok('{"invoices": []}'))
    extract.call_model(b"\xff\xd8", "image/jpeg")
    assert sent["json"]["document"]["type"] == "image_url"
    assert sent["json"]["document"]["image_url"].startswith("data:image/jpeg;base64,")


@pytest.mark.parametrize("annotation", [None, "not json", '{"invoices": "nope"}'])
def test_mistral_unusable_annotation_is_a_400(monkeypatch, annotation):
    _mistral(monkeypatch, _ok(annotation))
    with pytest.raises(ExtractionError, match="couldn't be read"):
        extract.call_model(b"%PDF", "application/pdf")


@pytest.mark.parametrize("status", [400, 422])
def test_mistral_rejecting_the_file_is_a_400(monkeypatch, status):
    _mistral(monkeypatch, _Resp(status, text="too many pages for annotation"))
    with pytest.raises(ExtractionError, match="too many pages"):
        extract.call_model(b"%PDF", "application/pdf")


@pytest.mark.parametrize("status", [401, 429, 500, 503])
def test_mistral_service_problems_are_unavailable(monkeypatch, status):
    _mistral(monkeypatch, _Resp(status))
    with pytest.raises(extract.ExtractionUnavailableError):
        extract.call_model(b"%PDF", "application/pdf")


def test_mistral_unreachable_is_unavailable(monkeypatch):
    _mistral(monkeypatch, exc=httpx.ConnectTimeout("slow"))
    with pytest.raises(extract.ExtractionUnavailableError):
        extract.call_model(b"%PDF", "application/pdf")


def test_claude_model_without_anthropic_key_is_disabled(monkeypatch):
    monkeypatch.setattr(settings, "mistral_api_key", "k")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    monkeypatch.setattr(settings, "extraction_model", "claude-sonnet-5")
    with pytest.raises(ExtractionError, match="isn't enabled"):
        extract.extract_invoices("inv.pdf", b"%PDF")
```

In `tests/test_invoice_upload.py`, change the `enabled` fixture and `test_pdf_without_extraction_enabled_is_a_clear_400` from `anthropic_api_key` to `mistral_api_key`. Both fixtures must also pin `extraction_model` to a non-Claude id:
`monkeypatch.setattr(settings, "extraction_model", "mistral-ocr-test")`.

- [ ] **Step 3: Run the tests to check they fail.**
Run: `uv run pytest tests/test_extract.py -q`
Expected: the new `test_mistral_*` tests fail, because `extract` has no `httpx` and `call_model` calls Anthropic.

- [ ] **Step 4: Implement.** In `extract.py`:
  - Add `import httpx` and `from pydantic import BaseModel, ValidationError`.
  - Rename the current `call_model` to `_call_anthropic` (unchanged inside).
  - Update the module docstring's provider mention.
  - Add:

```python
_UNAVAILABLE = "Invoice extraction is temporarily unavailable - please try again in a minute"


def _is_claude() -> bool:
    return settings.extraction_model.startswith("claude")


def extraction_enabled() -> bool:
    return bool(settings.anthropic_api_key if _is_claude() else settings.mistral_api_key)


def call_model(content: bytes, media_type: str) -> ExtractedInvoices:
    if _is_claude():
        return _call_anthropic(content, media_type)
    return _call_mistral(content, media_type)


def _call_mistral(content: bytes, media_type: str) -> ExtractedInvoices:
    data_uri = f"data:{media_type};base64,{base64.standard_b64encode(content).decode('ascii')}"
    if media_type == "application/pdf":
        document = {"type": "document_url", "document_url": data_uri}
    else:
        document = {"type": "image_url", "image_url": data_uri}
    try:
        # ponytail: no retry on 429/5xx - the free tier is ~1 req/s and one
        # pilot uploads one file at a time; add a backoff if 502s show up.
        response = httpx.post(
            f"{settings.mistral_api_base}/v1/ocr",
            headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            json={
                "model": settings.extraction_model,
                "document": document,
                "document_annotation_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "extracted_invoices",
                        "schema": ExtractedInvoices.model_json_schema(),
                        "strict": True,
                    },
                },
                "document_annotation_prompt": _PROMPT,
            },
            timeout=120,
        )
    except httpx.TransportError as exc:
        raise ExtractionUnavailableError(_UNAVAILABLE) from exc
    if response.status_code in (400, 422):
        # The file's fault (corrupt, too many pages, unsupported) - Mistral's
        # message says which; it never echoes the document's contents.
        raise ExtractionError(f"The document couldn't be read ({response.text[:300]})")
    if response.is_error:  # 401/403 bad key, 429 rate limit, 5xx
        raise ExtractionUnavailableError(_UNAVAILABLE)

    body = response.json()
    logger.info(
        "extraction.completed",
        extra={
            "model": settings.extraction_model,
            "pages": body.get("usage_info", {}).get("pages_processed"),
        },
    )
    try:
        return ExtractedInvoices.model_validate_json(body.get("document_annotation") or "")
    except ValidationError as exc:
        raise ExtractionError("The document couldn't be read - no invoice data came back") from exc
```

  - In `_call_anthropic`, use `_UNAVAILABLE` for its unavailable message.
  - In `extract_invoices`, replace `if not settings.anthropic_api_key:` with `if not extraction_enabled():`.

- [ ] **Step 5: Run the backend tests.**
Run: `sudo systemctl start postgresql` (it doesn't start on boot), then `uv run pytest -q && uv run ruff check .`
Expected: everything passes (227 + the new tests); ruff is clean.

- [ ] **Step 6: Smoke test against the real API (Victor).** Use an invoice of **your own**, such as a phone bill, not a client's. Run:
```bash
! uv run python -c "from tidybridge import extract; print(extract.call_model(open('<your invoice>.pdf','rb').read(), 'application/pdf'))"
```
Expected: one `Invoice(...)` with the right fields.
  - **If Mistral rejects `"strict": True`** with the pydantic `$defs`/`$ref` schema, set `strict` to False, re-run, and note it in the PR.
  - Also try a phone photo (`image/jpeg`).

- [ ] **Step 7: Commit.**
```bash
git add src/tidybridge/config.py src/tidybridge/extract.py tests/test_extract.py tests/test_invoice_upload.py
git commit -m "feat(extract): read invoices with Mistral Document AI (EU), Claude kept for evals"
```

### Task 2: Eval script, `.env.example`, README

**Files:**
- Modify: `scripts/eval_extraction.py` (docstring only)
- Modify: `.env.example:49-50`
- Modify: `README.md` (lines 44, 255-256, 467-478)

- [ ] **Step 1: Eval script.** Change only the docstring. The code already works, because `call_model` dispatches on `--model`. New usage text:
```
    uv run python scripts/eval_extraction.py [--model <mistral ocr id> | --model claude-sonnet-5]
...
position within a document. Calls the real API: MISTRAL_API_KEY for a
Mistral model (~$5 per 1,000 pages), ANTHROPIC_API_KEY for a claude-* one
(a few cents per document). Real client invoices only with the client's
written permission (/dpa section on evals).
```
- [ ] **Step 2: `.env.example`.** Replace lines 49-50 with:
```
MISTRAL_API_KEY=
# EXTRACTION_MODEL=<pinned mistral ocr id>
# MISTRAL_API_BASE=https://api.eu.mistral.ai
# Only for comparing Claude in scripts/eval_extraction.py, never on a server:
# ANTHROPIC_API_KEY=
```
- [ ] **Step 3: README.** Line 44: "when `MISTRAL_API_KEY` is set". Lines 255-256: "Off unless `MISTRAL_API_KEY` is set. Mistral Document AI on its EU endpoint reads the document into the invoice schema; `EXTRACTION_MODEL` picks the model, and a `claude-*` id switches to Anthropic for eval comparisons only." Lines 467-478: "Mistral (EU)" replaces "Anthropic".
- [ ] **Step 4: Run** `uv run python scripts/eval_extraction.py --help`. Expected: it prints the usage text with no errors.
- [ ] **Step 5: Commit.** `git commit -am "docs: Mistral is the extraction provider"`

### Task 3: Legal pages name Mistral, not Anthropic

**Files:**
- Modify: `frontend/src/pages/DpaPage.tsx:126-138, 197-201` and the "Last updated" line
- Modify: `frontend/src/pages/PrivacyPage.tsx:149-163, 201-204`
- Test: `frontend/src/pages/LegalPages.test.tsx`

The wording depends on Task 0. The text below assumes **step 2 found OCR on the EU endpoint**. If it didn't, or if step 4 showed sub-processors outside the EU for this feature, keep a sentence saying where and under which safeguard.

- [ ] **Step 1: Write the failing test.** Add to `LegalPages.test.tsx`:
```tsx
  it.each([
    ["Privacy", <PrivacyPage />],
    ["DPA", <DpaPage />],
  ])("%s names Mistral as the LLM provider, not Anthropic", (_, page) => {
    renderIn(page);
    expect(document.body.textContent).toMatch(/Mistral AI/);
    expect(document.body.textContent).not.toMatch(/Anthropic/);
  });
```
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/LegalPages.test.tsx`. Expected: FAIL, because both pages still say Anthropic.
- [ ] **Step 3: DPA section 6.** Replace the Anthropic `<li>` with:
```tsx
          <li>
            <strong>Mistral AI</strong> (France): only if invoice extraction is enabled, receives
            the invoice PDFs and images you upload, to read their fields. They are processed on
            its EU endpoint, kept for up to 30 days for abuse monitoring and then deleted, and
            tidybridge has opted out of their use for training, under{" "}
            <a className={linkClass} href="https://legal.mistral.ai/terms/data-processing-addendum" target="_blank" rel="noreferrer">
              Mistral's DPA
            </a>
            . CSV and Excel uploads are never sent to it.
          </li>
```
  - **Section 10:** "Your uploaded data is stored and processed in the EU." Drop the Anthropic exception sentence.
  - **"Last updated":** leave it as October 2026.
- [ ] **Step 4: Privacy page.** Replace the Anthropic `<li>` with the same facts, phrased for end users: "**Mistral AI** - only when invoice extraction is enabled: … sent to Mistral AI's API (France, EU-hosted) … processes it on tidybridge's behalf as a sub-processor, tidybridge has opted out of training … kept up to 30 days for abuse monitoring … See Mistral's privacy policy (https://legal.mistral.ai/terms/privacy-policy)". In the SCC line, remove ", Anthropic".
- [ ] **Step 5: Run** `cd frontend && npx vitest run && npm run lint`. Expected: all pass (53 + 2).
- [ ] **Step 6: Commit.** `git commit -am "fix(legal): Mistral (EU) replaces Anthropic as the extraction sub-processor"`

Tasks 1–3 go in **one PR** into `staging`, because they're one change: code and its disclosure must ship together.

### Task 4: Staging rollout (Victor)

- [ ] **Step 1:** After merging into `staging`, in Railway → **staging** API service → Variables, add `MISTRAL_API_KEY`. Not production.
- [ ] **Step 2:** Upload your own invoice on staging: one PDF and one phone photo. Expected: records appear, and flags show only where something is actually off. Check the API logs for `extraction.completed` with `pages`.
- [ ] **Step 3:** Upload a PDF with several pages. If it fails, confirm it's the clean 400 from Review Focus #1, then tell me the page count it failed at.
- [ ] **Step 4:** Then the eval: label ~30 invoices (your own, or clients' with written permission) and run `scripts/eval_extraction.py`, once with the Mistral id and once with `--model claude-sonnet-5`. **Claude is run only on documents you're allowed to send to Anthropic.**

**Not in this plan:** the production key (that waits for the quota, roadmap 3.5), and hiding "or invoice" on the upload button while extraction is off (a separate small PR).
