import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyEmail, ApiError } from "../api/client";
import { ThemeToggle } from "../components/ThemeToggle";

// Landing page for the link in the verification email (auth.py's
// on_after_request_verify). Verifies on load, then hands off to /login.
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(token ? null : t("verifyLinkInvalid"));

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => navigate("/login", { state: { emailVerified: true } }))
      .catch((err) => {
        // StrictMode runs this effect twice in dev, and a second click on
        // the link is harmless - either way the account is verified.
        if (err instanceof ApiError && err.code === "VERIFY_USER_ALREADY_VERIFIED") {
          navigate("/login", { state: { emailVerified: true } });
        } else if (err instanceof ApiError && err.code === "VERIFY_USER_BAD_TOKEN") {
          setError(t("verifyLinkInvalid"));
        } else {
          setError(err instanceof ApiError ? err.message : t("somethingWentWrong"));
        }
      });
  }, [token, navigate]);

  return (
    <div className="min-h-screen">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-sm mt-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{t("verifyEmailTitle")}</h1>
        {error ? (
          <p className="mt-6 text-sm text-red-600">{error}</p>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">{t("verifyingEmail")}</p>
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
