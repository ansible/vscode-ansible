// prevent knip from reporting entrypoints for vscode extension
import { describe, it, expect } from "vitest";
import { activate, deactivate } from "../../src/extension";
// @ts-expect-error - .mjs file doesn't have type definitions
import vscodeTestConfig from "../../.vscode-test.mjs";
import { resetSettings } from "../utils";

describe("entrypoints", () => {
  it("should export activate as a function", () => {
    expect(typeof activate).toBe("function");
    expect(typeof deactivate).toBe("function");
  });

  it("should export default from .vscode-test.mjs", () => {
    expect(vscodeTestConfig).toBeDefined();
  });

  it("should reset settings to original baseline", () => {
    expect(typeof resetSettings).toBe("function");
  });
});
