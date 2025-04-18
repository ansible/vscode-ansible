import assert from "assert";
import {
  textIsOnlyLineNumber,
  digitsInNumber,
  countNewlinesBeforePosition,
  getStringBetweenNewlines,
  shouldRemoveLine,
  calculateNewCursorPosition,
} from "../../../../webviews/lightspeed/src/utils/outlineLineNumbers";

describe("outlineLineNumbers.ts", () => {
  describe("textIsOnlyLineNumber", () => {
    it("should return true for valid line numbers or partial line numbers", () => {
      assert.strictEqual(textIsOnlyLineNumber("1. "), true);
      assert.strictEqual(textIsOnlyLineNumber("123. "), true);
      assert.strictEqual(textIsOnlyLineNumber("1"), true);
      assert.strictEqual(textIsOnlyLineNumber("1."), true);
    });

    it("should return false for strings that aren't exclusively line numbers", () => {
      assert.strictEqual(textIsOnlyLineNumber("abc"), false);
      assert.strictEqual(textIsOnlyLineNumber("1a. "), false);
      assert.strictEqual(textIsOnlyLineNumber("1.abc"), false);
      assert.strictEqual(textIsOnlyLineNumber("1. 2"), false);
      assert.strictEqual(textIsOnlyLineNumber("1.2"), false);
      assert.strictEqual(textIsOnlyLineNumber("1. 2. "), false);
    });
  });

  describe("digitsInNumber", () => {
    it("should return the correct number of digits", () => {
      assert.strictEqual(digitsInNumber(1), 1);
      assert.strictEqual(digitsInNumber(12), 2);
      assert.strictEqual(digitsInNumber(123), 3);
      assert.strictEqual(digitsInNumber(1234), 4);
    });
  });

  describe("countNewlinesBeforePosition", () => {
    it("should count newlines correctly", () => {
      const text = "line1\nline2\nline3\n\n\n\nline8\nline9";
      assert.strictEqual(countNewlinesBeforePosition(text, 6), 1);
      assert.strictEqual(countNewlinesBeforePosition(text, 12), 2);
      assert.strictEqual(countNewlinesBeforePosition(text, 20), 5);
      assert.strictEqual(countNewlinesBeforePosition(text, 25), 6);
    });

    it("should handle consecutive newlines correctly", () => {
      const text = "line1\n\n\nline4\nline5";
      assert.strictEqual(countNewlinesBeforePosition(text, 6), 1);
      assert.strictEqual(countNewlinesBeforePosition(text, 7), 2);
      assert.strictEqual(countNewlinesBeforePosition(text, 8), 3);
      assert.strictEqual(countNewlinesBeforePosition(text, 14), 4);
    });
  });

  describe("getStringBetweenNewlines", () => {
    it("should return the correct substring", () => {
      const text = "line1\nline2\nline3\n\n\n\n\nline8\nline9";
      assert.strictEqual(getStringBetweenNewlines(text, 7), "line2");
      assert.strictEqual(getStringBetweenNewlines(text, 18), "");
      assert.strictEqual(getStringBetweenNewlines(text, 30), "line9");
    });
  });

  describe("shouldRemoveLine", () => {
    it("should return true for removable line numbers", () => {
      assert.strictEqual(shouldRemoveLine("1.", 1), true);
      assert.strictEqual(shouldRemoveLine("12.", 2), true);
      assert.strictEqual(shouldRemoveLine("123.", 3), true);
      assert.strictEqual(shouldRemoveLine("1234.", 4), true);
    });

    it("should return false for non-removable line numbers", () => {
      assert.strictEqual(shouldRemoveLine("12.", 1), false);
      assert.strictEqual(shouldRemoveLine("123.", 2), false);
      assert.strictEqual(shouldRemoveLine("1. ", 1), false);
      assert.strictEqual(shouldRemoveLine("1. Install node", 1), false);
    });
  });

  describe("calculateNewCursorPosition", () => {
    it("should calculate the correct new cursor position", () => {
      const text = "1. line1\n2. line2\n3. line3\n\n\n\nline8\nline9";
      assert.strictEqual(calculateNewCursorPosition(text, 8, 0, 1), 8);
      assert.strictEqual(calculateNewCursorPosition(text, 9, 0, 1), 12);
      assert.strictEqual(calculateNewCursorPosition(text, 28, 0, 1), 31);
    });
  });
});
