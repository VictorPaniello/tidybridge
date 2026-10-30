import { type FormEvent, useRef, useState } from "react";
import { pageLang, useCopy } from "../i18n";
import { Section } from "./Section";

const INBOX = "hello@tidybridge.dev";
type Status = "idle" | "sending" | "sent" | "error";

// Posts to the API's POST /pilot-requests (stored in the EU, emailed to
// hello@). Every failure - validation, rate limit, server, network - gets
// the same message with the email fallback, and the typed fields stay.
export function PilotForm() {
  const copy = useCopy();
  const lang = pageLang();
  const [status, setStatus] = useState<Status>("idle");
  const inFlight = useRef(false); // a second click can land before the re-render

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("sending");
    const data = new FormData(e.currentTarget);
    const optional = (key: string) => String(data.get(key) ?? "").trim() || null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const gate = import.meta.env.VITE_STAGING_GATE_PASSWORD;
    if (gate) headers["X-Staging-Password"] = gate;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/pilot-requests`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: data.get("name"),
          firm: data.get("firm"),
          email: data.get("email"),
          phone: optional("phone"),
          volume: optional("volume"),
          message: optional("message"),
          language: lang,
          privacy_accepted: data.get("privacy") === "on",
          website: data.get("website") ?? "",
        }),
      });
      setStatus(response.status === 202 ? "sent" : "error");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }

  const { form } = copy;
  const input =
    "mt-1 w-full rounded-md border border-input bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring";
  const mail = (
    <a href={`mailto:${INBOX}`} className="text-ring hover:underline">
      {INBOX}
    </a>
  );

  return (
    <Section id="piloto" title={form.title}>
      <p className="mt-3 text-muted-foreground">{form.intro}</p>
      {status === "sent" ? (
        <p role="status" className="mt-8 rounded-lg bg-accent px-5 py-4 text-accent-foreground">
          {form.success}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="pf-name">
            {form.name}
            <input id="pf-name" name="name" required maxLength={200} autoComplete="name" className={input} />
          </label>
          <label className="text-sm font-medium" htmlFor="pf-firm">
            {form.firm}
            <input id="pf-firm" name="firm" required maxLength={200} autoComplete="organization" className={input} />
          </label>
          <label className="text-sm font-medium" htmlFor="pf-email">
            {form.email}
            <input id="pf-email" name="email" type="email" required autoComplete="email" className={input} />
          </label>
          <label className="text-sm font-medium" htmlFor="pf-phone">
            {form.phone}
            <input id="pf-phone" name="phone" type="tel" maxLength={50} autoComplete="tel" className={input} />
          </label>
          <label className="text-sm font-medium sm:col-span-2" htmlFor="pf-volume">
            {form.volume}
            <select id="pf-volume" name="volume" defaultValue="" className={input}>
              <option value="">—</option>
              {Object.entries(form.volumeOptions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2" htmlFor="pf-message">
            {form.message}
            <textarea id="pf-message" name="message" rows={3} maxLength={2000} className={input} />
          </label>
          {/* Honeypot: hidden from people, filled by bots; the API stores nothing then */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <label className="flex items-start gap-2 text-sm text-muted-foreground sm:col-span-2">
            <input type="checkbox" name="privacy" required className="mt-0.5 size-4 shrink-0" />
            <span>
              {form.privacyBefore}
              <a href="/privacy" className="text-ring hover:underline">
                {form.privacyLink}
              </a>
              {form.privacyAfter}
            </span>
          </label>
          {status === "error" && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
              {form.error} {mail}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground transition disabled:opacity-60"
            >
              {status === "sending" ? form.sending : form.submit}
            </button>
            <span className="text-sm text-muted-foreground">
              {form.orEmail} {mail}
            </span>
          </div>
        </form>
      )}
    </Section>
  );
}
