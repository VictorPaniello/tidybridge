import type { ClientRecord } from "../api/types";

interface Props {
  records: ClientRecord[];
  mappingIsDefault?: boolean;
  fingerprint?: string;
  onReviewMapping?: () => void;
}

// One column per distinct field seen across this upload's records - a
// dynamic shape can have any columns at all, not the old fixed five.
// mappingIsDefault (from IngestResult) prompts a review only when this
// shape's mapping was never explicitly saved (see column-mappings.py).
export function UploadResultsTable({ records, mappingIsDefault, fingerprint, onReviewMapping }: Props) {
  const fieldNames = Array.from(new Set(records.flatMap((record) => Object.keys(record.fields))));

  return (
    <div>
      {mappingIsDefault && fingerprint && (
        <p className="mb-3 text-sm">
          New shape - review the field names/types we picked?{" "}
          <button type="button" onClick={onReviewMapping} className="text-ring hover:underline">
            Review mapping
          </button>
        </p>
      )}
      {records.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-muted-foreground">
              <tr>
                {fieldNames.map((name) => (
                  <th key={name} className="px-4 py-2 font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t border-border">
                  {fieldNames.map((name) => (
                    <td key={name} className="px-4 py-2 text-muted-foreground">
                      {record.fields[name] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
