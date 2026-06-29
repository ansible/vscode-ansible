import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { adjustInlineSuggestionIndent } from "@src/features/utils/lightspeed";

type MutableWindow = { activeTextEditor: unknown };

function setEditor(text: string) {
  (vscode.window as unknown as MutableWindow).activeTextEditor = {
    document: {
      lineAt: () => ({ text }),
    },
  };
}

const pos = (character: number) =>
  ({ character }) as unknown as vscode.Position;

describe("adjustInlineSuggestionIndent", () => {
  beforeEach(() => {
    (vscode.window as unknown as MutableWindow).activeTextEditor = undefined;
  });

  afterEach(() => {
    (vscode.window as unknown as MutableWindow).activeTextEditor = undefined;
  });

  it("returns the suggestion unchanged when there is no indentation before the cursor", () => {
    setEditor("hosts: all");
    const suggestion = "foo\nbar";

    const result = adjustInlineSuggestionIndent(suggestion, pos(0));

    expect(result).toBe(suggestion);
  });

  it("returns the suggestion unchanged when there is no active editor", () => {
    (vscode.window as unknown as MutableWindow).activeTextEditor = undefined;
    const suggestion = "foo\nbar";

    const result = adjustInlineSuggestionIndent(suggestion, pos(4));

    expect(result).toBe(suggestion);
  });

  it("re-indents multi-line suggestions based on the leading spaces", () => {
    // 4 leading spaces before the cursor at character 4
    setEditor("    - name: x");
    const suggestion = "    foo\n    bar";

    const result = adjustInlineSuggestionIndent(suggestion, pos(4));

    // index 0 keeps substring(character); later lines are re-prefixed
    expect(result).toBe("foo\n    bar");
  });

  it("filters out malformed lines whose boundary char is a word char", () => {
    // This case intentionally hits the branch that logs via console.error;
    // spy on it to keep test output clean and assert the branch explicitly.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setEditor("    - name: x");
    // line "malf"[3] === "f" (a word char) -> filtered out
    const suggestion = "    foo\nmalf";

    const result = adjustInlineSuggestionIndent(suggestion, pos(4));

    expect(result).toBe("foo");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ignoring malformed line"),
    );
    errorSpy.mockRestore();
  });
});
