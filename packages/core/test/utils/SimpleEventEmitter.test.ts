import { describe, it, expect, vi } from "vitest";

import { SimpleEventEmitter } from "../../src/utils/SimpleEventEmitter";

describe("SimpleEventEmitter", () => {
  it("invokes subscribed listeners when fire is called", () => {
    const emitter = new SimpleEventEmitter<string>();
    const listener = vi.fn();
    emitter.event(listener);
    emitter.fire("payload");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("payload");
  });

  it("dispose removes the listener so it is not called again", () => {
    const emitter = new SimpleEventEmitter<number>();
    const listener = vi.fn();
    const sub = emitter.event(listener);
    sub.dispose();
    emitter.fire(42);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners and calls each with the event", () => {
    const emitter = new SimpleEventEmitter<{ id: number }>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.event(a);
    emitter.event(b);
    const payload = { id: 1 };
    emitter.fire(payload);
    expect(a).toHaveBeenCalledWith(payload);
    expect(b).toHaveBeenCalledWith(payload);
  });

  it("disposing one subscription does not remove other listeners", () => {
    const emitter = new SimpleEventEmitter<void>();
    const first = vi.fn();
    const second = vi.fn();
    const sub1 = emitter.event(first);
    emitter.event(second);
    sub1.dispose();
    emitter.fire();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fire with no listeners does not throw", () => {
    const emitter = new SimpleEventEmitter<string>();
    expect(() => emitter.fire("alone")).not.toThrow();
  });
});
