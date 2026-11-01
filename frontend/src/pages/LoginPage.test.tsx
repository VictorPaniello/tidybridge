import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import * as auth from "../auth/AuthContext";
import { t } from "../lib/i18n";
import { LoginPage } from "./LoginPage";

const health = (github: boolean) => ({ status: "ok", extraction: false, webhooks: false, provisioning: false, github });

describe("LoginPage", () => {
  beforeEach(() => {
    vi.spyOn(auth, "useAuth").mockReturnValue({ loginWithPassword: vi.fn() } as unknown as ReturnType<typeof auth.useAuth>);
  });

  it("offers GitHub sign-in only when the server has it configured", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health(true));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(await screen.findByText(t("continueWithGitHub"))).toBeInTheDocument();
  });

  it("hides GitHub sign-in when OAuth isn't configured", async () => {
    const getHealth = vi.spyOn(api, "getHealth").mockResolvedValue(health(false));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await vi.waitFor(() => expect(getHealth).toHaveBeenCalled());
    expect(screen.queryByText(t("continueWithGitHub"))).not.toBeInTheDocument();
  });

  it("points visitors without an account to the pilot form, not a signup page", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health(false));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByText(t("requestPilot")).closest("a")).toHaveAttribute("href", expect.stringMatching(/#piloto$/));
  });

  it.each([
    ["/pilot-invite/abc", "back"],
    ["//evil.example", "home"],
  ])("after signing in from %s goes %s", async (from, expected) => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health(false));
    vi.spyOn(auth, "useAuth").mockReturnValue({ loginWithPassword: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof auth.useAuth>);
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pilot-invite/:id" element={<p>back</p>} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(t("email")), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(t("password")), { target: { value: "Proveedor-Ejemplo-1!" } });
    fireEvent.submit(screen.getByLabelText(t("email")).closest("form")!);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});
