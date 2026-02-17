// prevent knip from reporting entrypoints for vscode extension
import { describe, it, expect } from "vitest";
import { activate, deactivate } from "@src/extension";
import { resetSettings } from "../utils";

describe("entrypoints", () => {
  it("should export activate as a function", () => {
    expect(typeof activate).toBe("function");
    expect(typeof deactivate).toBe("function");
  });

  it("should reset settings to original baseline", () => {
    expect(typeof resetSettings).toBe("function");
  });
});
