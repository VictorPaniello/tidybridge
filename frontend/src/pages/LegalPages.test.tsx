import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as auth from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { DpaPage } from "./DpaPage";
import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";

function renderIn(ui: React.ReactElement) {
  render(<MemoryRouter>{ui}</MemoryRouter>);
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
      "/dpa",
    );
  });

  it("the footer links to all three", () => {
    vi.spyOn(auth, "useAuth").mockReturnValue({ user: null, logout: vi.fn() } as never);
    renderIn(<Layout>content</Layout>);
    for (const [name, href] of [
      ["Privacy policy", "/privacy"],
      ["Terms of service", "/terms"],
      ["Data processing", "/dpa"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
