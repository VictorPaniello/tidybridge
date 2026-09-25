import { motion, useReducedMotion, type Variants } from "motion/react";
import { ThemeToggle } from "./components/ThemeToggle";

const CAPABILITIES = [
  {
    icon: BroomIcon,
    title: "Clean CSV/Excel uploads",
    description:
      "Upload a CSV or Excel export and it's cleaned and validated via tidycsv. Malformed rows are flagged, not silently dropped or crashed on.",
  },
  {
    icon: WebhookIcon,
    title: "Webhook + SCIM provisioning delivery",
    description:
      "Every new record can fire a webhook and a SCIM POST /Users to a downstream system, with retries, backoff, idempotency keys, and an audit trail.",
  },
  {
    icon: LockIcon,
    title: "Per-engineer data isolation",
    description:
      "Every record is scoped to the engineer who uploaded it, not pooled into a shared multi-tenant store.",
  },
  {
    icon: ClockIcon,
    title: "Real data retention and erasure",
    description:
      "Client data expires automatically after a year, or immediately on request. Deleting a record or account is permanent, not a support ticket.",
  },
];

// The webhook shape actually sent by build_scim_payload() (provisioning.py)
// against examples/provisioning_mapping.yaml's default mapping - a real
// example the product produces, not a mocked-up screenshot.
const SCIM_PAYLOAD = `POST /Users HTTP/1.1
Content-Type: application/scim+json

{
  "userName": "sofia.reyes@shop.com",
  "name": {
    "givenName": "Sofia",
    "familyName": "Reyes"
  },
  "emails": [
    { "value": "sofia.reyes@shop.com" }
  ],
  "active": true
}`;

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export default function App() {
  const reduce = useReducedMotion();

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
        <motion.section
          initial={reduce ? false : "hidden"}
          animate="show"
          variants={heroContainer}
          className="py-16 sm:py-20 grid gap-10 md:grid-cols-2 md:items-center"
        >
          <div>
            <motion.h1
              variants={heroItem}
              className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]"
            >
              Clean client data in, a working integration out.
            </motion.h1>
            <motion.p variants={heroItem} className="mt-4 max-w-md text-muted-foreground text-lg">
              The forward-deployed engineer's move, automated: clean a messy
              export, load it into a database, notify downstream systems as
              it lands.
            </motion.p>
            <motion.div variants={heroItem} className="mt-8 flex items-center gap-4">
              <motion.a
                whileTap={reduce ? undefined : { scale: 0.97 }}
                href="https://app.tidybridge.dev/register"
                onClick={(e) => {
                  // Hands off the current theme so the app doesn't flash to
                  // the wrong one on arrival - localStorage can't do this,
                  // tidybridge.dev and app.tidybridge.dev are different
                  // origins. The app's own blocking script (frontend/index.html)
                  // reads this once, persists it to its own localStorage, and
                  // strips it from the URL.
                  e.preventDefault();
                  const dark = document.documentElement.classList.contains("dark");
                  window.location.href = `https://app.tidybridge.dev/register?theme=${dark ? "dark" : "light"}`;
                }}
                className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition"
              >
                Get started
              </motion.a>
              <motion.a
                whileTap={reduce ? undefined : { scale: 0.97 }}
                href="https://github.com/VictorPaniello/tidybridge"
                className="rounded-md border border-border px-5 py-2.5 font-medium hover:bg-secondary transition"
              >
                View on GitHub
              </motion.a>
            </motion.div>
          </div>

          <motion.div
            variants={heroItem}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div className="border-b border-border px-4 py-2 text-xs font-mono text-muted-foreground">
              tidybridge → downstream system
            </div>
            <pre className="px-4 py-4 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto">
              <code>{SCIM_PAYLOAD}</code>
            </pre>
          </motion.div>
        </motion.section>

        <section className="py-12 sm:py-16 border-t border-border">
          <ul className="divide-y divide-border">
            {CAPABILITIES.map((c, i) => (
              <motion.li
                key={c.title}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="py-6 first:pt-0 last:pb-0 flex gap-4"
              >
                <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-ring" />
                <div>
                  <h2 className="font-semibold">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{c.description}</p>
                </div>
              </motion.li>
            ))}
          </ul>
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

// Matches the existing SunIcon/MoonIcon convention in ThemeToggle.tsx -
// small hand-drawn line icons, not a new dependency for four glyphs.
function BroomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20L14 10" />
      <path d="M13 5l6 6-8 2-2-8 4 0z" />
      <path d="M4 20l3-6 3 3-6 3z" />
    </svg>
  );
}

function WebhookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 17a4 4 0 1 1 3.4-6.1" />
      <path d="M9.4 10.9 15 4" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="6" cy="17" r="3" />
      <circle cx="16" cy="4" r="3" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
