import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

  it("offers to resend the confirmation email when the account isn't verified", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health(false));
    const loginWithPassword = vi.fn().mockRejectedValue(new api.ApiError(400, "x", "LOGIN_USER_NOT_VERIFIED"));
    vi.spyOn(auth, "useAuth").mockReturnValue({ loginWithPassword } as unknown as ReturnType<typeof auth.useAuth>);
    const resend = vi.spyOn(api, "requestVerifyToken").mockResolvedValue();
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { verifyEmailSent: "ana@example.com" } }]}>
        <LoginPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(t("password")), { target: { value: "Proveedor-Ejemplo-1!" } });
    fireEvent.submit(screen.getByLabelText(t("email")).closest("form")!);
    fireEvent.click(await screen.findByText(t("resendVerifyEmail")));
    expect(resend).toHaveBeenCalledWith("ana@example.com");
    expect(await screen.findByText(t("verifyEmailResent"))).toBeInTheDocument();
  });
});
