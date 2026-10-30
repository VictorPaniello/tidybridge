import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as auth from "../auth/AuthContext";
import { Layout } from "./Layout";

describe("Layout", () => {
  it("the footer links to the legal pages on the landing site", () => {
    vi.spyOn(auth, "useAuth").mockReturnValue({ user: null, logout: vi.fn() } as never);
    render(
      <MemoryRouter>
        <Layout>content</Layout>
      </MemoryRouter>,
    );
    for (const [name, href] of [
      ["Privacy policy", "https://tidybridge.dev/en/privacy"],
      ["Terms of service", "https://tidybridge.dev/en/terms"],
      ["Data processing", "https://tidybridge.dev/en/dpa"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
