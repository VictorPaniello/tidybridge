import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { t } from "../lib/i18n";
import { getPilotRequest, invitePilotRequest, ApiError } from "../api/client";
import type { PilotRequestSummary } from "../api/client";
import { Spinner } from "../components/Spinner";

// Opened from the "Invitar a tidybridge" button in the pilot request email.
// Admin only (the API answers 403 to anyone else). Inviting is a click here,
// never on opening the link - mail scanners open every link in a message.
export function PilotInvitePage() {
  const { id } = useParams<{ id: string }>();
  const [pilot, setPilot] = useState<PilotRequestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getPilotRequest(id!)
      .then(setPilot)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? t("adminOnly")
            : err instanceof ApiError && err.status === 404
              ? t("pilotRequestGone")
              : err instanceof ApiError
                ? err.message
                : t("somethingWentWrong"),
        ),
      );
  }, [id]);

  async function handleInvite() {
    setSending(true);
    setError(null);
    try {
      await invitePilotRequest(id!);
      setDone(t("inviteSent", { email: pilot!.email }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVITE_ALREADY_ACCEPTED") {
        setDone(t("inviteAlreadyActive", { email: pilot!.email }));
      } else {
        setError(err instanceof ApiError ? err.message : t("somethingWentWrong"));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">{t("invitePilotTitle")}</h1>
      {!pilot && !error && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner /> {t("loading")}
        </p>
      )}
      {pilot && (
        <dl className="mb-6 space-y-1 text-sm">
          <div><dt className="inline text-muted-foreground">{t("pilotFirm")}: </dt><dd className="inline">{pilot.firm}</dd></div>
          <div><dt className="inline text-muted-foreground">{t("pilotName")}: </dt><dd className="inline">{pilot.name}</dd></div>
          <div><dt className="inline text-muted-foreground">{t("email")}: </dt><dd className="inline">{pilot.email}</dd></div>
        </dl>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done ? (
        <p className="text-sm text-primary">{done}</p>
      ) : (
        pilot && (
          <button
            type="button"
            onClick={handleInvite}
            disabled={sending}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {sending ? t("sending") : t("sendInvite")}
          </button>
        )
      )}
    </div>
  );
}
