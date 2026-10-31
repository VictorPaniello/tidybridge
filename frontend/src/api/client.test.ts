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

  async function failWith(detail: unknown, status = 400, body: unknown = { detail }) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
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

  // Every message must be one a client can act on or pass on to us -
  // never a raw code, an English server sentence or "status 500".
  it("never shows a raw code or an untranslated sentence", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await failWith("VERIFY_USER_BAD_TOKEN")).message).toMatch(/hello@tidybridge.dev/);
    expect((await failWith("Some new backend sentence")).message).toMatch(/hello@tidybridge.dev/);
    expect((await failWith([{ msg: "x" }], 422)).message).toBe(
      "Check the form: some of the details aren't valid.",
    );
  });

  it("words errors by status when the body doesn't help", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await failWith(null, 429, { error: "Rate limit exceeded: 5 per 1 minute" })).message).toBe(
      "Too many attempts. Wait a minute and try again.",
    );
    expect((await failWith(null, 500, null)).message).toMatch(/on our side/);
    // A known 5xx sentence still wins over the generic one
    expect((await failWith("Invoice extraction is temporarily unavailable - please try again in a minute", 502)).message)
      .toMatch(/temporarily unavailable/);
  });

  it("an expired session drops the token and goes to the login page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const api = await import("./client");
    api.setToken("old");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    })));
    await expect(api.getRecord("r1")).rejects.toThrow("Your session has expired. Please sign in again.");
    expect(api.getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login?expired=1");
  });

  it("no response at all means a connection problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await import("./client");
    await expect(api.getRecord("r1")).rejects.toThrow(/Can't reach the server/);
  });
});
