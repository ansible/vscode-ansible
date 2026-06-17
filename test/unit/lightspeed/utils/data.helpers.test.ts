import { describe, it, expect } from "vitest";
import {
  hasOnlyCommentsAfter,
  populateIndentsUntilFirstListItem,
  scanTaskFileKeywordsBackward,
  isCommentOnlyDocument,
  matchesPreviousLineColumn,
  collectFirstListItemIndent,
  scanPlaybookKeywordsBackward,
} from "@src/features/lightspeed/utils/data";

describe("hasOnlyCommentsAfter", () => {
  it("returns true when no lines follow fromIndex", () => {
    expect(hasOnlyCommentsAfter(["block:"], 0)).toBe(true);
  });

  it("returns true for only blank lines after", () => {
    expect(hasOnlyCommentsAfter(["block:", "", ""], 0)).toBe(true);
  });

  it("returns true for only comment lines after", () => {
    expect(hasOnlyCommentsAfter(["block:", "# c1", "# c2"], 0)).toBe(true);
  });

  it("returns true for mixed blank and comment lines", () => {
    expect(hasOnlyCommentsAfter(["block:", "", "# c1", "", "# c2"], 0)).toBe(
      true,
    );
  });

  it("returns false when a non-comment line follows", () => {
    expect(
      hasOnlyCommentsAfter(["block:", "# comment", "- name: task"], 0),
    ).toBe(false);
  });

  it("returns false for a non-comment immediately after", () => {
    expect(hasOnlyCommentsAfter(["block:", "- name: task"], 0)).toBe(false);
  });

  it("scans from the correct fromIndex", () => {
    expect(
      hasOnlyCommentsAfter(["- name: a", "block:", "# only comments"], 1),
    ).toBe(true);
  });
});

describe("populateIndentsUntilFirstListItem", () => {
  it("records indent of first list item found after fromIndex", () => {
    const lines = ["block:", "  - name: a", "  - name: b"];
    const indents = [-1, -1, -1];
    populateIndentsUntilFirstListItem(lines, 0, indents);
    expect(indents[1]).toBe(2);
  });

  it("does nothing when no list item follows", () => {
    const lines = ["block:", "# comment", "  not-a-list"];
    const indents = [-1, -1, -1];
    populateIndentsUntilFirstListItem(lines, 0, indents);
    expect(indents).toEqual([-1, -1, -1]);
  });

  it("does not overwrite an existing indent", () => {
    const lines = ["block:", "  - name: a"];
    const indents = [-1, 42];
    populateIndentsUntilFirstListItem(lines, 0, indents);
    expect(indents[1]).toBe(42);
  });

  it("handles list item at zero indent", () => {
    const lines = ["block:", "- name: a"];
    const indents = [-1, -1];
    populateIndentsUntilFirstListItem(lines, 0, indents);
    expect(indents[1]).toBe(0);
  });

  it("skips non-list lines until first list item", () => {
    const lines = ["block:", "  some_key: val", "    - name: deep"];
    const indents = [-1, -1, -1];
    populateIndentsUntilFirstListItem(lines, 0, indents);
    expect(indents[1]).toBe(-1);
    expect(indents[2]).toBe(4);
  });
});

describe("scanTaskFileKeywordsBackward", () => {
  it("returns earlyResult=null when no keywords found", () => {
    const lines = ["- name: a", "- name: b"];
    const indents = [-1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 2, indents);
    expect(result.earlyResult).toBeNull();
    expect(result.firstMatchKeywordIndent).toBe(-1);
  });

  it("returns early when only comments follow the keyword", () => {
    const lines = ["block:", "# comment"];
    const indents = [-1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 2, indents);
    expect(result.earlyResult).toBe(true);
    expect(result.firstMatchKeywordIndent).toBe(0);
  });

  it("returns earlyResult=false when cursor is not deeper than keyword", () => {
    const lines = ["block:", "# comment"];
    const indents = [-1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 0, indents);
    expect(result.earlyResult).toBe(false);
  });

  it("populates indents when tasks follow the keyword", () => {
    const lines = ["block:", "  - name: a", "  - name: b"];
    const indents = [-1, -1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 2, indents);
    expect(result.earlyResult).toBeNull();
    expect(result.firstMatchKeywordIndent).toBe(0);
    expect(indents[0]).toBe(1);
    expect(indents[1]).toBe(2);
  });

  it("handles multiple keywords (rescue then block in backward order)", () => {
    const lines = ["block:", "  - name: a", "rescue:", "  - name: b"];
    const indents = [-1, -1, -1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 2, indents);
    expect(result.earlyResult).toBeNull();
    expect(result.firstMatchKeywordIndent).toBe(0);
  });

  it("records firstMatchKeywordIndent from the first keyword hit (backward)", () => {
    const lines = ["  block:", "    - name: a", "block:", "  - name: b"];
    const indents = [-1, -1, -1, -1];
    const result = scanTaskFileKeywordsBackward(lines, 4, indents);
    expect(result.firstMatchKeywordIndent).toBe(0);
  });
});

describe("isCommentOnlyDocument", () => {
  it("returns true for all-comment lines", () => {
    const lines = ["# a", "# b"];
    const indents = [-1, -1];
    expect(isCommentOnlyDocument(lines, indents)).toBe(true);
  });

  it("returns true for comments with blank lines and YAML marker", () => {
    const lines = ["---", "", "# comment", ""];
    const indents = [-1, -1, -1, -1];
    expect(isCommentOnlyDocument(lines, indents)).toBe(true);
  });

  it("returns false when a non-comment, non-blank, non-marker line exists", () => {
    const lines = ["# header", "- name: task"];
    const indents = [-1, -1];
    expect(isCommentOnlyDocument(lines, indents)).toBe(false);
  });

  it("populates indent for first list item encountered", () => {
    const lines = ["# header", "  - name: task"];
    const indents = [-1, -1];
    isCommentOnlyDocument(lines, indents);
    expect(indents[1]).toBe(2);
  });

  it("breaks at the first list item", () => {
    const lines = ["# header", "- name: a", "not-a-list"];
    const indents = [-1, -1, -1];
    isCommentOnlyDocument(lines, indents);
    expect(indents[1]).toBe(0);
    expect(indents[2]).toBe(-1);
  });

  it("returns true for empty document", () => {
    expect(isCommentOnlyDocument([], [])).toBe(true);
  });

  it("returns true for only YAML marker", () => {
    const lines = ["---"];
    const indents = [-1];
    expect(isCommentOnlyDocument(lines, indents)).toBe(true);
  });
});

describe("matchesPreviousLineColumn", () => {
  it("returns false when linePromptStart is 0 (previousLinePrompt = -2)", () => {
    expect(matchesPreviousLineColumn([0], 0, 0)).toBe(false);
  });

  it("returns false when linePromptStart is 1 (previousLinePrompt = -1)", () => {
    expect(matchesPreviousLineColumn([0], 0, 1)).toBe(false);
  });

  it("returns true when previousLinePrompt is 0 and indent matches", () => {
    expect(matchesPreviousLineColumn([2], 2, 2)).toBe(true);
  });

  it("returns false when previous line indent does not match cursor", () => {
    expect(matchesPreviousLineColumn([-1, 4], 2, 3)).toBe(false);
  });

  it("returns true when ancestor line has matching indent", () => {
    const indents = [0, -1, 2];
    expect(matchesPreviousLineColumn(indents, 2, 4)).toBe(true);
  });

  it("returns false when no ancestor has a matching indent", () => {
    const indents = [-1, -1, 2];
    expect(matchesPreviousLineColumn(indents, 2, 4)).toBe(false);
  });

  it("returns true when ancestor indent is shallower than cursor", () => {
    const indents = [0, 2, 2];
    expect(matchesPreviousLineColumn(indents, 2, 4)).toBe(true);
  });
});

describe("collectFirstListItemIndent", () => {
  it("collects indent from the first list item after fromIndex", () => {
    const lines = ["tasks:", "    - name: a"];
    const indents: number[] = [];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([4]);
  });

  it("does nothing when no list item follows", () => {
    const lines = ["tasks:", "# comment"];
    const indents: number[] = [];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([]);
  });

  it("does not add duplicate indent values", () => {
    const lines = ["tasks:", "  - name: a"];
    const indents: number[] = [2];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([2]);
  });

  it("adds unique indent value", () => {
    const lines = ["tasks:", "      - name: deep"];
    const indents: number[] = [0];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([0, 6]);
  });

  it("handles zero-indent list item", () => {
    const lines = ["tasks:", "- name: a"];
    const indents: number[] = [];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([0]);
  });

  it("skips non-list lines to find first list item", () => {
    const lines = ["tasks:", "  some_key: val", "  - name: a"];
    const indents: number[] = [];
    collectFirstListItemIndent(lines, 0, indents);
    expect(indents).toEqual([2]);
  });
});

describe("scanPlaybookKeywordsBackward", () => {
  it("returns earlyResult=null when no keywords found", () => {
    const lines = ["- hosts: all", "  become: true"];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 4, indents);
    expect(result.earlyResult).toBeNull();
    expect(result.firstMatchKeywordIndent).toBe(-1);
  });

  it("returns early when only comments follow the keyword", () => {
    const lines = ["- hosts: all", "  tasks:", "  # a comment"];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 4, indents);
    expect(result.earlyResult).toBe(true);
    expect(result.firstMatchKeywordIndent).toBe(2);
  });

  it("returns earlyResult=false when cursor is not deeper than keyword", () => {
    const lines = ["- hosts: all", "  tasks:", "  # a comment"];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 1, indents);
    expect(result.earlyResult).toBe(false);
  });

  it("collects indent from list items after keyword", () => {
    const lines = [
      "- hosts: all",
      "  tasks:",
      "    - name: a",
      "    - name: b",
    ];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 4, indents);
    expect(result.earlyResult).toBeNull();
    expect(result.firstMatchKeywordIndent).toBe(2);
    expect(indents).toContain(4);
  });

  it("handles multiple keywords collecting unique indents", () => {
    const lines = [
      "- hosts: all",
      "  tasks:",
      "    - name: t",
      "  handlers:",
      "    - name: h",
    ];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 4, indents);
    expect(result.earlyResult).toBeNull();
    expect(indents).toContain(4);
  });

  it("records firstMatchKeywordIndent from the first hit in backward scan", () => {
    const lines = [
      "- hosts: all",
      "  tasks:",
      "    - name: a",
      "    handlers:",
      "      - name: b",
    ];
    const indents: number[] = [];
    const result = scanPlaybookKeywordsBackward(lines, 6, indents);
    expect(result.firstMatchKeywordIndent).toBe(4);
  });
});
