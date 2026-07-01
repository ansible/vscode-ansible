import { describe, it, expect } from "vitest";
import {
  removeLine,
  reapplyLineNumbers,
  calculateNewCursorPosition,
  countNewlinesBeforePosition,
} from "@webviews/lightspeed/src/utils/outlineLineNumbers";

function makeTextarea(value: string): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.value = value;
  return ta;
}

describe("outlineLineNumbers (webview copy)", () => {
  describe("removeLine", () => {
    it("keeps the remainder when a next newline exists", () => {
      // value: "1. a\n2.\n3. c" -> cursor at end of bare "2." (index 7)
      const ta = makeTextarea("1. a\n2.\n3. c");
      const originalPosition = 7;
      const previousNewLineIndex = ta.value.lastIndexOf(
        "\n",
        originalPosition - 1,
      );
      removeLine(ta, originalPosition, previousNewLineIndex);
      expect(ta.value).toBe("1. a\n3. c");
    });

    it("drops the trailing line when there is no next newline (last line)", () => {
      // value: "1. a\n2." -> cursor at end (index 7), no newline after
      const ta = makeTextarea("1. a\n2.");
      const originalPosition = 7;
      const previousNewLineIndex = ta.value.lastIndexOf(
        "\n",
        originalPosition - 1,
      );
      removeLine(ta, originalPosition, previousNewLineIndex);
      expect(ta.value).toBe("1. a");
    });
  });

  describe("reapplyLineNumbers", () => {
    it("renumbers each line, preserving content after an existing number", () => {
      const ta = makeTextarea("1. a\nb\n3. c");
      reapplyLineNumbers(ta);
      expect(ta.value).toBe("1. a\n2. b\n3. c");
    });
  });

  describe("calculateNewCursorPosition", () => {
    it("jumps past the inserted number when the previous char is a newline", () => {
      const text = "x\ny";
      // text[originalPosition - 1] === "\n" -> originalPosition = 2
      expect(calculateNewCursorPosition(text, 2, 1, 1)).toBe(2 + 1 + 2);
    });

    it("snaps to after the number when the cursor sits inside the number region", () => {
      // originalPosition - previousNewLineIndex < numDigits + 3
      // 5 - 4 = 1 < 1 + 3 = 4 -> returns previousNewLineIndex + numDigits + 3
      const text = "1. a\nb";
      expect(calculateNewCursorPosition(text, 5, 4, 1)).toBe(4 + 1 + 3);
    });

    it("returns the original position in the fall-through case", () => {
      // not preceded by newline, and outside the number region
      const text = "1. abcdefg";
      expect(calculateNewCursorPosition(text, 9, 0, 1)).toBe(9);
    });
  });

  describe("countNewlinesBeforePosition", () => {
    it("returns 0 (|| [] branch) when there are no newlines", () => {
      expect(countNewlinesBeforePosition("no newlines here", 5)).toBe(0);
    });

    it("counts the newlines before the given position", () => {
      expect(countNewlinesBeforePosition("a\nb\nc", 5)).toBe(2);
    });
  });
});
