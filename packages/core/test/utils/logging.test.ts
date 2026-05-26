import { describe, it, expect, vi, beforeEach } from "vitest";

describe("logging", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("setLogFunction sets the logger and log() calls it", async () => {
    const { setLogFunction, log } = await import("../../src/utils/logging");
    const logger = vi.fn();
    setLogFunction(logger);
    log("hello");
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("hello");
  });

  it("log() does not throw when no function is set (falls back to console)", async () => {
    const { log } = await import("../../src/utils/logging");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => log("fallback")).not.toThrow();
    expect(spy).toHaveBeenCalledWith("fallback");
    spy.mockRestore();
  });

  it("getLogFunction returns the set function", async () => {
    const { setLogFunction, getLogFunction } = await import("../../src/utils/logging");
    const fn = vi.fn();
    expect(getLogFunction()).toBeUndefined();
    setLogFunction(fn);
    expect(getLogFunction()).toBe(fn);
  });
});
