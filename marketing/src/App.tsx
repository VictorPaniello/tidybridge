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
