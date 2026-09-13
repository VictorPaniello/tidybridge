# Custom domain + landing page: design

## Problem

tidybridge is reachable today only through provider-generated URLs: the app (the
real product - login, upload, records, webhook/provisioning history) lives on a
`*.vercel.app` domain, and the API lives on a `*.up.railway.app` domain. Neither
reads as a real, deployed product to someone glancing at a link - closer to "class
project" than "shipped thing," which matters for a portfolio piece meant to be
looked at by other people. There is also no landing/marketing page anywhere -
`GET /` on the frontend goes straight into the authenticated app's own routes
(login/register), with nothing that explains what tidybridge is to a visitor who
isn't already trying to log in.

The domain `tidybridge.dev` is already purchased, registered with Cloudflare.

## Explicit scope decisions

Confirmed during brainstorming, in order:

1. **`tidybridge.dev` (apex) = a new, simple landing page. `app.tidybridge.dev` =
   the existing app**, moved off its `*.vercel.app` domain onto this subdomain.
2. **One simple page**, not a multi-page marketing site - what it is, a handful of
   real capabilities, a link into the app, a link to the GitHub repo. No pricing,
   no blog/docs stub. This is a portfolio piece, not a product being sold to
   strangers.
3. **A separate React + Vite project** (`marketing/`), not a new route inside the
   existing `frontend/` app, and not hand-written plain HTML. Reasoning worked
   through directly:
   - A new route inside `frontend/` would bundle the marketing page together
     with the app's auth/API/router code, shipping all of it to anonymous
     visitors and coupling two very different concerns to one build/deploy
     pipeline.
   - Plain HTML/CSS was the first instinct (zero dependencies, smallest possible
     attack surface), but the user wants real React components (e.g. a working
     dark-mode toggle without hand-rolling the blocking pre-paint script again),
     so a separate project is the version of "isolated" that's compatible with
     that: its own `package.json`/build, zero auth/API/router code anywhere near
     it, but still gets JSX and can copy proven pieces (`ThemeToggle.tsx`,
     `tailwind.config.js`'s color extensions, `index.css`'s CSS variables)
     directly from `frontend/` rather than reimplementing them by eye.
   - Dependency footprint (React, Vite, Tailwind) is real but not *new*
     supply-chain exposure - the exact same, already-vetted dependencies
     `frontend/` already carries, just not sharing a bundle or a deploy with the
     authenticated app.
4. **API stays on Railway's own domain** - no `api.tidybridge.dev`. Matches what
   was actually asked for (app + landing); the API's domain is invisible to end
   users regardless (only `VITE_API_URL` and CORS reference it, nothing
   user-facing links to it), so there's no user-visible benefit to renaming it
   right now.
5. **Cloudflare Pages hosts the landing page** - free, no card, and DNS +
   hosting live in the one account already in use for the domain itself.
   Native apex-domain support (no CNAME-flattening workaround needed, unlike
   pointing an apex domain at Vercel).

## Content

One page, in `marketing/`:

- **Hero**: the name, one-line pitch pulled from the README's own framing
  (client data ingestion + cleaning + downstream delivery for one engineer's own
  book of clients).
- **Capabilities** (3-4, each a real thing this app does, not aspirational
  copy): CSV/Excel cleaning and validation (tidycsv), webhook + SCIM-shaped
  provisioning delivery with retry/backoff/idempotency, per-engineer data
  isolation (ownership-scoped, not multi-tenant-shared), GDPR-style
  self-service erasure and automatic data retention.
- **CTA**: links to `https://app.tidybridge.dev/register`.
- **Footer**: link to the GitHub repo. No Privacy/Terms links here - those
  pages already exist at `app.tidybridge.dev/privacy` and `/terms`; the landing
  page doesn't duplicate them.

**Dark mode is independent per site.** Copying `ThemeToggle.tsx`'s approach
(the same `localStorage` key, `theme`, and the same blocking pre-paint script
in `index.html`) makes each site behave identically on its own, but
`tidybridge.dev` and `app.tidybridge.dev` are different origins - a dark-mode
choice made on one does not, and cannot, carry over to the other via
`localStorage`. Each defaults to `prefers-color-scheme` independently, same as
the app does today. Not a bug to fix, just a real boundary worth stating.

## DNS & hosting

- **`marketing/`** deploys to a new Cloudflare Pages project. `tidybridge.dev`
  (apex) attached as its custom domain directly in Cloudflare - both DNS and
  hosting are already in the same Cloudflare account, so this is native apex
  support, no workaround.
- **`frontend/`** (the existing Vercel project) gets `app.tidybridge.dev` added
  as a custom domain in Vercel's project settings, with a `CNAME` record for
  `app` added in Cloudflare DNS pointing at Vercel's assigned target.
- **API** stays on its current Railway-generated domain, unchanged (see scope
  decision 4).
- **`www.tidybridge.dev`** redirects to the apex (`tidybridge.dev`, the
  landing page) - a Cloudflare redirect rule, not a second Pages deployment
  or a second custom domain to maintain. Same pattern most sites use for
  `www`: one canonical URL, `www` just forwards to it.

## Backend changes & sequencing

Exactly one backend change: Railway's `FRONTEND_URL` environment variable,
which drives two things in `src/tidybridge/auth.py`/`main.py` - the CORS
allowed origin, and the redirect target after a GitHub OAuth login completes
(`RedirectTransport(f"{settings.frontend_url}/auth/callback")`).

**Order matters**, to avoid a login-breaking gap:

1. Add the `app.tidybridge.dev` custom domain in Vercel and the matching CNAME
   in Cloudflare DNS.
2. Confirm `https://app.tidybridge.dev` actually serves the app (DNS propagated,
   Vercel's TLS cert issued) - the old `*.vercel.app` URL keeps working
   throughout this step, so nothing is broken yet.
3. Only then update `FRONTEND_URL` on Railway to `https://app.tidybridge.dev`
   and redeploy/restart the API. Flipping this before step 2 is confirmed
   would break both CORS and the OAuth redirect for every user, including
   anyone using the still-current `*.vercel.app` URL.

No change needed to the GitHub OAuth App's own registration (its "Authorization
callback URL" points at the API's Railway domain, which isn't moving). Its
informational "Homepage URL" field can be updated to `https://tidybridge.dev`
afterward as housekeeping - cosmetic, not functionally required.

## Testing strategy

No code path in the existing backend or `frontend/` test suites changes -
this is a new, independent static site plus a DNS/env var change, not new
application logic. `marketing/` gets the same CI treatment `frontend/`
already has for a page with this little logic: `tsc && vite build` (catches
broken JSX/types) and `eslint`. No component/unit tests - the only behavior
beyond static markup is the copied dark-mode toggle, already covered by
having been written and manually verified once in `frontend/`.

## Out of scope (explicitly, for this spec)

- `api.tidybridge.dev` (scope decision 4).
- A multi-page marketing site, blog, or docs stub (scope decision 2).
- Shared dark-mode state across the two origins (not solvable via
  `localStorage` alone; not attempted).
- Any change to GitHub OAuth App registration beyond the optional cosmetic
  Homepage URL update.
