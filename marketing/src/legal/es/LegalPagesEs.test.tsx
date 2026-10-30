import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DpaPage } from "../DpaPage";
import { PrivacyPage } from "../PrivacyPage";
import { TermsPage } from "../TermsPage";
import { DpaPageEs } from "./DpaPage";
import { PrivacyPageEs } from "./PrivacyPage";
import { TermsPageEs } from "./TermsPage";

function headings(page: ReactElement): number {
  const { unmount } = render(page);
  const count = screen.getAllByRole("heading").length;
  unmount();
  return count;
}

describe("Spanish legal pages", () => {
  it.each([
    ["privacy", <PrivacyPage />, <PrivacyPageEs />],
    ["terms", <TermsPage />, <TermsPageEs />],
    ["dpa", <DpaPage />, <DpaPageEs />],
  ])("%s has a heading for every heading of the English page", (_, en, es) => {
    expect(headings(es)).toBe(headings(en));
  });

  it("the Spanish privacy policy keeps the key facts", () => {
    const { container } = render(<PrivacyPageEs />);
    for (const fact of ["12 meses", "Mistral AI", "Resend", "Railway", "Ámsterdam", "AEPD"]) {
      expect(container.textContent).toContain(fact);
    }
  });

  it("Spanish pages link to the Spanish DPA", () => {
    render(<PrivacyPageEs />);
    expect(screen.getByRole("link", { name: "Acuerdo de tratamiento de datos" })).toHaveAttribute(
      "href",
      "/dpa",
    );
  });
});
