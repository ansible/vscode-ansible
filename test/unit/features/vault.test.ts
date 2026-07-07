import { describe, it, expect } from "vitest";
import {
  foldedMultilineReducer,
  handleFoldedMultiline,
} from "@src/features/vault";

describe("foldedMultilineReducer", () => {
  const arr = ["first", "second", "third"];

  it("returns currentValue unchanged at index 0", () => {
    expect(foldedMultilineReducer("", "first", 0, arr)).toBe("first");
  });

  it("joins plain lines with a space", () => {
    expect(foldedMultilineReducer("first", "second", 1, arr)).toBe(
      "first second",
    );
  });

  it("separates with newline when currentValue is empty", () => {
    const a = ["hello", ""];
    expect(foldedMultilineReducer("hello", "", 1, a)).toBe("hello\n");
  });

  it("separates with newline when currentValue starts with whitespace", () => {
    const a = ["hello", "  indented"];
    expect(foldedMultilineReducer("hello", "  indented", 1, a)).toBe(
      "hello\n  indented",
    );
  });

  it("separates with newline when previous line starts with whitespace", () => {
    const a = ["  indented", "next"];
    expect(foldedMultilineReducer("  indented", "next", 1, a)).toBe(
      "  indented\nnext",
    );
  });

  it("appends without space when accumulator ends with newline", () => {
    expect(foldedMultilineReducer("line\n", "next", 1, ["line", "next"])).toBe(
      "line\nnext",
    );
  });

  it("works correctly through Array.reduce with initial value", () => {
    const lines = ["first", "second", "third"];
    const result = lines.reduce(
      (acc, val, idx, a) => foldedMultilineReducer(acc, val, idx, a),
      "",
    );
    expect(result).toBe("first second third");
  });
});

describe("handleFoldedMultiline", () => {
  it.each([
    { style: "default (clip)", header: ">", expected: "hello world\n" },
    { style: "strip", header: ">-", expected: "hello world" },
    { style: "keep", header: ">+", expected: "hello world\n" },
  ])("folds plain lines with $style chomping", ({ header, expected }) => {
    const lines = [header, "  hello", "  world"];
    expect(handleFoldedMultiline(lines, 2)).toBe(expected);
  });

  it("preserves newlines for indented content", () => {
    const lines = [">", "  line1", "    indented", "  line2"];
    const result = handleFoldedMultiline(lines, 2);
    expect(result).toContain("\n");
  });
});
