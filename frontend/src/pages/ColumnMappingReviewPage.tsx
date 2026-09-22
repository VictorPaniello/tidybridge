import { useEffect, useState } from "react";
import { ApiError, getColumnMapping, saveColumnMapping } from "../api/client";
import type { ColumnMapping, FieldResolution } from "../api/types";

interface Props {
  fingerprint: string;
  // The resolution actually used by the upload that got you here (see
  // IngestResult.field_resolutions) - the *only* fallback available when
  // GET 404s, which it always does for a shape nothing's been saved for
  // yet (main.py's get_column_mapping can't reconstruct raw headers from
  // a bare fingerprint). Without this, that 404 - the common case, since
  // it's exactly what mapping_is_default=true means - left the table
  // silently empty instead of showing anything to review.
  initialResolution?: ColumnMapping;
}

const FIELD_TYPES = ["string", "email", "date", "currency", "integer", "phone"];

// The entirely optional, prospective-only mapping review step - editing
// here only affects the *next* upload of this exact header shape (see
// GET/PUT /column-mappings/{fingerprint}), never records already ingested.
export function ColumnMappingReviewPage({ fingerprint, initialResolution }: Props) {
  const [resolutions, setResolutions] = useState<FieldResolution[]>([]);
  const [dedupKeyFields, setDedupKeyFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    getColumnMapping(fingerprint)
      .then((mapping) => {
        setResolutions(mapping.field_resolutions);
        setDedupKeyFields(mapping.dedup_key_fields);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404 && initialResolution) {
          setResolutions(initialResolution.field_resolutions);
          setDedupKeyFields(initialResolution.dedup_key_fields);
          return;
        }
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "Nothing to review yet - upload this shape once more to pick up its mapping."
            : "Couldn't load this mapping.",
        );
      })
      .finally(() => setLoading(false));
  }, [fingerprint, initialResolution]);

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
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (loadError) return <p className="text-red-600 text-sm">{loadError}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Review column mapping</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Applies to the next upload with this exact set of columns - never changes records already
        ingested.
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
