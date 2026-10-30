import { PASSWORD_RULES } from "../lib/passwordRules";
import { t } from "../lib/i18n";

// Live checklist against PASSWORD_RULES, shown under a password field as
// it's typed. Shared by RegisterPage, SettingsPage, and ResetPasswordPage -
// same rendering, only the password value being checked differs.
export function PasswordRulesList({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-0.5 text-xs" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={t(rule.label)} className={met ? "text-primary" : "text-muted-foreground"}>
            <span aria-hidden="true">{met ? "✓" : "○"}</span> {t(rule.label)}
            <span className="sr-only">{met ? t("ruleMet") : t("ruleNotMet")}</span>
          </li>
        );
      })}
    </ul>
  );
}
