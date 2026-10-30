import { afterEach, describe, expect, it } from "vitest";
import { displayFieldName, formatFieldValue } from "./fieldNames";
import { setLang, t } from "./i18n";

describe("i18n", () => {
  afterEach(() => setLang("en")); // the rest of the suite runs in English

  it("speaks Spanish, with plurals and placeholders", () => {
    setLang("es");
    expect(t("records")).toBe("Registros");
    expect(t("rowsProcessed", { count: 1 })).toBe("1 fila procesada");
    expect(t("rowsProcessed", { count: 3 })).toBe("3 filas procesadas");
    expect(t("hello", { name: "Ana" })).toBe("Hola, Ana");
  });

  it("labels schema fields and humanizes custom ones", () => {
    setLang("es");
    expect(displayFieldName("vat_amount")).toBe("IVA");
    expect(displayFieldName("supplier_tax_id")).toBe("NIF proveedor");
    expect(displayFieldName("deal_size")).toBe("Deal Size");
    setLang("en");
    expect(displayFieldName("vat_amount")).toBe("VAT");
  });

  it("formats amounts and dates in the UI language, leaves the rest as stored", () => {
    setLang("es");
    expect(formatFieldValue("total_amount", "11197.8")).toBe("11.197,80");
    expect(formatFieldValue("invoice_date", "2026-10-27")).toBe("27/10/2026");
    expect(formatFieldValue("total_amount", "n/a")).toBe("n/a");
    expect(formatFieldValue("invoice_number", "0042")).toBe("0042");
    expect(formatFieldValue("net_amount", null)).toBeNull();
    setLang("en");
    expect(formatFieldValue("total_amount", "11197.8")).toBe("11,197.80");
  });
});
