import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarkupKind } from "vscode-languageserver";
import type {
  PluginDoc,
  PluginOption,
} from "@ansible/core/out/services/CollectionsService";

vi.mock("antsibull-docs", () => ({
  parse: (text: string) => text,
  toMD: (text: string) => text,
}));

let formatModule: typeof import("../../src/utils/docsFormatter").formatModule;
let formatOption: typeof import("../../src/utils/docsFormatter").formatOption;
let getDetails: typeof import("../../src/utils/docsFormatter").getDetails;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../src/utils/docsFormatter");
  formatModule = mod.formatModule;
  formatOption = mod.formatOption;
  getDetails = mod.getDetails;
});

describe("formatModule", () => {
  it("returns empty markdown for a minimal doc", () => {
    const doc: PluginDoc = {};
    const result = formatModule(doc);
    expect(result.kind).toBe(MarkupKind.Markdown);
    expect(result.value).toBe("");
  });

  it("includes short_description in italics", () => {
    const doc: PluginDoc = { short_description: "Do something" };
    const result = formatModule(doc);
    expect(result.value).toContain("*Do something*");
  });

  it("includes description section", () => {
    const doc: PluginDoc = { description: "Full description text" };
    const result = formatModule(doc);
    expect(result.value).toContain("**Description**");
    expect(result.value).toContain("Full description text");
  });

  it("includes requirements section", () => {
    const doc: PluginDoc = { requirements: ["python >= 3.8"] };
    const result = formatModule(doc);
    expect(result.value).toContain("**Requirements**");
    expect(result.value).toContain("python >= 3.8");
  });

  it("includes notes section", () => {
    const doc: PluginDoc = { notes: ["Some note"] };
    const result = formatModule(doc);
    expect(result.value).toContain("**Notes**");
    expect(result.value).toContain("Some note");
  });

  it("formats array descriptions as a bulleted list", () => {
    const doc: PluginDoc = { description: ["Line one", "Line two"] };
    const result = formatModule(doc);
    expect(result.value).toContain("- Line one");
    expect(result.value).toContain("- Line two");
  });

  it("assembles all sections in order", () => {
    const doc: PluginDoc = {
      short_description: "Short",
      description: "Long",
      requirements: "Req",
      notes: "Note",
    };
    const result = formatModule(doc);
    const parts = result.value.split("\n\n");
    expect(parts[0]).toContain("Short");
    expect(parts[1]).toContain("Description");
    expect(parts[3]).toContain("Requirements");
    expect(parts[5]).toContain("Notes");
  });
});

describe("formatOption", () => {
  it("returns empty markdown for a minimal option", () => {
    const option: PluginOption = {};
    const result = formatOption(option, "opt");
    expect(result.kind).toBe(MarkupKind.Markdown);
    expect(result.value).toBe("");
  });

  it("includes description without list markers", () => {
    const option: PluginOption = { description: ["Line A", "Line B"] };
    const result = formatOption(option, "opt");
    expect(result.value).toContain("Line A");
    expect(result.value).toContain("Line B");
    expect(result.value).not.toContain("- Line A");
  });

  it("includes default value in a code fence", () => {
    const option: PluginOption = { default: "present" };
    const result = formatOption(option, "state");
    expect(result.value).toContain("*Default*:");
    expect(result.value).toContain("```javascript");
    expect(result.value).toContain("present");
  });

  it("includes choices list", () => {
    const option: PluginOption = { choices: ["present", "absent"] };
    const result = formatOption(option, "state");
    expect(result.value).toContain("*Choices*:");
    expect(result.value).toContain("`present`");
    expect(result.value).toContain("`absent`");
  });

  it("includes aliases with the base name", () => {
    const option: PluginOption = { aliases: ["pkg", "package"] };
    const result = formatOption(option, "name");
    expect(result.value).toContain("*Aliases*:");
    expect(result.value).toContain("`name`");
    expect(result.value).toContain("`pkg`");
    expect(result.value).toContain("`package`");
  });

  it("prepends details when withDetails is true", () => {
    const option: PluginOption = { required: true, type: "str" };
    const result = formatOption(option, "name", true);
    expect(result.value).toContain("`(required) str`");
  });

  it("omits details when withDetails is false", () => {
    const option: PluginOption = { required: true, type: "str" };
    const result = formatOption(option, "name", false);
    expect(result.value).not.toContain("(required)");
  });
});

describe("getDetails", () => {
  it("returns undefined for an empty option", () => {
    expect(getDetails({})).toBeUndefined();
  });

  it("returns '(required)' when required", () => {
    expect(getDetails({ required: true })).toBe("(required)");
  });

  it("returns the type name", () => {
    expect(getDetails({ type: "str" })).toBe("str");
  });

  it("returns list with element type", () => {
    expect(getDetails({ type: "list", elements: "str" })).toBe("list(str)");
  });

  it("returns plain 'list' when no elements", () => {
    expect(getDetails({ type: "list" })).toBe("list");
  });

  it("combines required and type", () => {
    expect(getDetails({ required: true, type: "dict" })).toBe(
      "(required) dict",
    );
  });
});
