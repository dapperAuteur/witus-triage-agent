/**
 * lib/heartbeat.ts — inert without the env var, and NEVER able to fail a run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pingRunHeartbeat } from "@/lib/heartbeat";

const URL = "https://uptime.betterstack.com/api/v1/heartbeat/test123";

describe("pingRunHeartbeat", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does nothing when BETTERSTACK_HEARTBEAT_URL is unset", async () => {
    vi.stubEnv("BETTERSTACK_HEARTBEAT_URL", "");
    await pingRunHeartbeat();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings the configured URL when set", async () => {
    vi.stubEnv("BETTERSTACK_HEARTBEAT_URL", URL);
    await pingRunHeartbeat();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(URL);
  });

  it("swallows network failures — a down heartbeat endpoint never fails the run", async () => {
    vi.stubEnv("BETTERSTACK_HEARTBEAT_URL", URL);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(pingRunHeartbeat()).resolves.toBeUndefined();
  });
});
