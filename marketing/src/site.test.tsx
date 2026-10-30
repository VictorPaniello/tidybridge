import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter, SiteHeader } from "./site";

describe("site header and footer", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("is in Spanish on Spanish pages, with a switch to English", () => {
    document.documentElement.lang = "es";
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("link", { name: "Solicitar piloto" })[0]).toHaveAttribute("href", "/#piloto");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/");
  });

  it("is in English on English pages, with a switch back to Spanish", () => {
    document.documentElement.lang = "en";
    render(<SiteHeader />);
    expect(screen.getAllByRole("link", { name: "Request a pilot" })[0]).toHaveAttribute("href", "/en/#piloto");
    expect(screen.getByRole("link", { name: "Español" })).toHaveAttribute("href", "/");
  });

  it("footer keeps the developer link and the legal pages", () => {
    document.documentElement.lang = "es";
    render(<SiteFooter />);
    expect(screen.getByRole("heading", { name: "Para desarrolladores" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/privacy");
  });
});
