import { useState } from "react";
import { t } from "../lib/i18n";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword, ApiError } from "../api/client";
import { ThemeToggle } from "../components/ThemeToggle";
import { PasswordInput } from "../components/PasswordInput";
import { PasswordRulesList } from "../components/PasswordRulesList";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token!, password);
      navigate("/login", { state: { passwordReset: true } });
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESET_PASSWORD_BAD_TOKEN") {
        setError(t("resetLinkInvalid"));
      } else {
        setError(err instanceof ApiError ? err.message : t("somethingWentWrong"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-sm mt-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{t("newPasswordTitle")}</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          {t("linkOnce")}
        </p>

        {!token ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600">
              {t("linkMissingToken")}
            </p>
            <Link
              to="/forgot-password"
              className="block text-center rounded-md bg-primary text-primary-foreground py-2 font-medium hover:opacity-90 transition"
            >
              {t("requestNewLink")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                {t("newPassword")}
              </label>
              <PasswordInput
                id="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
              />
              {password && <PasswordRulesList password={password} />}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="confirm-password">
                {t("confirmNewPassword")}
              </label>
              <PasswordInput
                id="confirm-password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? t("resetting") : t("resetPassword")}
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
