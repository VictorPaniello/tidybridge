import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

async function renderForm() {
  const { PilotForm } = await import("./PilotForm");
  render(<PilotForm />);
  fireEvent.change(screen.getByLabelText(/^Nombre|^Name/), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText(/^Gestoría|^Firm/), { target: { value: "Gestoría Ejemplo" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ana@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: /Enviar|Send|Enviando|Sending/ }).closest("form")!);
}

function respond(status: number) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status }));
}

describe("pilot request form", () => {
  beforeEach(() => {
    document.documentElement.lang = "es";
    vi.stubEnv("VITE_API_URL", "https://api.example.test");
  });
  afterEach(() => {
    document.documentElement.lang = "en";
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends the request once, even when clicked twice", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    await renderForm();
    submit();
    submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/pilot-requests");
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Ana Pérez",
      firm: "Gestoría Ejemplo",
      email: "ana@example.com",
      language: "es",
      privacy_accepted: true,
      website: "",
    });
  });

  it("thanks the requester on 202", async () => {
    vi.stubGlobal("fetch", respond(202));
    await renderForm();
    await act(async () => submit());
    expect(screen.getByText("¡Gracias! Te escribimos en 2 días laborables.")).toBeInTheDocument();
  });

  it.each([422, 429, 500])("on %i shows the email fallback and keeps what was typed", async (status) => {
    vi.stubGlobal("fetch", respond(status));
    await renderForm();
    await act(async () => submit());
    expect(screen.getByText(/No hemos podido enviar la solicitud/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "hello@tidybridge.dev" })[0]).toHaveAttribute(
      "href",
      "mailto:hello@tidybridge.dev",
    );
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue("Ana Pérez");
  });

  it("shows the same fallback when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await renderForm();
    await act(async () => submit());
    expect(screen.getByText(/No hemos podido enviar la solicitud/)).toBeInTheDocument();
  });

  it("speaks English and sends language en on /en", async () => {
    document.documentElement.lang = "en";
    const fetchMock = respond(202);
    vi.stubGlobal("fetch", fetchMock);
    await renderForm();
    await act(async () => submit());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).language).toBe("en");
    expect(screen.getByText("Thank you! We'll write back within 2 working days.")).toBeInTheDocument();
  });

  it("requires the privacy checkbox", async () => {
    await renderForm();
    expect(screen.getByRole("checkbox")).toBeRequired();
  });

  it("sends the staging gate header when it's configured", async () => {
    vi.stubEnv("VITE_STAGING_GATE_PASSWORD", "gate-pw");
    const fetchMock = respond(202);
    vi.stubGlobal("fetch", fetchMock);
    await renderForm();
    await act(async () => submit());
    expect(fetchMock.mock.calls[0][1].headers["X-Staging-Password"]).toBe("gate-pw");
  });
});
