import { t, type TKey } from "./i18n";

// The API speaks English: record issues (from tidycsv and invoice
// extraction) and error details. These are a closed set, so they're
// translated here by pattern rather than giving the backend a language.
// Works for records saved before this existed too. Anything unknown is
// shown exactly as sent.
const PATTERNS: [RegExp, TKey, string[]?][] = [
  [/^extractor unsure - check against the document$/, "srv_extractorUnsure"],
  [/^starts like a spreadsheet formula - check against the document$/, "srv_formula"],
  [/^check digit doesn't match - not a valid Spanish NIF\/CIF, check against the document$/, "srv_checkDigit"],
  [/^same tax ID as the supplier - check who issued the invoice$/, "srv_sameTaxId"],
  [/^net \+ VAT - withholding = (\S+), but total is (\S+)$/, "srv_totals", ["a", "b"]],
  [/^required column missing from input$/, "srv_requiredColumn"],
  [/^required field is empty$/, "srv_requiredEmpty"],
  [/^invalid email format$/, "srv_badEmail"],
  [/^unparseable date$/, "srv_badDate"],
  [/^unparseable currency amount$/, "srv_badAmount"],
  [/^unparseable integer$/, "srv_badInteger"],
  [/^phone number too short$/, "srv_shortPhone"],
  [/^Couldn't read ['"](.+)['"] as a CSV or Excel file/, "srv_unreadable", ["file"]],
  [/^File exceeds the (\d+) MB upload limit$/, "srv_tooBig", ["mb"]],
  [/^No invoice found in ['"](.+)['"]$/, "srv_noInvoice", ["file"]],
  [/^The document couldn't be read/, "srv_docUnreadable"],
  [/^The document was declined by the extraction model$/, "srv_declined"],
  [/^Too many invoices in one document/, "srv_tooManyInvoices"],
  [/^Invoice extraction is temporarily unavailable/, "srv_unavailable"],
  [/^Invoice extraction isn't enabled on this server/, "srv_extractionOff"],
  [/^This record is flagged - fix or approve it first$/, "srv_flagged"],
  [/^Password must be at least (\d+) characters long$/, "srv_pwLength", ["n"]],
  [/^Password must contain at least one uppercase letter$/, "srv_pwUpper"],
  [/^Password must contain at least one lowercase letter$/, "srv_pwLower"],
  [/^Password must contain at least one digit$/, "srv_pwDigit"],
  [/^Password must contain at least one special character$/, "srv_pwSpecial"],
  [/^Current password is incorrect$/, "srv_currentPasswordWrong"],
  [/^Record not found$/, "srv_recordNotFound"],
  [/^Ingestion run not found$/, "srv_runNotFound"],
  [/^This record predates per-run schema tracking/, "srv_predatesSchema"],
  [/^Signup is by invitation only$/, "srv_signupClosed"],
];

export function translateServerText(text: string): string {
  for (const [re, key, names = []] of PATTERNS) {
    const m = re.exec(text);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return text;
}

/** fastapi-users sends bare codes like "LOGIN_BAD_CREDENTIALS". */
export function translateErrorCode(code: string): string {
  const text = t(`code_${code}` as TKey);
  // No translation: a generic message, never the raw code
  return text === `code_${code}` ? t("err_generic") : text;
}
