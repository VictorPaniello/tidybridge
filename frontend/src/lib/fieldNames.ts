import { fieldLabel, locale } from "./i18n";

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

/** A schema field's translated label, else the humanized column name. */
export function displayFieldName(name: string): string {
  return fieldLabel(name) ?? humanizeFieldName(name);
}

const MONEY_FIELDS = new Set(["amount", "net_amount", "vat_amount", "withholding_amount", "total_amount"]);
const DATE_FIELDS = new Set(["signup_date", "invoice_date"]);

/** Display only: amounts and ISO dates in the UI's language (1.197,80 /
 * 27/10/2026 in Spanish). Anything else, or anything not shaped like a
 * plain number/date, is shown exactly as stored. */
export function formatFieldValue(name: string, value: string | null): string | null {
  if (value == null) return null;
  if (MONEY_FIELDS.has(name) && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (DATE_FIELDS.has(name) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale());
  }
  return value;
}

// Same order as examples/schema.yaml - keep in sync. Record fields come
// back from a JSONB column, which reorders keys shortest-first, so without
// this "currency" would lead every invoice row.
const SCHEMA_ORDER = [
  "full_name",
  "email",
  "signup_date",
  "amount",
  "phone",
  "supplier_name",
  "supplier_tax_id",
  "customer_name",
  "customer_tax_id",
  "invoice_number",
  "invoice_date",
  "currency",
  "net_amount",
  "vat_amount",
  "withholding_amount",
  "total_amount",
];

/** Schema fields in schema order, then any custom names as they came. */
export function orderFieldNames(names: string[]): string[] {
  const rank = (n: string) => {
    const i = SCHEMA_ORDER.indexOf(n);
    return i === -1 ? SCHEMA_ORDER.length : i;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/** The field each row links from: who the record is about. */
export function isTitleField(name: string, index: number): boolean {
  return index === 0 || name === "full_name" || name === "supplier_name";
}
