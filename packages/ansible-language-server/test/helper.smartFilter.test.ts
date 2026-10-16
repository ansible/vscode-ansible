import { CompletionItem } from "vscode-languageserver";
import { describe, expect, it } from "vitest";
import { smartFilter } from "@test/helper.js";

function item(
  label: string,
  sortText: string,
  filterText?: string,
): CompletionItem {
  return {
    label,
    sortText,
    filterText: filterText ?? label,
  };
}

describe("smartFilter()", () => {
  it("prefers label-prefix matches, then filterText-prefix, then sortText", () => {
    const completions = [
      item("zebra", "2_1_zebra", "other zebra"),
      item("alpha", "2_1_alpha", "pin alpha"),
      item("ping", "2_0_ping"),
    ];

    const filtered = smartFilter(completions, "pin");
    expect(filtered.map((c) => c.label)).toEqual(["ping", "alpha"]);
  });

  it("breaks ties with sortText when match rank is equal", () => {
    const completions = [
      item("ping", "2_1_ping"),
      item("pong", "2_0_pong"),
    ];

    const filtered = smartFilter(completions, "p");
    expect(filtered[0]?.label).toBe("pong");
    expect(filtered[1]?.label).toBe("ping");
  });
});
