import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type {
  ClientRecord,
  ProvisioningAttempt,
  ProvisioningJobStatus,
  WebhookDelivery,
  WebhookJobStatus,
} from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { Spinner } from "../components/Spinner";
import { displayFieldName, formatFieldValue, orderFieldNames } from "../lib/fieldNames";
import { locale, t } from "../lib/i18n";
import { useHealth } from "../lib/health";

export function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<ClientRecord | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookDelivery[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<WebhookJobStatus | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningAttempt[]>([]);
  const [provisioningStatus, setProvisioningStatus] = useState<ProvisioningJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayingProvisioning, setReplayingProvisioning] = useState(false);
  const [provisioningReplayError, setProvisioningReplayError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const health = useHealth();
  // Developer integrations a gestoría never sets up: shown only where the
  // server has them configured, or this record already has history there
  const showWebhooks = health.webhooks || webhooks.length > 0;
  const showProvisioning = health.provisioning || provisioning.length > 0;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getRecord(id),
      api.getRecordWebhooks(id),
      api.getRecordWebhookStatus(id),
      api.getRecordProvisioning(id),
      api.getRecordProvisioningStatus(id),
    ])
      .then(([recordResult, webhooksResult, statusResult, provisioningResult, provisioningStatusResult]) => {
        setRecord(recordResult);
        setWebhooks(webhooksResult);
        setWebhookStatus(statusResult);
        setProvisioning(provisioningResult);
        setProvisioningStatus(provisioningStatusResult);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? t("recordNotFound")
            : t("loadRecordFailed"),
        );
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    setConfirmingDelete(false);
    try {
      await api.deleteRecord(id);
      navigate("/");
    } catch {
      alert(t("deleteRecordFailed"));
    }
  }

  function startEditing() {
    if (!record) return;
    setDraftFields(
      Object.fromEntries(Object.entries(record.fields).map(([k, v]) => [k, v ?? ""])),
    );
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveEdits() {
    if (!id || !record) return;
    // Only send what actually changed - a partial PATCH, not a full
    // fields replace, so an untouched field is never re-coerced for no
    // reason.
    const changed = Object.fromEntries(
      Object.entries(draftFields).filter(([k, v]) => (record.fields[k] ?? "") !== v),
    );
    if (Object.keys(changed).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateRecordFields(id, changed);
      setRecord(updated);
      setEditing(false);
      await refreshJobStatuses(id); // an edit can clear the flags, or the approval
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Whether a record is held for review shows in both status badges, and
  // approving or editing it changes that.
  async function refreshJobStatuses(recordId: string) {
    const [webhook, provisioning] = await Promise.all([
      api.getRecordWebhookStatus(recordId),
      api.getRecordProvisioningStatus(recordId),
    ]);
    setWebhookStatus(webhook);
    setProvisioningStatus(provisioning);
  }

  async function handleApprove() {
    if (!id) return;
    setApproving(true);
    setApproveError(null);
    try {
      setRecord(await api.approveRecord(id));
      await refreshJobStatuses(id);
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : t("approveFailed"));
    } finally {
      setApproving(false);
    }
  }

  async function handleReplay() {
    if (!id) return;
    setReplaying(true);
    setReplayError(null);
    try {
      await api.replayWebhook(id);
      setWebhooks(await api.getRecordWebhooks(id)); // refresh to show the new attempt(s)
    } catch (err) {
      setReplayError(err instanceof ApiError ? err.message : t("resendFailed"));
    } finally {
      setReplaying(false);
    }
  }

  async function handleReplayProvisioning() {
    if (!id) return;
    setReplayingProvisioning(true);
    setProvisioningReplayError(null);
    try {
      const status = await api.replayProvisioning(id);
      setProvisioningStatus(status); // freshly-reset job state - the worker hasn't run yet
    } catch (err) {
      setProvisioningReplayError(
        err instanceof ApiError ? err.message : t("retryProvisioningFailed"),
      );
    } finally {
      setReplayingProvisioning(false);
    }
  }

  if (loading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Spinner /> Loading…
      </p>
    );
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!record) return null;

  return (
    <div>
      <Link to="/" className="text-sm text-ring hover:underline">
        {t("backToRecords")}
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {record.fields.full_name ?? record.fields.supplier_name ?? t("unnamedRecord")}
        </h1>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleSaveEdits}
                disabled={saving}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? t("saving") : t("saveChanges")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEditing}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition"
              >
                {t("edit")}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded-md border border-red-300 dark:border-red-900 bg-card text-red-600 dark:text-red-400 px-3 py-1.5 text-sm shadow-sm hover:shadow hover:bg-red-50 dark:hover:bg-red-950/30 transition"
              >
                {t("delete")}
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}

      <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        {editing ? (
          <EditableRecordFieldsList
            fields={draftFields}
            onChange={(key, value) => setDraftFields((prev) => ({ ...prev, [key]: value }))}
          />
        ) : (
          <RecordFieldsList fields={record.fields} />
        )}
        <Field label={t("sourceFile")} value={record.source_file} />
        <Field label={t("imported")} value={new Date(record.created_at).toLocaleString(locale())} />
      </dl>

      {record.has_issues && record.issues && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">{t("issues")}</h2>
            {record.approved_at ? (
              <span className="text-xs text-muted-foreground">
                {t("approvedOn", { date: new Date(record.approved_at).toLocaleString(locale()) })}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary transition disabled:opacity-50"
              >
                {approving ? t("approving") : t("approve")}
              </button>
            )}
          </div>
          {!record.approved_at && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t("heldForReview")}
            </p>
          )}
          {approveError && <p className="mb-2 text-sm text-red-600">{approveError}</p>}
          <ul className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 divide-y divide-amber-200 dark:divide-amber-900 text-sm">
            {record.issues.map((issue, i) => (
              <li key={i} className="px-4 py-2">
                <span className="font-medium">{issue.field}</span>: {issue.issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showWebhooks && (
      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("webhookDeliveries")}</h2>
            <WebhookStatusBadge status={webhookStatus} />
          </div>
          <button
            type="button"
            onClick={handleReplay}
            disabled={replaying}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary transition disabled:opacity-50"
          >
            {replaying ? t("resending") : t("resendWebhook")}
          </button>
        </div>
        {replayError && (
          <p className="mb-2 text-sm text-red-600">{replayError}</p>
        )}
        {webhooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("noWebhookYet")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("colAttempt")}</th>
                  <th className="px-4 py-2 font-medium">{t("colAttempted")}</th>
                  <th className="px-4 py-2 font-medium">URL</th>
                  <th className="px-4 py-2 font-medium">{t("colStatus")}</th>
                  <th className="px-4 py-2 font-medium">{t("colResult")}</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground">#{w.attempt_number}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(w.attempted_at).toLocaleString(locale())}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-xs" title={w.url}>
                          {w.url}
                        </span>
                        <CopyButton value={w.url} label={t("copyWebhookUrl")} />
                      </div>
                    </td>
                    <td className="px-4 py-2">{w.status_code ?? "—"}</td>
                    <td className="px-4 py-2">
                      {w.success ? (
                        <span className="text-primary">{t("delivered")}</span>
                      ) : (
                        <span className="text-red-600" title={w.error ?? undefined}>
                          {t("failed")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showProvisioning && (
      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("provisioning")}</h2>
            <ProvisioningStatusBadge status={provisioningStatus} />
          </div>
          <button
            type="button"
            onClick={handleReplayProvisioning}
            disabled={replayingProvisioning}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary transition disabled:opacity-50"
          >
            {replayingProvisioning ? t("retrying") : t("retryProvisioning")}
          </button>
        </div>
        {provisioningReplayError && (
          <p className="mb-2 text-sm text-red-600">{provisioningReplayError}</p>
        )}
        {provisioningStatus?.remote_id && (
          <p className="mb-2 text-sm text-muted-foreground">
            {t("provisionedAs", { id: provisioningStatus.remote_id })}
          </p>
        )}
        {provisioning.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("noProvisioningYet")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("colAttempt")}</th>
                  <th className="px-4 py-2 font-medium">{t("colAttempted")}</th>
                  <th className="px-4 py-2 font-medium">{t("colStatus")}</th>
                  <th className="px-4 py-2 font-medium">{t("colResult")}</th>
                </tr>
              </thead>
              <tbody>
                {provisioning.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground">#{p.attempt_number}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(p.attempted_at).toLocaleString(locale())}
                    </td>
                    <td className="px-4 py-2">{p.status_code ?? "—"}</td>
                    <td className="px-4 py-2">
                      {p.success ? (
                        <span className="text-primary">
                          {p.status_code === 409 ? t("alreadyExisted") : t("provisioned")}
                        </span>
                      ) : (
                        <span className="text-red-600" title={p.error ?? undefined}>
                          {t("failed")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title={t("deleteRecordTitle")}
        message={showWebhooks ? t("deleteRecordMessageWebhooks") : t("deleteRecordMessage")}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}

// Every key in fields, not a fixed set - the whole point of dynamic
// schema mapping is that a shape can have any columns at all. Rendered
// as plain divs (not its own <dl>) so it drops straight into the page's
// existing grid <dl> alongside Field above, rather than nesting one dl
// inside another.
export function RecordFieldsList({ fields }: { fields: Record<string, string | null> }) {
  return (
    <>
      {orderFieldNames(Object.keys(fields)).map((key) => (
        <div key={key}>
          <dt className="text-muted-foreground">{displayFieldName(key)}</dt>
          <dd className="font-medium">{formatFieldValue(key, fields[key]) ?? "—"}</dd>
        </div>
      ))}
    </>
  );
}

// Same key set as RecordFieldsList, but each value is an input bound to
// the in-progress edit rather than the saved record - PATCH /records/{id}
// re-validates on save, so this doesn't need to know each field's type
// itself.
function EditableRecordFieldsList({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {orderFieldNames(Object.keys(fields)).map((key) => (
        <div key={key}>
          <label htmlFor={`field-${key}`} className="text-muted-foreground">
            {displayFieldName(key)}
          </label>
          <input
            id={`field-${key}`}
            value={fields[key]}
            onChange={(e) => onChange(key, e.target.value)}
            className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1 font-medium outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ))}
    </>
  );
}

// The automatic post-ingest delivery pipeline's state, next to the
// "Webhook deliveries" heading - distinct from the per-attempt table
// below it, and from a manual replay (which this never reflects, see
// WebhookJobStatus's docstring in api/types.ts).
function WebhookStatusBadge({ status }: { status: WebhookJobStatus | null }) {
  if (!status || status.status === "not_configured") return null;

  if (status.status === "dead") {
    return (
      <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-2 py-0.5 text-xs">
        {t("deliveryFailedPermanently")}
      </span>
    );
  }
  if (status.status === "done") {
    return (
      <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs">
        {t("delivered")}
      </span>
    );
  }
  if (status.status === "awaiting_review") {
    return (
      <span className="rounded-full bg-secondary text-muted-foreground px-2 py-0.5 text-xs">
        {t("awaitingReview")}
      </span>
    );
  }
  // "pending"
  return (
    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-0.5 text-xs">
      {status.attempt_number && status.attempt_number > 1
        ? t("retryingAttempt", { n: status.attempt_number })
        : t("deliveryPending")}
    </span>
  );
}

// Same shape as WebhookStatusBadge, plus "skipped_exists" - a 409 (the
// user already exists on the target system) is terminal
// success-equivalent, not a failure (see the backend spec).
function ProvisioningStatusBadge({ status }: { status: ProvisioningJobStatus | null }) {
  if (!status || status.status === "not_configured") return null;

  if (status.status === "dead") {
    return (
      <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-2 py-0.5 text-xs">
        {t("provisioningFailedPermanently")}
      </span>
    );
  }
  if (status.status === "done" || status.status === "skipped_exists") {
    return (
      <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs">
        {status.status === "done" ? t("provisioned") : t("alreadyExisted")}
      </span>
    );
  }
  if (status.status === "awaiting_review") {
    return (
      <span className="rounded-full bg-secondary text-muted-foreground px-2 py-0.5 text-xs">
        {t("awaitingReview")}
      </span>
    );
  }
  // "pending"
  return (
    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-0.5 text-xs">
      {status.attempt_number && status.attempt_number > 1
        ? t("retryingAttempt", { n: status.attempt_number })
        : t("provisioningPending")}
    </span>
  );
}
