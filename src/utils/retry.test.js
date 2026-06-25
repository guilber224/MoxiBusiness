import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry — tolerar conexiones móviles inestables", () => {
  it("returns the result immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient network/timeout errors and eventually succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { retries: 2, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on a persistent network error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow("network error");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a Postgrest/RLS rejection (has a `code`) — retrying can't fix a permissions error", async () => {
    const fn = vi.fn().mockRejectedValue({ message: "permission denied", code: "42501" });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toMatchObject({ code: "42501" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
