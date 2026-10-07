import type { MouseEvent, PointerEvent } from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";
import { ThemeToggle } from "./components/ThemeToggle";

const APP_URL = "https://app.tidybridge.dev";
const REPO_URL = "https://github.com/VictorPaniello/tidybridge";

const PIPELINE = [
  {
    title: "Upload",
    description: "Drop in a CSV or Excel export, wherever the client’s data started out.",
  },
  {
    title: "Clean & validate",
    description:
      "tidycsv normalizes types and collapses stray whitespace, flagging anything it can’t parse instead of dropping it.",
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
      "Upload a CSV or Excel export and it’s cleaned and validated via tidycsv. Malformed rows are flagged, not silently dropped or crashed on.",
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

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING = { type: "spring", stiffness: 400, damping: 25 } as const;

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
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

// "How it works": the connector line draws across the steps and each step's
// number lights up as the line reaches it. STEP_GAP is the time between two
// steps lighting up, so the line's own duration is derived from it.
const STEP_GAP = 0.45;

// Desktop: one line across all steps.
const connector: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: STEP_GAP * (PIPELINE.length - 1), ease: "linear" } },
};

// Mobile: one vertical segment per step, each drawn in its own slot.
const segment: Variants = {
  hidden: { scaleY: 0 },
  show: (i: number) => ({ scaleY: 1, transition: { duration: STEP_GAP, delay: i * STEP_GAP, ease: "linear" } }),
};

const stepRing: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: (i: number) => ({ opacity: 1, scale: 1, transition: { ...SPRING, delay: i * STEP_GAP } }),
};

const stepText: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE_OUT } }),
};

// Hands off the current theme so the app doesn't flash to the wrong one on
// arrival - localStorage can't do this, tidybridge.dev and app.tidybridge.dev
// are different origins. The app's own blocking script (frontend/index.html)
// reads this once, persists it to its own localStorage, and strips it from
// the URL. Rewrites the href instead of navigating by hand so ctrl-click,
// middle-click and "open in new tab" keep working: pointerdown runs before
// any of those, click covers keyboard activation.
function withTheme(e: MouseEvent<HTMLAnchorElement> | PointerEvent<HTMLAnchorElement>) {
  const dark = document.documentElement.classList.contains("dark");
  e.currentTarget.href = `${APP_URL}/register?theme=${dark ? "dark" : "light"}`;
}

const CTA_STYLES = {
  primary:
    "bg-primary text-primary-foreground hover:shadow-[0_8px_24px_-8px_var(--ring)]",
  secondary: "border border-border hover:bg-secondary",
};

function Cta({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: HTMLMotionProps<"a"> & { variant?: keyof typeof CTA_STYLES; size?: "sm" | "md" }) {
  const reduce = useReducedMotion();
  return (
    <motion.a
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { y: 0, scale: 0.97 }}
      transition={SPRING}
      className={`inline-flex items-center rounded-md font-medium transition-[box-shadow,background-color] ${
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-2.5"
      } ${CTA_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

function GetStarted(props: { size?: "sm" | "md"; className?: string }) {
  return (
    <Cta href={`${APP_URL}/register`} onPointerDown={withTheme} onClick={withTheme} {...props}>
      Get started
    </Cta>
  );
}

// Lights the panel's 1px border under the cursor. Writes CSS variables
// straight to the element so moving the mouse never re-renders React.
function trackSpotlight(e: PointerEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
}

export default function App() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_srgb,var(--background)_85%,transparent)] backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-4">
          <motion.a
            href="/"
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="font-semibold tracking-tight rounded-sm hover:opacity-80 transition-opacity"
            translate="no"
          >
            tidy<span className="text-ring">bridge</span>
          </motion.a>
          <nav aria-label="Main" className="flex items-center gap-2 sm:gap-4">
            <a
              href="#gestorias"
              className="rounded-sm px-1 py-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              For gestorías
            </a>
            <GetStarted size="sm" className="hidden sm:inline-flex" />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1 mx-auto w-full max-w-6xl px-4">
        <motion.section
          initial={reduce ? false : "hidden"}
          animate="show"
          variants={heroContainer}
          className="relative isolate py-16 sm:py-24 grid gap-10 md:grid-cols-2 md:items-center"
        >
          <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-0 -z-10" />
          <div>
            <motion.h1
              variants={heroItem}
              className="text-4xl sm:text-6xl font-semibold tracking-[-0.03em] leading-[1.05]"
            >
              Clean client data in, a working integration out.
            </motion.h1>
            <motion.p variants={heroItem} className="mt-5 max-w-md text-muted-foreground text-lg">
              The forward-deployed engineer’s move, automated: clean a messy
              export, load it into a database, notify downstream systems as
              it lands.
            </motion.p>
            <motion.div variants={heroItem} className="mt-8 flex flex-wrap items-center gap-3">
              <GetStarted />
              <Cta variant="secondary" href={REPO_URL}>
                View on GitHub
              </Cta>
            </motion.div>
            <motion.a
              variants={heroItem}
              href="#gestorias"
              className="group mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground transition"
            >
              Accountant in Spain?
              <span className="font-medium text-primary underline-offset-4 group-hover:underline">
                Try the free invoice pilot
              </span>
              <span aria-hidden="true" className="text-primary transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </motion.a>
          </div>

          <motion.div
            variants={heroItem}
            onPointerMove={trackSpotlight}
            className="group relative min-w-0 rounded-lg bg-border p-px"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(240px_circle_at_var(--x)_var(--y),var(--ring),transparent_70%)]"
            />
            <div className="relative rounded-[7px] bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-2 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>tidybridge → downstream system</span>
                <motion.span
                  initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: reduce ? 0 : SENT_DELAY, duration: 0.25 }}
                  className="flex items-center gap-1.5 text-primary"
                >
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    {!reduce && (
                      <motion.span
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ opacity: [0.7, 0], scale: [1, 3] }}
                        transition={{ delay: SENT_DELAY, duration: 1, repeat: 2, repeatDelay: 0.3 }}
                        className="absolute inset-0 rounded-full bg-primary"
                      />
                    )}
                    <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Sent
                </motion.span>
              </div>
              <motion.pre
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={payloadContainer}
                translate="no"
                className="px-4 py-4 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto"
              >
                <code>
                  {SCIM_PAYLOAD_LINES.map((line, i) => (
                    <motion.span key={i} variants={payloadLine} className="block">
                      {line || " "}
                    </motion.span>
                  ))}
                </code>
              </motion.pre>
            </div>
          </motion.div>
        </motion.section>

        <section className="py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How it works</h2>
          <motion.ol
            initial={reduce ? false : "hidden"}
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            className="relative mt-10 grid gap-8 sm:grid-cols-3"
          >
            {/* Desktop connector: from the first number's centre to the
                last one's. With gap-8 (2rem) each column is (100% - 4rem)/3
                wide, so the last centre sits one column minus 1rem from
                the right edge. */}
            <motion.span
              aria-hidden="true"
              variants={connector}
              className="hidden sm:block absolute top-4 left-4 right-[calc((100%_-_4rem)/3_-_1rem)] h-px origin-left bg-primary"
            />
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 sm:block">
                {/* Mobile connector: one segment per step, from below this
                    number down to the next one (100% + the 2rem gap - the
                    2rem the segment starts below the top). */}
                {i < PIPELINE.length - 1 && (
                  <motion.span
                    aria-hidden="true"
                    custom={i}
                    variants={segment}
                    className="sm:hidden absolute left-4 top-8 h-full w-px origin-top bg-primary"
                  />
                )}
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-background font-mono text-xs">
                  <motion.span
                    aria-hidden="true"
                    custom={i}
                    variants={stepRing}
                    className="absolute -inset-px rounded-full ring-2 ring-primary"
                  />
                  {String(i + 1).padStart(2, "0")}
                </span>
                <motion.div custom={i} variants={stepText} className="min-w-0">
                  <h3 className="sm:mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </motion.div>
              </li>
            ))}
          </motion.ol>
        </section>

        <section className="py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">What it does</h2>
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
                    transition: { duration: 0.5, delay: i * 0.06, ease: EASE_OUT },
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
                  <h3 className="font-semibold">{c.title}</h3>
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
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="my-12 sm:my-16 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] p-6 sm:p-10 grid gap-8 md:grid-cols-[3fr_2fr] md:items-start"
        >
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              For gestorías: stop typing in supplier invoices.
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Send photos or PDFs of a client’s invoices and get them back as
              clean rows: supplier, tax ID, number, date, net, VAT, IRPF and
              total. Anything doubtful is flagged instead of guessed, including
              totals that don’t add up, and the same invoice twice is only
              counted once.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">Free pilot</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Send me last quarter’s invoices for one client. Within 24 hours
              you get them back ready to import into your accounting software,
              with the doubtful ones flagged. No cost, no signup.
            </p>
            <Cta href="mailto:hello@tidybridge.dev?subject=tidybridge%20pilot" className="mt-6">
              Join the free pilot
            </Cta>
            <p className="mt-3 text-xs text-muted-foreground">
              Or write to{" "}
              <a
                href="mailto:hello@tidybridge.dev"
                className="rounded-sm underline underline-offset-2 hover:text-foreground transition"
              >
                hello@tidybridge.dev
              </a>
            </p>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Victor Paniello</span>
          <nav aria-label="Footer" className="flex gap-4">
            <a href={`${APP_URL}/privacy`} className="rounded-sm py-1 hover:text-foreground transition">
              Privacy
            </a>
            <a href={`${APP_URL}/terms`} className="rounded-sm py-1 hover:text-foreground transition">
              Terms
            </a>
            <a href={REPO_URL} className="rounded-sm py-1 hover:text-foreground transition">
              GitHub
            </a>
          </nav>
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
