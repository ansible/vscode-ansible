import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// This suite opts OUT of the global vscodeApi mock (test/unit/webviews/vitestSetup.ts)
// by re-importing the *real* module with vi.importActual after controlling the
// global acquireVsCodeApi factory. Because the module exports a singleton created
// at import time, we use vi.resetModules() + importActual to obtain a fresh
// instance that reflects the current global state.

type VscodeModule = typeof import("@webviews/lightspeed/src/utils/vscode");

interface FakeApi {
  postMessage: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
}

function makeFakeApi(state: unknown = undefined): FakeApi {
  return {
    postMessage: vi.fn(),
    getState: vi.fn(() => state),
    setState: vi.fn(),
  };
}

async function loadFresh(
  acquire: (() => FakeApi) | undefined,
): Promise<VscodeModule["vscodeApi"]> {
  vi.resetModules();
  if (acquire === undefined) {
    delete (globalThis as Record<string, unknown>).acquireVsCodeApi;
  } else {
    (globalThis as Record<string, unknown>).acquireVsCodeApi = acquire;
  }
  const mod = await vi.importActual<VscodeModule>(
    "@webviews/lightspeed/src/utils/vscode",
  );
  return mod.vscodeApi;
}

describe("vscodeApi (real WebviewApi)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).acquireVsCodeApi;
  });

  it("logs an error and no-ops when acquireVsCodeApi is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const api = await loadFresh(undefined);

    expect(errorSpy).toHaveBeenCalledWith("acquireVsCodeApi is not a function");
    // post / postMessage are no-ops (must not throw)
    expect(() => api.post("foo", { a: 1 })).not.toThrow();
    expect(() => api.postMessage({ hello: "world" })).not.toThrow();
    // getState returns undefined without an underlying api
    expect(api.getState()).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("post(type, data) forwards { type, data } to postMessage", async () => {
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    api.post("myType", { value: 42 });

    expect(fake.postMessage).toHaveBeenCalledWith({
      type: "myType",
      data: { value: 42 },
    });
  });

  it("postMessage forwards the raw message to the underlying api", async () => {
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    api.postMessage({ command: "ping" });

    expect(fake.postMessage).toHaveBeenCalledWith({ command: "ping" });
  });

  it("on() registers a success listener fired by a window 'message' event", async () => {
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    const success = vi.fn();
    api.on("evt", success);

    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "evt", data: "payload" } }),
    );

    expect(success).toHaveBeenCalledWith("payload");
  });

  it("off() removes a previously registered listener", async () => {
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    const success = vi.fn();
    api.on("evt", success);
    api.off("evt");

    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "evt", data: "payload" } }),
    );

    expect(success).not.toHaveBeenCalled();
  });

  it("ignores messages with no matching type", async () => {
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    const success = vi.fn();
    api.on("evt", success);

    // No type key at all -> _runListener early returns
    window.dispatchEvent(
      new MessageEvent("message", { data: { data: "payload" } }),
    );

    expect(success).not.toHaveBeenCalled();
  });

  it("postAndReceive resolves when a matching vscode-webview message arrives", async () => {
    vi.useFakeTimers();
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    const promise = api.postAndReceive<string>("evt", { q: 1 });

    // wrong origin is ignored ...
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example",
        data: { type: "evt", data: "nope" },
      }),
    );
    // ... wrong type is ignored ...
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "vscode-webview://abc",
        data: { type: "other", data: "nope" },
      }),
    );
    // ... correct origin + type resolves.
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "vscode-webview://abc",
        data: { type: "evt", data: "result" },
      }),
    );

    await expect(promise).resolves.toBe("result");
    // the initial post + the periodic interval post both target postMessage
    expect(fake.postMessage).toHaveBeenCalledWith({
      type: "evt",
      data: { q: 1 },
    });
  });

  it("postAndReceive rejects with Timeout and fires the fail listener", async () => {
    vi.useFakeTimers();
    const fake = makeFakeApi();
    const api = await loadFresh(() => fake);

    const fail = vi.fn();
    api.on("evt", vi.fn(), fail);

    const promise = api.postAndReceive("evt", {});
    const assertion = expect(promise).rejects.toThrow("Timeout");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(fail).toHaveBeenCalledWith(expect.any(Error));
  });

  it("postAndReceive rejects when acquireVsCodeApi is not available", async () => {
    const api = await loadFresh(undefined);
    await expect(api.postAndReceive("evt", {})).rejects.toThrow(
      "acquireVsCodeApi is not available",
    );
  });

  it("getState / setState proxy through to the underlying api", async () => {
    const fake = makeFakeApi("savedState");
    const api = await loadFresh(() => fake);

    expect(api.getState()).toBe("savedState");

    const returned = api.setState("newState");
    expect(returned).toBe("newState");
    expect(fake.setState).toHaveBeenCalledWith("newState");
  });
});
