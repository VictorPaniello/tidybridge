// Shared by every page of the landing site: the home page (App.tsx) and the
// legal pages (legal/main.tsx).
import type { MouseEvent, PointerEvent } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Logo } from "./components/Logo";
import { ThemeToggle } from "./components/ThemeToggle";

const APP_URL = "https://app.tidybridge.dev";
export const REPO_URL = "https://github.com/VictorPaniello/tidybridge";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 400, damping: 25 } as const;

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

export function Cta({
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

export function GetStarted(props: { size?: "sm" | "md"; className?: string }) {
  return (
    <Cta href={`${APP_URL}/register`} onPointerDown={withTheme} onClick={withTheme} {...props}>
      Get started
    </Cta>
  );
}

export function SiteHeader() {
  const reduce = useReducedMotion();
  return (
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
            href="/#gestorias"
            className="rounded-sm px-1 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            For gestorías
          </a>
          <GetStarted size="sm" className="hidden sm:inline-flex" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border overflow-hidden">
      <nav aria-label="Footer" className="mx-auto max-w-6xl grid sm:grid-cols-3 sm:border-x border-border">
        {FOOTER_COLUMNS.map((col, i) => (
          <div
            key={col.title}
            className={`px-4 py-8 sm:py-10 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}
          >
            <h2 className="text-sm text-muted-foreground">{col.title}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="rounded-sm py-1 hover:text-ring transition">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 pt-8 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Victor Paniello</span>
          <a
            href={REPO_URL}
            aria-label="tidybridge on GitHub"
            className="rounded-sm p-1 hover:text-foreground transition"
          >
            <GitHubIcon className="size-5" />
          </a>
        </div>
        {/* The one oversized element: the full logo, edge to edge of the
            content column. Decorative - the header already names the site. */}
        <div aria-hidden="true" className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:pb-14">
          <Logo className="w-full h-auto" />
        </div>
      </div>
    </footer>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "What it does", href: "/#what-it-does" },
      { label: "For gestorías", href: "/#gestorias" },
      { label: "Sign in", href: `${APP_URL}/login` },
      { label: "Get started", href: `${APP_URL}/register` },
    ],
  },
  {
    title: "Open source",
    links: [
      { label: "tidybridge on GitHub", href: REPO_URL },
      { label: "tidycsv on GitHub", href: "https://github.com/VictorPaniello/tidycsv" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Data processing agreement", href: "/dpa" },
      { label: "Contact", href: "mailto:hello@tidybridge.dev" },
    ],
  },
];

// Lucide's "github" line icon, same stroke style as the icons below.
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

