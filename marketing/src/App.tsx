import { motion, useReducedMotion, type Variants } from "motion/react";
import { ThemeToggle } from "./components/ThemeToggle";

const PIPELINE = [
  {
    title: "Upload",
    description: "Drop in a CSV or Excel export, wherever the client's data started out.",
  },
  {
    title: "Clean & validate",
    description:
      "tidycsv normalizes types and collapses stray whitespace, flagging anything it can't parse instead of dropping it.",
  },
  {
    title: "Deliver",
    description:
      "Each new record fires a webhook and a SCIM POST /Users downstream, with retries and a full audit trail.",
  },
];

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
const SCIM_PAYLOAD_LINES = `POST /Users HTTP/1.1
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
}`.split("\n");

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

// Streams the payload in line by line, like a request actually going out,
// starting once the panel itself has faded in (heroItem's own 0.5s) rather
// than at page load - a delay tuned to that, not measured from the DOM.
const payloadContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.5 } },
};

const payloadLine: Variants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

// Fires once every line above has streamed in - see the delay math next
// to where this is used.
const SENT_DELAY = 0.5 + (SCIM_PAYLOAD_LINES.length - 1) * 0.04 + 0.25;

export default function App() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <motion.span
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="font-semibold tracking-tight"
          >
            tidy<span className="text-ring">bridge</span>
          </motion.span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4">
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
            <div className="border-b border-border px-4 py-2 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span>tidybridge → downstream system</span>
              <motion.span
                initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : SENT_DELAY, duration: 0.25 }}
                className="flex items-center gap-1.5 text-primary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                Sent
              </motion.span>
            </div>
            <motion.pre
              initial={reduce ? false : "hidden"}
              animate="show"
              variants={payloadContainer}
              className="px-4 py-4 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto"
            >
              <code>
                {SCIM_PAYLOAD_LINES.map((line, i) => (
                  <motion.span key={i} variants={payloadLine} className="block">
                    {line || " "}
                  </motion.span>
                ))}
              </code>
            </motion.pre>
          </motion.div>
        </motion.section>

        <section className="py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {PIPELINE.map((step, i) => (
              <motion.div
                key={step.title}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="sm:border-l sm:border-border sm:pl-6 first:border-l-0 first:pl-0"
              >
                <span className="font-mono text-sm text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl font-semibold tracking-tight">What it does</h2>
          <ul className="mt-8 divide-y divide-border">
            {CAPABILITIES.map((c, i) => (
              <motion.li
                key={c.title}
                initial={reduce ? false : "hidden"}
                whileInView="show"
                whileHover={reduce ? undefined : "hover"}
                viewport={{ once: true, amount: 0.4 }}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] },
                  },
                }}
                className="py-6 first:pt-0 last:pb-0 flex gap-4"
              >
                <motion.span
                  variants={{ hover: { y: -3 } }}
                  transition={{ duration: 0.15 }}
                  className="mt-0.5 shrink-0"
                >
                  <c.icon className="h-5 w-5 text-ring" />
                </motion.span>
                <div>
                  <h2 className="font-semibold">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{c.description}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <motion.section
          id="gestorias"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="py-12 sm:py-16 border-t border-border scroll-mt-16"
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            For gestorías: stop typing in supplier invoices.
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Send photos or PDFs of a client's invoices and get them back as
            clean rows: supplier, tax ID, number, date, net, VAT, IRPF and
            total. Anything doubtful is flagged instead of guessed, including
            totals that don't add up, and the same invoice twice is only
            counted once.
          </p>
          <div className="mt-8 max-w-2xl rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold">Free pilot</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Send me last quarter's invoices for one client. Within 24 hours
              you get them back ready to import into your accounting software,
              with the doubtful ones flagged. No cost, no signup.
            </p>
            <motion.a
              whileTap={reduce ? undefined : { scale: 0.97 }}
              href="mailto:hello@tidybridge.dev?subject=tidybridge%20pilot"
              className="mt-6 inline-block rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition"
            >
              Join the free pilot
            </motion.a>
            <p className="mt-3 text-xs text-muted-foreground">
              Or write to hello@tidybridge.dev
            </p>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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
