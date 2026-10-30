import { useState } from "react";
import { t } from "../lib/i18n";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword, ApiError } from "../api/client";
import { ThemeToggle } from "../components/ThemeToggle";

type Outcome = "sent" | "oauth-only";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // "sent" covers both a real send and a nonexistent email - the backend
  // answers those two identically on purpose (see forgotPassword's
  // comment in api/client.ts). "oauth-only" is the one case the backend
  // does distinguish: an account that only ever signed in with GitHub
  // gets no email (there's no password to reset), so this page says so
  // instead of leaving someone waiting on something that'll never arrive.
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { oauthOnly } = await forgotPassword(email);
      setOutcome(oauthOnly ? "oauth-only" : "sent");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("tooManyAttempts"));
        setSubmitting(false);
        return;
      }
      // Any other failure (network error, 5xx) still shows the generic
      // "sent" outcome rather than exposing whether it worked.
      setOutcome("sent");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-sm mt-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{t("resetTitle")}</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          {t("resetIntro")}
        </p>

        {outcome === "sent" && (
          <p className="text-sm text-primary">
            {t("resetSent", { email })}
          </p>
        )}

        {outcome === "oauth-only" && (
          <div className="space-y-4">
            <p className="text-sm text-primary">
              {t("oauthOnly", { email })}
            </p>
            <a
              href="/login"
              className="block text-center rounded-md border border-input py-2 font-medium hover:bg-secondary transition"
            >
              {t("continueWithGitHub")}
            </a>
            <p className="text-xs text-muted-foreground">
              {t("addPasswordLater")}
            </p>
          </div>
        )}

        {outcome === null && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? t("sending") : t("sendResetLink")}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-ring hover:underline">
            {t("backToSignIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
