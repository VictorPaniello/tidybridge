import { useState } from "react";
import { getLang, setLang, t, type Lang } from "../lib/i18n";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { parsePhone } from "../lib/phone";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PasswordInput } from "../components/PasswordInput";
import { PhoneInput } from "../components/PhoneInput";
import { PasswordRulesList } from "../components/PasswordRulesList";

export function SettingsPage() {
  const { user, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const parsed = parsePhone(user?.phone ?? null);
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [dialCode, setDialCode] = useState(parsed.dialCode);
  const [phoneNumber, setPhoneNumber] = useState(parsed.number);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Kept empty after a successful save either way - not worth holding a
  // plaintext password in state any longer than it takes to submit it.
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  async function handleDeleteAccount() {
    setConfirmingDeleteAccount(false);
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await deleteAccount();
      navigate("/login");
    } catch (err) {
      setDeleteAccountError(
        err instanceof ApiError ? err.message : t("deleteAccountFailed"),
      );
      setDeletingAccount(false);
    }
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const phone = phoneNumber.trim() ? `${dialCode} ${phoneNumber.trim()}` : undefined;
      await updateProfile({ firstName, lastName, phone });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordsDontMatch"));
      return;
    }

    setChangingPassword(true);
    try {
      // first_name/last_name are required by the same PATCH /users/me
      // call, so they're resent unchanged alongside the new password -
      // this doesn't touch phone since it's untouched by this form.
      await updateProfile({
        firstName,
        lastName,
        phone: user?.phone ?? undefined,
        password: newPassword,
      });
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("somethingWentWrong"));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="max-w-sm space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">{t("accountSettings")}</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          {t("settingsIntro")}
        </p>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              {t("email")}
            </label>
            <input
              id="email"
              type="email"
              disabled
              value={user.email}
              className="w-full rounded-md border border-input bg-secondary text-muted-foreground px-3 py-2 outline-none cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="first-name">
                {t("firstName")}
              </label>
              <input
                id="first-name"
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="last-name">
                {t("lastName")}
              </label>
              <input
                id="last-name"
                type="text"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <PhoneInput
            dialCode={dialCode}
            phoneNumber={phoneNumber}
            onDialCodeChange={setDialCode}
            onPhoneNumberChange={setPhoneNumber}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && !error && <p className="text-sm text-primary">{t("saved")}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? t("saving") : t("saveChanges")}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-1">{t("changePassword")}</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          {t("leaveBlank")}
        </p>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="new-password">
              {t("newPassword")}
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
            />
            {newPassword && <PasswordRulesList password={newPassword} />}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="confirm-password">
              {t("confirmNewPassword")}
            </label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>

          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {passwordSaved && !passwordError && (
            <p className="text-sm text-primary">{t("passwordChanged")}</p>
          )}

          <button
            type="submit"
            disabled={changingPassword || !newPassword}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {changingPassword ? t("changing") : t("changePassword")}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-1">{t("language")}</h2>
        <p className="text-muted-foreground mb-4 text-sm">{t("languageIntro")}</p>
        <select
          aria-label={t("language")}
          value={getLang()}
          onChange={(e) => {
            setLang(e.target.value as Lang);
            window.location.reload();
          }}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="es" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
            Español
          </option>
          <option value="en" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
            English
          </option>
        </select>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-1 text-red-600">{t("dangerZone")}</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          {t("deleteAccountWarning")}
        </p>

        {deleteAccountError && <p className="mb-3 text-sm text-red-600">{deleteAccountError}</p>}

        <button
          type="button"
          onClick={() => setConfirmingDeleteAccount(true)}
          disabled={deletingAccount}
          className="rounded-md border border-red-300 dark:border-red-900 bg-card text-red-600 dark:text-red-400 px-4 py-2 text-sm shadow-sm hover:shadow hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
        >
          {deletingAccount ? t("deleting") : t("deleteAccount")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDeleteAccount}
        title={t("deleteAccountTitle")}
        message={t("deleteAccountWarning")}
        confirmLabel={t("deleteAccount")}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmingDeleteAccount(false)}
      />
    </div>
  );
}
