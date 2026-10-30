import { useEffect, useState } from "react";
import { locale, t } from "../lib/i18n";
import { Link } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { IngestionRun } from "../api/types";
import { Spinner } from "../components/Spinner";

export function IngestionRunsPage() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listIngestionRuns()
      .then(setRuns)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("loadUploadsFailed"));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleExport(runId: string) {
    try {
      await api.exportRecords(runId);
    } catch {
      alert(t("exportUploadFailed"));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">{t("uploadHistory")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("uploadHistoryIntro")}
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner /> {t("loading")}
        </p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("noUploadsYet")}{" "}
          <Link to="/" className="text-ring hover:underline">
            {t("uploadAFile")}
          </Link>{" "}
          {t("toStart")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("colFile")}</th>
                <th className="px-4 py-2 font-medium">{t("colUploaded")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("colTotalRows")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("colClean")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("colNeedReview")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("colDuplicates")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("colAlreadyImported")}</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border hover:bg-secondary/50 transition">
                  <td className="px-4 py-2 font-medium">{run.source_file}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(run.created_at).toLocaleString(locale())}
                  </td>
                  <td className="px-4 py-2 text-right">{run.rows_total}</td>
                  <td className="px-4 py-2 text-right text-primary">{run.rows_clean}</td>
                  <td className="px-4 py-2 text-right text-amber-700 dark:text-amber-400">
                    {run.rows_flagged}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {run.rows_dropped_duplicates}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {run.rows_skipped_existing}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      to={`/?ingestion_run_id=${run.id}`}
                      className="text-xs text-ring hover:underline"
                    >
                      {t("viewRecords")}
                    </Link>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => handleExport(run.id)}
                      className="text-xs text-ring hover:underline"
                    >
                      {t("export")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
