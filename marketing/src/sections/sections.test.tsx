import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import samples from "../samples.json";
import { InvoiceDemo } from "./InvoiceDemo";
import { Pilot } from "./Pilot";
import { Samples } from "./Samples";
import { Security } from "./Security";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

const photo = samples.find((s) => s.id === "photo")!;

describe("landing sections", () => {
  beforeEach(() => {
    document.documentElement.lang = "es";
  });
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("the hero demo shows every extracted value and the issue at once with reduced motion", () => {
    render(<InvoiceDemo sample={photo} />);
    for (const value of ["Ana Ejemplo", "12345678Z", "F-2026-0042", "15/10/2026", "850,00", "178,50", "127,50", "901,00"]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/La fecha estaba poco legible/)).toBeInTheDocument();
  });

  it("sample tabs switch invoices, with the keyboard too", () => {
    render(<Samples />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["PDF de una empresa", "Foto de móvil", "Autónomo con retención"]);
    fireEvent.click(screen.getByRole("tab", { name: "Foto de móvil" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Ana Ejemplo")).toBeInTheDocument();
    expect(within(panel).getByText(/La fecha estaba poco legible/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Foto de móvil" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Autónomo con retención" })).toHaveAttribute("aria-selected", "true");
  });

  it("security makes no claim we can't back up", () => {
    const { container } = render(<Security />);
    expect(container.textContent).not.toMatch(/todos los datos|100 ?%|#1/i);
    expect(container.textContent).toContain("Mistral AI (Francia)");
  });

  it("the pilot promises 2 working days", () => {
    const { container } = render(<Pilot />);
    expect(container.textContent).toContain("2 días laborables");
  });
});
