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
