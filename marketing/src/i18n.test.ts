import { afterEach, describe, expect, it } from "vitest";
import { COPY, otherLangHref, pageLang } from "./i18n";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  }
  return typeof value;
}

describe("landing i18n", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("has the same copy shape in Spanish and English", () => {
    expect(shape(COPY.en)).toEqual(shape(COPY.es));
  });

  it("reads the language from <html lang>, Spanish by default", () => {
    document.documentElement.lang = "";
    expect(pageLang()).toBe("es");
    document.documentElement.lang = "en";
    expect(pageLang()).toBe("en");
  });

  it("links each page to the same page in the other language", () => {
    expect(otherLangHref("es", "/")).toBe("/en/");
    expect(otherLangHref("en", "/en/")).toBe("/");
    expect(otherLangHref("es", "/privacy")).toBe("/en/privacy");
    expect(otherLangHref("en", "/en/privacy")).toBe("/privacy");
  });

  it("promises 2 working days, never 24 hours", () => {
    const all = JSON.stringify(COPY);
    expect(all).toContain("2 días laborables");
    expect(all).not.toMatch(/24 ?h/i);
  });
});
