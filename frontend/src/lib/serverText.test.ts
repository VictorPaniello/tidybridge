import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import { translateErrorCode, translateServerText } from "./serverText";

// Copied verbatim from the backend (extract.py, tidycsv's cleaner.py,
// ingest.py, main.py, auth.py). If one changes there, its test fails here
// instead of the text silently showing up in English.
const BACKEND_TEXTS = [
  "extractor unsure - check against the document",
  "starts like a spreadsheet formula - check against the document",
  "check digit doesn't match - not a valid Spanish NIF/CIF, check against the document",
  "same tax ID as the supplier - check who issued the invoice",
  "net + VAT - withholding = 1060.00, but total is 1300.00",
  "required column missing from input",
  "required field is empty",
  "invalid email format",
  "unparseable date",
  "unparseable currency amount",
  "unparseable integer",
  "phone number too short",
  "Couldn't read 'factura_01.csv' as a CSV or Excel file - make sure it's not empty or corrupted, and that its extension matches its actual format (ParserError: x)",
  "File exceeds the 10 MB upload limit",
  "No invoice found in 'factura_01.pdf'",
  "The document couldn't be read ({\"detail\": \"bad pdf\"})",
  "The document was declined by the extraction model",
  "Too many invoices in one document - split it into smaller files",
  "Invoice extraction is temporarily unavailable - please try again in a minute",
  "Invoice extraction isn't enabled on this server - upload a CSV or Excel file instead",
  "This record is flagged - fix or approve it first",
  "Password must be at least 8 characters long",
  "Password must contain at least one uppercase letter",
  "Password must contain at least one lowercase letter",
  "Password must contain at least one digit",
  "Password must contain at least one special character",
];

describe("translateServerText", () => {
  afterEach(() => setLang("en"));

  it("has a Spanish version of every message the backend sends", () => {
    setLang("es");
    for (const text of BACKEND_TEXTS) expect(translateServerText(text), text).not.toBe(text);
  });

  it("keeps the values and filenames exactly", () => {
    setLang("es");
    expect(translateServerText("net + VAT - withholding = 1060.00, but total is 1300.00")).toBe(
      "Base + IVA − retención = 1060.00, pero el total es 1300.00",
    );
    expect(translateServerText("No invoice found in 'factura_01.pdf'")).toBe(
      "No se ha encontrado ninguna factura en «factura_01.pdf»",
    );
  });

  it("shows anything unknown as sent", () => {
    setLang("es");
    expect(translateServerText("Something new")).toBe("Something new");
  });
});

describe("translateErrorCode", () => {
  afterEach(() => setLang("en"));

  it("words known codes and falls back for unknown ones", () => {
    setLang("es");
    expect(translateErrorCode("LOGIN_BAD_CREDENTIALS")).toBe("Email o contraseña incorrectos.");
    expect(translateErrorCode("VERIFY_USER_BAD_TOKEN")).toBe("verify user bad token");
  });
});
