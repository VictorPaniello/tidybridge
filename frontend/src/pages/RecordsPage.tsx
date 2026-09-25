import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { ClientRecord, IngestResult } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { greeting } from "../lib/greeting";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Spinner } from "../components/Spinner";
import { UploadResultsTable } from "../components/UploadResultsTable";

type Filter = "all" | "clean" | "flagged";

// full_name/email/signup_date sort alphabetically (signup_date is stored
// as an ISO-ish string, so alphabetical order already matches chronological
// order); amount sorts numerically; has_issues (Status) sorts by its
// Clean/Flagged label, alphabetically - Clean before Flagged ascending,
// same string-comparator behavior as the other non-numeric columns.
type SortKey = string;
type SortDirection = "asc" | "desc";
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

function sortValue(record: ClientRecord, key: SortKey): string | number | null {
  if (key === "has_issues") return record.has_issues ? "Flagged" : "Clean";
  return record.fields[key];
}

function compareRecords(a: ClientRecord, b: ClientRecord, sort: SortState): number {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  // Nulls always sort last regardless of direction - an unfilled field
  // isn't meaningfully "before" or "after" real data.
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;

  const aNum = Number(av);
  const bNum = Number(bv);
  const isNumeric =
    !isNaN(aNum) && !isNaN(bNum) && String(av).trim() !== "" && String(bv).trim() !== "";

  const cmp = isNumeric ? aNum - bNum : String(av).localeCompare(String(bv));

  return sort.direction === "asc" ? cmp : -cmp;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden="true">
      <path
        d="M5 0L9 4.5H1L5 0Z"
        fill="currentColor"
        opacity={direction === "asc" ? 1 : 0.3}
      />
      <path
        d="M5 12L1 7.5H9L5 12Z"
        fill="currentColor"
        opacity={direction === "desc" ? 1 : 0.3}
      />
    </svg>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1.5 hover:text-foreground transition"
      >
        {label}
        <SortIcon direction={active ? sort.direction : null} />
      </button>
    </th>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${valueClassName ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

export function RecordsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mappingSaveSummary, setMappingSaveSummary] = useState<string[] | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const ingestionRunId = searchParams.get("ingestion_run_id");
  const [records, setRecords] = useState<ClientRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IngestResult | null>(() => {
    try {
      const saved = sessionStorage.getItem("tidybridge_last_ingest_result");
      return saved ? (JSON.parse(saved) as IngestResult) : null;
    } catch {
      return null;
    }
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The mapping review page hands its change summary back via router
  // state (set on the navigate() that lands here after a save) rather
  // than sessionStorage - it's one-shot, not meant to survive a refresh.
  // Consumed into local state, then stripped from history immediately
  // (replace, no state) so it doesn't reappear on a back-navigation.
  useEffect(() => {
    const state = location.state as { mappingSaveSummary?: string[] } | null;
    if (state?.mappingSaveSummary) {
      setMappingSaveSummary(state.mappingSaveSummary);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location, navigate]);

  // Acts like a toast: goes away on its own rather than sitting there
  // until someone notices the ✕. Re-arms whenever a new summary lands
  // (e.g. saving a second mapping in the same visit) rather than only
  // firing once per page load.
  useEffect(() => {
    if (!mappingSaveSummary) return;
    const timer = setTimeout(() => setMappingSaveSummary(null), 6000);
    return () => clearTimeout(timer);
  }, [mappingSaveSummary]);

  // Fetched once, unfiltered (beyond an optional ?ingestion_run_id= from
  // the URL - see the "Upload history" page's "View records" links) -
  // filter/search/stats are all derived from this in-memory list below,
  // rather than a fresh request per filter change. Fine at this
  // project's scale (one engineer's own records), and it's what makes
  // the stats panel possible without a second endpoint just to count
  // things the client already has.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await api.listRecords(undefined, ingestionRunId ?? undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load records.");
    } finally {
      setLoading(false);
    }
  }, [ingestionRunId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = records.length;
    const flagged = records.filter((r) => r.has_issues).length;
    return { total, clean: total - flagged, flagged };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((r) => {
      if (filter === "clean" && r.has_issues) return false;
      if (filter === "flagged" && !r.has_issues) return false;
      if (query) {
        const matchesField = Object.values(r.fields).some(
          (val) => val != null && String(val).toLowerCase().includes(query),
        );
        if (!matchesField) return false;
      }
      return true;
    });
  }, [records, filter, search]);

  const fieldNames = useMemo(() => {
    const names: string[] = [];
    for (const r of records) {
      for (const k of Object.keys(r.fields)) {
        if (!names.includes(k)) names.push(k);
      }
    }
    return names;
  }, [records]);

  const sortedRecords = useMemo(() => {
    if (!sort) return filteredRecords;
    return [...filteredRecords].sort((a, b) => compareRecords(a, b, sort));
  }, [filteredRecords, sort]);

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same filename be re-selected later
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setLastResult(null);
    sessionStorage.removeItem("tidybridge_last_ingest_result");
    try {
      const result = await api.uploadFile(file);
      setLastResult(result);
      sessionStorage.setItem("tidybridge_last_ingest_result", JSON.stringify(result));
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await api.exportRecords(ingestionRunId ?? undefined);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await api.deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't delete this record.");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = sortedRecords.map((r) => r.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function confirmBulkDelete() {
    setPendingBulkDelete(false);
    setBulkDeleting(true);
    setBulkDeleteError(null);
    const ids = [...selectedIds];
    try {
      await api.bulkDeleteRecords(ids);
      const deleted = new Set(ids);
      setRecords((prev) => prev.filter((r) => !deleted.has(r.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setBulkDeleteError(
        err instanceof ApiError ? err.message : "Couldn't delete the selected records.",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      {user && <p className="text-lg text-muted-foreground mb-1">{greeting(user)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Client records</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || uploading || records.length === 0}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary transition disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload CSV / Excel"}
          </button>
        </div>
      </div>

      {uploading && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground">
          <Spinner className="w-6 h-6 shrink-0" />
          Cleaning and importing your file - this can take a moment for larger uploads.
        </div>
      )}

      {exportError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {exportError}
        </div>
      )}

      {bulkDeleteError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {bulkDeleteError}
        </div>
      )}

      {ingestionRunId && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-secondary/50 px-4 py-2 text-sm">
          <span>
            Showing only records from{" "}
            <Link to="/uploads" className="text-ring hover:underline">
              one upload
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="text-xs text-muted-foreground hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {uploadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {uploadError}
        </div>
      )}

      {mappingSaveSummary && (
        <div className="mb-4 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-primary mb-1">Mapping saved.</p>
              {mappingSaveSummary.length > 0 ? (
                <ul className="list-disc pl-5 space-y-0.5">
                  {mappingSaveSummary.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No changes.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMappingSaveSummary(null)}
              aria-label="Dismiss"
              className="relative shrink-0 grid place-items-center w-6 h-6 text-muted-foreground hover:text-foreground transition"
            >
              {/* Matches the 6s auto-dismiss timer below - purely
                  decorative (aria-hidden), the button's own label
                  already says what clicking it does. */}
              <svg
                aria-hidden="true"
                className="absolute inset-0 -rotate-90"
                width="24"
                height="24"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-20" />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray={56.5487}
                  style={{ animation: "toast-countdown 6s linear forwards" }}
                />
              </svg>
              <span className="relative">✕</span>
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="mb-6 rounded-md border border-border px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p>
              <span className="font-medium">{lastResult.rows_total}</span> rows processed —{" "}
              <span className="text-primary">{lastResult.rows_clean} clean</span>,{" "}
              <span className="text-amber-700 dark:text-amber-400">
                {lastResult.rows_flagged} flagged
              </span>
              , {lastResult.rows_dropped_duplicates} duplicate(s) skipped
              {lastResult.rows_skipped_existing > 0 &&
                `, ${lastResult.rows_skipped_existing} already ingested`}
              .{" "}
              <Link to={`/uploads`} className="text-ring hover:underline">
                View full history
              </Link>
            </p>
            <button
              type="button"
              onClick={() => {
                setLastResult(null);
                sessionStorage.removeItem("tidybridge_last_ingest_result");
              }}
              aria-label="Dismiss"
              className="shrink-0 text-muted-foreground hover:text-foreground transition"
            >
              ✕
            </button>
          </div>
          {lastResult.records.length > 0 && (
            <div className="mt-3">
              <UploadResultsTable
                records={lastResult.records}
                mappingIsDefault={lastResult.mapping_is_default}
                fingerprint={lastResult.fingerprint}
                onReviewMapping={() =>
                  navigate(`/column-mappings/${lastResult.fingerprint}`, {
                    state: {
                      initialResolution: {
                        field_resolutions: lastResult.field_resolutions,
                        dedup_key_fields: lastResult.dedup_key_fields,
                      },
                      ingestionRunId: lastResult.ingestion_run_id,
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Total records" value={String(stats.total)} />
          <StatCard label="Clean" value={String(stats.clean)} valueClassName="text-primary" />
          <StatCard
            label="Flagged"
            value={
              stats.total === 0
                ? "0"
                : `${stats.flagged} (${Math.round((stats.flagged / stats.total) * 100)}%)`
            }
            valueClassName="text-amber-700 dark:text-amber-400"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2 text-sm">
          {(["all", "clean", "flagged"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={uploading}
              className={`rounded-full px-3 py-1 border transition disabled:opacity-50 ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {f === "all" ? "All" : f === "clean" ? "Clean" : "Flagged"}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={uploading}
          placeholder="Search by name or email…"
          className="ml-auto w-full sm:w-64 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner /> Loading…
        </p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : records.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No records yet. Upload a CSV or Excel file to get started.
        </p>
      ) : sortedRecords.length === 0 ? (
        <p className="text-muted-foreground text-sm">No records match this filter/search.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={
                      sortedRecords.length > 0 &&
                      sortedRecords.every((r) => selectedIds.has(r.id))
                    }
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                {fieldNames.map((name) => (
                  <SortableHeader
                    key={name}
                    label={name}
                    sortKey={name}
                    sort={sort}
                    onSort={handleSort}
                  />
                ))}
                <SortableHeader
                  label="Status"
                  sortKey="has_issues"
                  sort={sort}
                  onSort={handleSort}
                />
                <th className="px-4 py-2 font-medium text-right">
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setPendingBulkDelete(true)}
                      disabled={bulkDeleting}
                      className="rounded-md border border-red-300 dark:border-red-900 bg-card text-red-600 dark:text-red-400 px-2.5 py-1 text-xs font-normal shadow-sm hover:shadow transition disabled:opacity-50"
                    >
                      {bulkDeleting ? "Deleting…" : `Delete (${selectedIds.size})`}
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select record ${r.id}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                    />
                  </td>
                  {fieldNames.map((name, index) => {
                    const val = r.fields[name];
                    const isLink = index === 0 || name === "full_name";
                    return (
                      <td
                        key={name}
                        className={`px-4 py-2 ${!isLink ? "text-muted-foreground" : ""}`}
                      >
                        {isLink ? (
                          <Link to={`/records/${r.id}`} className="hover:underline font-medium">
                            {val ?? "—"}
                          </Link>
                        ) : (
                          val ?? "—"
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2">
                    {r.has_issues ? (
                      <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-0.5 text-xs">
                        Flagged
                      </span>
                    ) : (
                      <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs">
                        Clean
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setPendingDeleteId(r.id)}
                      className="rounded-md border border-red-300 dark:border-red-900 bg-card text-red-600 dark:text-red-400 px-2.5 py-1 text-xs shadow-sm hover:shadow transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this record?"
        message="This permanently deletes the record and its webhook delivery history. This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <ConfirmDialog
        open={pendingBulkDelete}
        title={`Delete ${selectedIds.size} record${selectedIds.size === 1 ? "" : "s"}?`}
        message="This permanently deletes the selected records and their webhook delivery history. This cannot be undone."
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDelete(false)}
      />
    </div>
  );
}
