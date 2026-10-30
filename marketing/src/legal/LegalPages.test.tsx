import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "../site";
import { DpaPage } from "./DpaPage";
import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";

function renderIn(ui: React.ReactElement) {
  render(ui);
}

describe("legal pages", () => {
  it("the DPA page renders its processor terms", () => {
    renderIn(<DpaPage />);
    expect(screen.getByRole("heading", { name: "Data processing agreement" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6. Sub-processors" })).toBeInTheDocument();
  });

  it.each([
    ["Terms", <TermsPage />],
    ["Privacy", <PrivacyPage />],
  ])("%s links to the DPA", (_, page) => {
    renderIn(page);
    expect(screen.getByRole("link", { name: "Data processing agreement" })).toHaveAttribute(
      "href",
      "/en/dpa",
    );
  });

  it.each([
    ["Privacy", <PrivacyPage />],
    ["DPA", <DpaPage />],
  ])("%s names Mistral as the LLM provider, not Anthropic", (_, page) => {
    renderIn(page);
    expect(document.body.textContent).toMatch(/Mistral AI/);
    expect(document.body.textContent).not.toMatch(/Anthropic/);
    // Some of Mistral's providers are outside the EU - the list is linked
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "https://trust.mistral.ai/subprocessors"),
    ).toBe(true);
  });

  it.each([
    ["Terms", <TermsPage />],
    ["Privacy", <PrivacyPage />],
    ["DPA", <DpaPage />],
  ])("%s uses hello@tidybridge.dev, never a personal address", (_, page) => {
    renderIn(page);
    const mailtos = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("mailto:"));
    expect(mailtos.length).toBeGreaterThan(0);
    expect(mailtos.every((href) => href === "mailto:hello@tidybridge.dev")).toBe(true);
  });

  it("the site footer links to all three, on this site", () => {
    document.documentElement.lang = "en";
    renderIn(<SiteFooter />);
    for (const [name, href] of [
      ["Privacy policy", "/en/privacy"],
      ["Terms of service", "/en/terms"],
      ["Data processing agreement", "/en/dpa"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("privacy covers the pilot request form and its 12-month retention", () => {
    renderIn(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "4. Pilot requests" })).toBeInTheDocument();
    expect(screen.getAllByText(/12 months/).length).toBeGreaterThan(0);
  });

  it("privacy says invoices give both the supplier's and the customer's details", () => {
    renderIn(<PrivacyPage />);
    expect(screen.getByText(/supplier's and the customer's name and tax ID/)).toBeInTheDocument();
  });
});
