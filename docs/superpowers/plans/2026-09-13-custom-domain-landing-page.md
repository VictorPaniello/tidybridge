# Custom Domain + Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give tidybridge a real landing page at `tidybridge.dev`, move the existing app onto `app.tidybridge.dev`, and wire up the backend/DNS changes that split requires - in the right order so login never breaks mid-migration.

**Architecture:** A brand-new, independent React + Vite + Tailwind static site (`marketing/`, sibling to `frontend/`), copying (not importing) the existing frontend's design tokens and dark-mode toggle so it looks identical without sharing a bundle, a build, or any auth/API code. Deployed to Cloudflare Pages at the apex domain. The existing `frontend/` app gets a second custom domain (`app.tidybridge.dev`) added in Vercel, and the backend's `FRONTEND_URL` env var is updated only after that domain is confirmed live.

**Tech Stack:** React 18, TypeScript, Vite 5, Tailwind CSS 3 - the exact same versions `frontend/` already uses, no new tooling introduced.

**Spec:** `docs/superpowers/specs/2026-09-13-custom-domain-landing-page-design.md`

## Global Constraints

- One simple page at `tidybridge.dev` - no pricing, no multi-page site, no blog/docs stub (spec scope decision 2).
- `marketing/` is a fully separate project from `frontend/` - its own `package.json`/build, zero auth/API/router code, design tokens and `ThemeToggle.tsx` copied verbatim rather than imported (spec scope decision 3).
- No `api.tidybridge.dev` - the API stays on its current Railway domain (spec scope decision 4).
- Cloudflare Pages hosts `marketing/`; the `app` CNAME added for Vercel must be **DNS only** (not proxied), or Vercel's own TLS certificate issuance for the custom domain can fail.
- `FRONTEND_URL` on Railway must not be updated until `https://app.tidybridge.dev` is confirmed serving the app - flipping it earlier breaks CORS and the GitHub OAuth redirect for every user (spec's "Backend changes & sequencing").
- No shared dark-mode state across the two origins is attempted - each site defaults to `prefers-color-scheme` independently (spec, out of scope).

---

### Task 1: Scaffold the `marketing/` project

**Files:**
- Create: `marketing/package.json`
- Create: `marketing/tsconfig.json`
- Create: `marketing/vite.config.ts`
- Create: `marketing/postcss.config.js`
- Create: `marketing/tailwind.config.js`
- Create: `marketing/eslint.config.js`
- Create: `marketing/.gitignore`
- Create: `marketing/index.html`
- Create: `marketing/src/main.tsx`
- Create: `marketing/src/App.tsx`
- Create: `marketing/src/index.css`

**Interfaces:**
- Produces: a buildable Vite project at `marketing/` with `npm run build` emitting `marketing/dist/`. Task 2 modifies `src/index.css`, `src/App.tsx`, and `index.html` in place; Task 3 modifies `src/App.tsx` and `index.html` again. Nothing here is consumed from `frontend/` yet - that starts in Task 2.

- [ ] **Step 1: Create `marketing/package.json`**

```json
{
  "name": "tidybridge-marketing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "globals": "^15.12.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.15.0",
    "vite": "^5.4.11"
  }
}
```

Same versions `frontend/package.json` already pins - no `react-router-dom` (one page, no routing) and no `vitest`/testing-library (spec: no unit tests for a page with no logic beyond the copied dark-mode toggle).

- [ ] **Step 2: Create `marketing/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

Identical to `frontend/tsconfig.json`.

- [ ] **Step 3: Create `marketing/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

No `test` block - unlike `frontend/vite.config.ts`, there's no vitest setup here.

- [ ] **Step 4: Create `marketing/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Identical to `frontend/postcss.config.js`.

- [ ] **Step 5: Create `marketing/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
    },
  },
  plugins: [],
};
```

Same color token names as `frontend/tailwind.config.js` - the actual values live in `src/index.css` (Task 2), copied from `frontend/src/index.css` so both sites resolve to byte-identical colors.

- [ ] **Step 6: Create `marketing/eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
```

Identical to `frontend/eslint.config.js`.

- [ ] **Step 7: Create `marketing/.gitignore`**

```
node_modules
dist
.env.local
.env.*.local
*.local
```

Same pattern as `frontend/.gitignore` (minus its bun-specific lines - no reason to carry that convention into a project that never needed it).

- [ ] **Step 8: Create `marketing/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>tidybridge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Placeholder for now - `favicon.svg` doesn't exist yet (harmless 404 until Task 2) and there's no dark-mode blocking script yet (also Task 2).

- [ ] **Step 9: Create `marketing/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Identical to `frontend/src/main.tsx`.

- [ ] **Step 10: Create `marketing/src/App.tsx`**

```tsx
export default function App() {
  return <div>tidybridge</div>;
}
```

Minimal placeholder - real content lands in Task 3.

- [ ] **Step 11: Create `marketing/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

No color variables yet - Task 2 replaces this with the full copy from `frontend/src/index.css`.

- [ ] **Step 12: Install dependencies**

Run: `cd marketing && npm install`
Expected: succeeds, creates `marketing/node_modules/` and `marketing/package-lock.json`.

- [ ] **Step 13: Verify it builds**

Run: `cd marketing && npm run build`
Expected: succeeds, produces `marketing/dist/index.html` and bundled JS/CSS.

- [ ] **Step 14: Commit**

```bash
git add marketing/package.json marketing/package-lock.json marketing/tsconfig.json \
  marketing/vite.config.ts marketing/postcss.config.js marketing/tailwind.config.js \
  marketing/eslint.config.js marketing/.gitignore marketing/index.html \
  marketing/src/main.tsx marketing/src/App.tsx marketing/src/index.css
git commit -m "feat: scaffold the marketing/ landing page project"
```

---

### Task 2: Copy design tokens, dark mode, and the theme toggle

**Files:**
- Modify: `marketing/src/index.css`
- Modify: `marketing/index.html`
- Create: `marketing/public/favicon.svg`
- Create: `marketing/src/components/ThemeToggle.tsx`
- Modify: `marketing/src/App.tsx`

**Interfaces:**
- Consumes: `frontend/src/index.css` (color tokens), `frontend/src/components/ThemeToggle.tsx` (copied verbatim, no changes needed - it only touches `document.documentElement` and `localStorage`, nothing app-specific), `frontend/public/favicon.svg` (copied verbatim).
- Produces: `ThemeToggle` (default export from `./components/ThemeToggle`, same as `frontend/`'s) available for Task 3's header to render.

- [ ] **Step 1: Replace `marketing/src/index.css` with the copied tokens**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Copied from frontend/src/index.css - keep both files identical if the
   palette ever changes. Emerald (brand/primary) + stone (neutral),
   straight from Tailwind's own palette. Contrast-checked against this
   background: light-mode --primary/--ring are one step darker than the
   raw Tailwind emerald-600/emerald-500 to clear WCAG AA (4.5:1 text,
   3:1 non-text) - see frontend/src/index.css's own comment for the
   measured ratios. Applied via a `.dark` class on <html> (see
   ThemeToggle.tsx), not prefers-color-scheme alone - index.html has a
   small blocking script that sets the class before first paint so
   there's no flash of the wrong theme. */
:root {
  color-scheme: light;
  --background: #fafaf9; /* stone-50 */
  --foreground: #1c1917; /* stone-900 */
  --card: #ffffff;
  --card-foreground: #1c1917;
  --primary: #047857; /* emerald-700 */
  --primary-foreground: #ecfdf5; /* emerald-50 */
  --secondary: #f5f5f4; /* stone-100 */
  --secondary-foreground: #1c1917;
  --muted: #f5f5f4; /* stone-100 */
  --muted-foreground: #57534e; /* stone-600 */
  --accent: #d1fae5; /* emerald-100 */
  --accent-foreground: #065f46; /* emerald-800 */
  --border: #e7e5e4; /* stone-200 */
  --input: #e7e5e4; /* stone-200 */
  --ring: #059669; /* emerald-600 */
}

.dark {
  color-scheme: dark;
  --background: #0c0a09; /* stone-950 */
  --foreground: #fafaf9; /* stone-50 */
  --card: #1c1917; /* stone-900 */
  --card-foreground: #fafaf9;
  --primary: #34d399; /* emerald-400 */
  --primary-foreground: #022c22; /* emerald-950 */
  --secondary: #292524; /* stone-800 */
  --secondary-foreground: #fafaf9;
  --muted: #292524; /* stone-800 */
  --muted-foreground: #a8a29e; /* stone-400 */
  --accent: #065f46; /* emerald-800 */
  --accent-foreground: #d1fae5; /* emerald-100 */
  --border: #44403c; /* stone-700 */
  --input: #44403c; /* stone-700 */
  --ring: #34d399; /* emerald-400 */
}

body {
  @apply bg-background text-foreground;
}
```

- [ ] **Step 2: Create `marketing/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0c0a09"/>
  <path d="M8 20c2-6 4-9 8-9s6 3 8 9" stroke="#34d399" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="8" cy="20" r="2.2" fill="#34d399"/>
  <circle cx="24" cy="20" r="2.2" fill="#34d399"/>
</svg>
```

Byte-identical to `frontend/public/favicon.svg` - same brand mark on both sites.

- [ ] **Step 3: Add the blocking dark-mode script to `marketing/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>tidybridge</title>
    <script>
      // Blocking, runs before first paint - avoids a flash of the wrong
      // theme. Same localStorage key ThemeToggle.tsx reads/writes. Copied
      // from frontend/index.html - this site and the app are different
      // origins, so the two never share this localStorage value, only
      // the same logic for using it.
      (function () {
        var stored = localStorage.getItem("theme");
        var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("dark", dark);
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `marketing/src/components/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from "react";

function isDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  // Mirrors whatever index.html's blocking script already applied on
  // load (see its comment) - this only takes over for changes made
  // *after* mount, it doesn't decide the initial value itself.
  const [dark, setDark] = useState(isDarkNow);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-md border border-border p-1.5 hover:bg-secondary transition"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
```

Byte-identical to `frontend/src/components/ThemeToggle.tsx` - it only ever touches `document.documentElement` and `localStorage`, nothing about the app, so it copies over with zero changes.

- [ ] **Step 5: Wire it into a minimal header in `marketing/src/App.tsx`**

```tsx
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <span className="font-semibold tracking-tight">
            tidy<span className="text-ring">bridge</span>
          </span>
          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd marketing && npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual check - dark mode actually toggles**

Run: `cd marketing && npm run dev`, open the printed local URL in a browser, click the theme toggle button in the header. Expected: background/text colors flip between the light and dark palettes defined in Step 1, matching how the same toggle looks on the deployed app.

- [ ] **Step 8: Commit**

```bash
git add marketing/src/index.css marketing/index.html marketing/public/favicon.svg \
  marketing/src/components/ThemeToggle.tsx marketing/src/App.tsx
git commit -m "feat: copy design tokens, favicon, and dark-mode toggle into marketing/"
```

---

### Task 3: Write the real landing page content

**Files:**
- Modify: `marketing/src/App.tsx`
- Modify: `marketing/index.html`

**Interfaces:**
- Consumes: `ThemeToggle` from Task 2.
- Produces: the finished page - nothing later in this plan depends on its internals beyond "the build succeeds."

- [ ] **Step 1: Add a meta description to `marketing/index.html`**

```html
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="tidybridge cleans messy client data exports and delivers them to downstream systems - webhooks and SCIM-shaped provisioning, with full retry and audit trails."
    />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

(Insert the new `<meta name="description">` line right after the existing `<meta charset="UTF-8" />` line from Task 2.)

- [ ] **Step 2: Replace `marketing/src/App.tsx` with the full page**

```tsx
import { ThemeToggle } from "./components/ThemeToggle";

const CAPABILITIES = [
  {
    title: "Clean CSV/Excel uploads",
    description:
      "Upload a CSV or Excel export and it's cleaned and validated via tidycsv - malformed rows are flagged, not silently dropped or crashed on.",
  },
  {
    title: "Webhook + SCIM provisioning delivery",
    description:
      "Every new record can fire a webhook and a SCIM-shaped POST /Users to a downstream system, with retries, exponential backoff, idempotency keys, and a full audit trail of every attempt.",
  },
  {
    title: "Per-engineer data isolation",
    description:
      "Every record is scoped to the engineer who uploaded it, not pooled into a shared multi-tenant store.",
  },
  {
    title: "Real data retention and erasure",
    description:
      "Client data expires automatically after a year, or immediately on request - deleting a record or an account is a real, permanent action, not a support ticket.",
  },
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <span className="font-semibold tracking-tight">
            tidy<span className="text-ring">bridge</span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4">
        <section className="py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
            Clean client data in, a working integration out.
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground text-lg">
            A small service that does what a Forward Deployed Engineer does
            on day one at a new client: take their messy data export, clean
            it, get it into a real database, and notify another system when
            something new arrives.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <a
              href="https://app.tidybridge.dev/register"
              className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition"
            >
              Get started
            </a>
            <a
              href="https://github.com/VictorPaniello/tidybridge"
              className="rounded-md border border-border px-5 py-2.5 font-medium hover:bg-secondary transition"
            >
              View on GitHub
            </a>
          </div>
        </section>

        <section className="py-12 grid gap-6 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-card p-6">
              <h2 className="font-semibold">{c.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Victor Paniello</span>
          <a
            href="https://github.com/VictorPaniello/tidybridge"
            className="hover:text-foreground transition"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd marketing && npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check - view the page**

Run: `cd marketing && npm run dev`, open the printed local URL. Expected: header with the `tidybridge` wordmark and theme toggle, a hero with headline/pitch/two buttons, four capability cards, and a footer - matching the visual language (colors, spacing, border style) of the deployed app at a glance.

- [ ] **Step 5: Commit**

```bash
git add marketing/src/App.tsx marketing/index.html
git commit -m "feat: write the tidybridge.dev landing page content"
```

---

### Task 4: Lint clean, and add CI coverage

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `marketing/package.json`'s `lint` and `build` scripts (Task 1).

- [ ] **Step 1: Run lint locally and fix anything it flags**

Run: `cd marketing && npm run lint`
Expected: no errors. (If something is flagged, fix it before continuing - there should be nothing, since every file so far mirrors an already-lint-clean file from `frontend/`.)

- [ ] **Step 2: Add a `marketing` job to `.github/workflows/ci.yml`**

Append this job after the existing `frontend` job (same file, top-level under `jobs:`):

```yaml
  marketing:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: marketing

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
```

No `Test` step - unlike the `frontend` job, there's no test runner installed here (spec: no unit tests for a page with no logic beyond the copied dark-mode toggle).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint and build marketing/ in CI"
```

- [ ] **Step 4: Push the branch and confirm CI passes**

Push the current feature branch and open its PR (or check the branch's Actions run if a PR already exists). Expected: the new `marketing` job, alongside the existing `backend` and `frontend` jobs, all pass.

---

### Task 5: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:** none - documentation only.

- [ ] **Step 1: Update the Frontend section's deployment line**

Find this sentence (in the `## Frontend` section):

```
Deployed separately from the API - Vercel, not Railway, since it's a
static SPA rather than a long-running process. `VITE_API_URL` is set in
Vercel's project settings for production; the API's `FRONTEND_URL` env
var must point back at that same deployed URL for CORS and the OAuth
redirect to work.
```

Replace it with:

```
Deployed separately from the API - Vercel, not Railway, since it's a
static SPA rather than a long-running process, at `app.tidybridge.dev`
(a custom domain on the same Vercel project). `VITE_API_URL` is set in
Vercel's project settings for production; the API's `FRONTEND_URL` env
var must point back at that same deployed URL for CORS and the OAuth
redirect to work.
```

- [ ] **Step 2: Add a short "Landing page" note to the Frontend section**

Immediately after the paragraph replaced in Step 1, add:

```

**Landing page** (`marketing/`) is a separate, independent React + Vite
project - not a route inside this app. It's a single static page with no
auth, no API calls, and no shared build with the app it links to; see
`docs/superpowers/specs/2026-09-13-custom-domain-landing-page-design.md`
for why. Deployed to Cloudflare Pages at the apex domain, `tidybridge.dev`
(`www.tidybridge.dev` redirects there too); the app itself lives one level
down, at `app.tidybridge.dev`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the tidybridge.dev / app.tidybridge.dev domain split"
```

---

### Task 6 (manual infra): Cloudflare Pages for `tidybridge.dev`

**Not code** - this is a checklist for the Cloudflare dashboard, performed by whoever holds the Cloudflare account (per the spec, the domain is already registered there). Nothing here is scriptable from this repo.

- [ ] **Step 1:** In Cloudflare, create a new Pages project connected to this repo's `main` branch (once Tasks 1-5 are merged), with:
  - Build command: `npm run build`
  - Build output directory: `dist`
  - Root directory: `marketing`
- [ ] **Step 2:** Deploy it once and confirm the Pages-assigned URL (e.g. `tidybridge-xyz.pages.dev`) actually shows the landing page.
- [ ] **Step 3:** In the Pages project's custom domains settings, add `tidybridge.dev` (the apex). Cloudflare handles this natively since DNS and Pages are in the same account - no CNAME-flattening workaround needed.
- [ ] **Step 4:** Add a Cloudflare redirect rule (Rules > Redirect Rules, or a Bulk Redirect if preferred): `www.tidybridge.dev/*` → `https://tidybridge.dev/$1` (301).
- [ ] **Step 5:** Verify: `curl -I https://tidybridge.dev` returns `200`, and `curl -I https://www.tidybridge.dev` returns a `301`/`308` pointing at `https://tidybridge.dev`.

---

### Task 7 (manual infra): `app.tidybridge.dev` on Vercel

**Not code.**

- [ ] **Step 1:** In the existing Vercel project (the one already serving `frontend/`), add `app.tidybridge.dev` under Domains.
- [ ] **Step 2:** Vercel will show a required DNS record (a `CNAME` for `app` pointing at something like `cname.vercel-dns.com`). Add exactly that record in Cloudflare DNS, set to **DNS only** (grey cloud) - not proxied, per the Global Constraints above.
- [ ] **Step 3:** Wait for DNS to propagate and Vercel to report the domain as valid (its dashboard shows a checkmark once its own TLS certificate is issued).
- [ ] **Step 4:** Verify: `curl -I https://app.tidybridge.dev` returns `200` and actually serves the app (not a Vercel placeholder/error page). Log in through it once, end to end, before continuing to Task 8.

---

### Task 8 (manual infra): Flip `FRONTEND_URL`, sequenced after Task 7

**Not code.** This is the one step with a real ordering requirement (spec's "Backend changes & sequencing") - do not start this before Task 7's Step 4 has passed.

- [ ] **Step 1:** Confirm (again) that `https://app.tidybridge.dev` is live and serving the app - if Task 7 was done in a previous session, re-check it now rather than assuming it's still true.
- [ ] **Step 2:** In Railway's dashboard, update the API service's `FRONTEND_URL` environment variable to `https://app.tidybridge.dev`.
- [ ] **Step 3:** Redeploy/restart the API service so the new value takes effect.
- [ ] **Step 4:** Verify: visit `https://app.tidybridge.dev`, log in with email+password, and confirm it works (proves CORS is correctly scoped to the new origin). Then test "Sign in with GitHub" end to end and confirm it redirects back to `https://app.tidybridge.dev/auth/callback` on success (proves the OAuth redirect target updated correctly).
- [ ] **Step 5 (optional, cosmetic):** In the GitHub OAuth App's own settings (github.com/settings/developers), update the "Homepage URL" field to `https://tidybridge.dev`. Not functionally required - the registered callback URL points at the API's Railway domain, which hasn't changed - just keeps the listing accurate.
