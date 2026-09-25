// Column headers come straight from each upload's own field names (set by
// whoever reviewed that shape's mapping) - "full_name"/"telephone" instead
// of "Full name"/"Telephone" reads as unfinished next to "Status", which
// isn't a raw field key. Display-only: callers keep using the raw name for
// sortKey/search/fields lookups.
export function humanizeFieldName(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
