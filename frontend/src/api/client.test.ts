import { afterEach, describe, expect, it, vi } from "vitest";

describe("exportRecords", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends the staging gate header like every other call", async () => {
    // The staging API 401s any request without it - export used to skip
    // the shared header code and was the one call that always failed there.
    vi.stubEnv("VITE_STAGING_GATE_PASSWORD", "gate-pw");
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("a,b\n", { status: 200, headers: { "content-type": "text/csv" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const api = await import("./client");
    api.setToken("tok");

    await api.exportRecords();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Staging-Password"]).toBe("gate-pw");
    expect(headers["Authorization"]).toBe("Bearer tok");
  });
});

describe("API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function failWith(detail: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const api = await import("./client");
    try {
      await api.getRecord("r1");
    } catch (err) {
      return err as InstanceType<typeof api.ApiError>;
    }
    throw new Error("expected the request to fail");
  }

  it("keeps a sentence as sent - filenames were lowercased and lost their underscores", async () => {
    const err = await failWith("No invoice found in 'Factura_01.pdf'");
    expect(err.message).toBe('No invoice found in "Factura_01.pdf"');
    expect(err.code).toBeUndefined();
  });

  it("keeps fastapi-users' code next to the worded message", async () => {
    const err = await failWith("RESET_PASSWORD_BAD_TOKEN");
    expect(err.code).toBe("RESET_PASSWORD_BAD_TOKEN");
    expect(err.message).toBe("This reset link is invalid or has expired. Request a new one below.");
  });
});
