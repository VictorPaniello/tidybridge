import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, getColumnMapping, saveColumnMapping } from "../api/client";
import type { ColumnMapping, FieldResolution, IngestResult } from "../api/types";

interface Props {
  fingerprint: string;
  initialResolution?: ColumnMapping;
  ingestionRunId?: string;
}

const FIELD_TYPES = ["string", "email", "date", "currency", "integer", "phone"];

// Mirrors validate_resolution()'s target_field check in mapping.py - shown
// inline as soon as it's typed rather than only after a failed Save.
const FIELD_NAME_RE = /^[a-z][a-z0-9_]{0,99}$/;
function fieldNameError(name: string | null): string | null {
  if (!name) return null; // empty means "drop this column" - not an error
  return FIELD_NAME_RE.test(name)
    ? null
    : "Lowercase letters, numbers, underscores only - must start with a letter";
}

// Human-readable diff between what was there before this edit and what's
// about to be saved - shown to the engineer on the records page after
// save, since "Saved." alone doesn't tell them what actually changed.
function summarizeChanges(
  oldResolutions: FieldResolution[],
  newResolutions: FieldResolution[],
  oldDedupKeyFields: string[],
  newDedupKeyFields: string[],
): string[] {
  const oldByRaw = new Map(oldResolutions.map((e) => [e.raw_column, e]));
  const changes: string[] = [];

  for (const entry of newResolutions) {
    const old = oldByRaw.get(entry.raw_column);
    if (!old) continue;
    if (old.target_field !== entry.target_field) {
      changes.push(
        entry.target_field
          ? `"${entry.raw_column}" now maps to "${entry.target_field}" (was "${old.target_field ?? "unmapped"}")`
          : `"${entry.raw_column}" is no longer mapped to any field (dropped "${old.target_field}")`,
      );
    } else if (old.type !== entry.type) {
      changes.push(`"${entry.target_field}" type changed from ${old.type} to ${entry.type}`);
    } else if (Boolean(old.required) !== Boolean(entry.required)) {
      changes.push(
        entry.required
          ? `"${entry.target_field}" is now required - a blank value will be flagged`
          : `"${entry.target_field}" is no longer required`,
      );
    }
  }

  const oldSet = new Set(oldDedupKeyFields);
  const newSet = new Set(newDedupKeyFields);
  if (oldSet.size !== newSet.size || [...oldSet].some((f) => !newSet.has(f))) {
    changes.push(
      newDedupKeyFields.length
        ? `Duplicate detection now keys on: ${newDedupKeyFields.join(", ")}`
        : "Duplicate detection is now off (no dedup key fields)",
    );
  }

  return changes;
}

export function ColumnMappingReviewPage({
  fingerprint,
  initialResolution,
  ingestionRunId,
}: Props) {
  const navigate = useNavigate();
  const [resolutions, setResolutions] = useState<FieldResolution[]>([]);
  const [dedupKeyFields, setDedupKeyFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const storedResult: IngestResult | null = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("tidybridge_last_ingest_result");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as IngestResult;
      return parsed.fingerprint === fingerprint ? parsed : null;
    } catch {
      return null;
    }
  }, [fingerprint]);

  const effectiveInitialResolution = useMemo(
    () =>
      initialResolution ??
      (storedResult
        ? {
            field_resolutions: storedResult.field_resolutions,
            dedup_key_fields: storedResult.dedup_key_fields,
          }
        : undefined),
    [initialResolution, storedResult],
  );

  const effectiveRunId = ingestionRunId ?? storedResult?.ingestion_run_id;
  // Only available right after an upload (sessionStorage, same fingerprint)
  // - a saved mapping revisited later has no raw file to sample from.
  const sampleValues = storedResult?.sample_values ?? {};
  const hasInvalidFieldName = resolutions.some(
    (entry) => fieldNameError(entry.target_field) !== null,
  );

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    getColumnMapping(fingerprint)
      .then((mapping) => {
        setResolutions(mapping.field_resolutions);
        setDedupKeyFields(mapping.dedup_key_fields);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404 && effectiveInitialResolution) {
          setResolutions(effectiveInitialResolution.field_resolutions);
          setDedupKeyFields(effectiveInitialResolution.dedup_key_fields);
          return;
        }
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "Nothing to review yet - upload this shape once more to pick up its mapping."
            : "Couldn't load this mapping.",
        );
      })
      .finally(() => setLoading(false));
  }, [fingerprint, effectiveInitialResolution]);

  function updateTargetField(index: number, value: string) {
    setResolutions((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, target_field: value || null } : entry)),
    );
  }

  function updateType(index: number, value: string) {
    setResolutions((prev) => prev.map((entry, i) => (i === index ? { ...entry, type: value } : entry)));
  }

  function toggleDedupKey(field: string) {
    setDedupKeyFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  }

  function toggleRequired(index: number) {
    setResolutions((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, required: !entry.required } : entry)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveColumnMapping(fingerprint, {
        field_resolutions: resolutions,
        dedup_key_fields: dedupKeyFields,
        apply_to_run_id: effectiveRunId,
        old_resolutions: effectiveInitialResolution?.field_resolutions,
      });

      const rawStored = sessionStorage.getItem("tidybridge_last_ingest_result");
      if (rawStored) {
        try {
          const stored = JSON.parse(rawStored) as IngestResult;
          if (stored.fingerprint === fingerprint) {
            const oldByRaw = new Map(
              (effectiveInitialResolution?.field_resolutions ?? []).map((e) => [
                e.raw_column,
                e.target_field,
              ]),
            );
            const renameMap: Record<string, string> = {};
            const dropFields = new Set<string>();
            for (const res of resolutions) {
              const oldT = oldByRaw.get(res.raw_column);
              if (oldT && oldT !== res.target_field) {
                if (res.target_field === null) {
                  dropFields.add(oldT);
                } else {
                  renameMap[oldT] = res.target_field;
                }
              }
            }
            stored.records = stored.records.map((r) => {
              const updated = { ...r.fields };
              for (const [oldK, newK] of Object.entries(renameMap)) {
                if (oldK in updated) {
                  updated[newK] = updated[oldK];
                  delete updated[oldK];
                }
              }
              for (const dropK of dropFields) {
                delete updated[dropK];
              }
              return { ...r, fields: updated };
            });
            stored.field_resolutions = resolutions;
            stored.dedup_key_fields = dedupKeyFields;
            // Otherwise "New shape - review the field names/types we
            // picked?" keeps showing on the records page even after
            // this exact save reviewed and picked them - mapping_is_default
            // was never flipped here, only field_resolutions/dedup_key_fields.
            stored.mapping_is_default = false;
            sessionStorage.setItem("tidybridge_last_ingest_result", JSON.stringify(stored));
          }
        } catch {
          // ignore
        }
      }

      const changes = summarizeChanges(
        effectiveInitialResolution?.field_resolutions ?? [],
        resolutions,
        effectiveInitialResolution?.dedup_key_fields ?? [],
        dedupKeyFields,
      );
      navigate("/", { state: { mappingSaveSummary: changes } });
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Couldn't save this mapping - try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (loadError) return <p className="text-red-600 text-sm">{loadError}</p>;

  return (
    <div>
      <Link to="/" className="text-sm text-ring hover:underline">
        ← Back to records
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mt-4 mb-1">Review column mapping</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Applies to this upload and future uploads with this exact set of columns.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Raw column</th>
              <th className="px-4 py-2 font-medium">Field name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Required</th>
              <th className="px-4 py-2 font-medium">Dedup key</th>
            </tr>
          </thead>
          <tbody>
            {resolutions.map((entry, index) => (
              <tr
                key={entry.raw_column}
                className="border-t border-border hover:bg-secondary/50 transition"
              >
                <td className="px-4 py-2 text-muted-foreground">
                  {entry.raw_column}
                  {sampleValues[entry.raw_column]?.length > 0 && (
                    <div className="text-xs italic truncate max-w-[16rem]">
                      e.g. {sampleValues[entry.raw_column].join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    value={entry.target_field ?? ""}
                    onChange={(e) => updateTargetField(index, e.target.value)}
                    aria-invalid={fieldNameError(entry.target_field) !== null}
                    className={`w-full rounded-md border bg-transparent px-2 py-1 outline-none focus:ring-2 transition ${
                      fieldNameError(entry.target_field)
                        ? "border-red-400 dark:border-red-800 focus:ring-red-400"
                        : "border-input focus:ring-ring"
                    }`}
                  />
                  {fieldNameError(entry.target_field) && (
                    <p className="mt-1 text-xs text-red-600">{fieldNameError(entry.target_field)}</p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={entry.type ?? "string"}
                    onChange={(e) => updateType(index, e.target.value)}
                    // bg-background/text-foreground (not bg-transparent) here
                    // because the dropdown's own open-list popup is native
                    // chrome the page can't reach with Tailwind classes -
                    // only color-scheme and an explicit background/color on
                    // <option> (below) reliably keep it from falling back to
                    // barely-readable default styling in dark mode - see
                    // PhoneInput.tsx's country-code select for the same fix.
                    className="rounded-md border border-input bg-background text-foreground px-2 py-1 outline-none focus:ring-2 focus:ring-ring"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option
                        key={t}
                        value={t}
                        style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
                      >
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  {entry.target_field && (
                    <input
                      type="checkbox"
                      checked={Boolean(entry.required)}
                      onChange={() => toggleRequired(index)}
                    />
                  )}
                </td>
                <td className="px-4 py-2">
                  {entry.target_field && (
                    <input
                      type="checkbox"
                      checked={dedupKeyFields.includes(entry.target_field)}
                      onChange={() => toggleDedupKey(entry.target_field as string)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || hasInvalidFieldName}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:hover:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        {!saveError && hasInvalidFieldName && (
          <span className="text-sm text-red-600">Fix the field name errors above before saving.</span>
        )}
      </div>
    </div>
  );
}
