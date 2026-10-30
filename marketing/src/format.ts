import type { Lang } from "./i18n";

export type Invoice = {
  supplier_name: string;
  supplier_tax_id: string;
  customer_name: string;
  customer_tax_id: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  net_amount: number;
  vat_amount: number;
  withholding_amount: number | null;
  total_amount: number;
};

export type Sample = {
  id: string;
  label: Record<Lang, string>;
  image: string;
  invoice: Invoice;
  issues: { field: string; es: string; en: string }[];
};

/** The fields the demo and the samples show, in the app's order. */
export const SHOWN_FIELDS = [
  "supplier_name",
  "supplier_tax_id",
  "invoice_number",
  "invoice_date",
  "net_amount",
  "vat_amount",
  "withholding_amount",
  "total_amount",
] as const;

const MONEY = new Set(["net_amount", "vat_amount", "withholding_amount", "total_amount"]);

/** As the app shows it: 850,00 and 15/10/2026 in Spanish. */
export function formatValue(lang: Lang, field: string, value: string | number | null): string {
  if (value == null) return "—";
  const locale = lang === "es" ? "es-ES" : "en-GB";
  if (MONEY.has(field)) {
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (field === "invoice_date") {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale);
  }
  return String(value);
}
