import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getColumnMapping, saveColumnMapping } from "../api/client";
import type { ColumnMapping, FieldResolution, IngestResult } from "../api/types";

interface Props {
  fingerprint: string;
  initialResolution?: ColumnMapping;
  ingestionRunId?: string;
}

const FIELD_TYPES = ["string", "email", "date", "currency", "integer", "phone"];

export function ColumnMappingReviewPage({
  fingerprint,
  initialResolution,
  ingestionRunId,
}: Props) {
  const [resolutions, setResolutions] = useState<FieldResolution[]>([]);
  const [dedupKeyFields, setDedupKeyFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await saveColumnMapping(fingerprint, {
        field_resolutions: resolutions,
        dedup_key_fields: dedupKeyFields,
        apply_to_run_id: effectiveRunId,
        old_resolutions: effectiveInitialResolution?.field_resolutions,
      });
      setSaved(true);

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
            sessionStorage.setItem("tidybridge_last_ingest_result", JSON.stringify(stored));
          }
        } catch {
          // ignore
        }
      }
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
              <th className="px-4 py-2 font-medium">Dedup key</th>
            </tr>
          </thead>
          <tbody>
            {resolutions.map((entry, index) => (
              <tr key={entry.raw_column} className="border-t border-border">
                <td className="px-4 py-2 text-muted-foreground">{entry.raw_column}</td>
                <td className="px-4 py-2">
                  <input
                    value={entry.target_field ?? ""}
                    onChange={(e) => updateTargetField(index, e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-2 py-1 outline-none focus:ring-2 focus:ring-ring"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={entry.type ?? "string"}
                    onChange={(e) => updateType(index, e.target.value)}
                    className="rounded-md border border-input bg-transparent px-2 py-1 outline-none focus:ring-2 focus:ring-ring"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
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
          disabled={saving}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
      </div>
    </div>
  );
}
