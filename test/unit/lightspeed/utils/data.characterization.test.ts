import { describe, it, expect } from "vitest";
import { shouldTriggerMultiTaskSuggestion } from "@src/features/lightspeed/utils/data";
import type { IAnsibleFileType } from "@src/interfaces/lightspeed";

/**
 * Characterization (golden-master) test for the multi-task suggestion trigger
 * heuristics in data.ts. These two functions
 * (`shouldTriggerMultiTaskSuggestionForTaskFile` / `...ForPlaybook`) are
 * module-private and untested; this snapshot locks their CURRENT observable
 * behavior through the public entry point so the cognitive-complexity refactor
 * can be proven behavior-preserving. If a snapshot value changes, behavior
 * changed — investigate before updating the snapshot.
 */

// Representative documents exercising: comment-only, YAML markers, simple task
// lists, block/rescue/always, "only comments after keyword", nested blocks,
// playbook tasks/handlers/pre_tasks, and trailing blanks.
const DOCUMENTS: Record<string, string> = {
  empty: "",
  commentsOnly: "# a comment\n# another comment",
  markerAndComments: "---\n# only a comment after marker",
  simpleTaskList:
    "- name: first\n  ansible.builtin.debug:\n- name: second\n  ansible.builtin.debug:",
  blockTaskFile:
    "- name: outer\n  block:\n    - name: inner\n      ansible.builtin.debug:",
  blockOnlyCommentsAfter: "block:\n# c1\n# c2",
  rescueAlways:
    "block:\n  - name: a\nrescue:\n  - name: b\nalways:\n  - name: c",
  playbookTasks:
    "- hosts: all\n  tasks:\n    - name: a\n      ansible.builtin.debug:",
  playbookTasksOnlyCommentsAfter: "- hosts: all\n  tasks:\n  # a comment",
  playbookHandlers:
    "- hosts: all\n  handlers:\n    - name: h\n  tasks:\n    - name: t",
  playbookPreTasks: "- hosts: all\n  pre_tasks:\n    - name: p",
  nestedBlocks:
    "- hosts: all\n  tasks:\n    - block:\n        - name: x\n      rescue:\n        - name: y",
  trailingBlankLines: "- name: a\n  ansible.builtin.debug:\n\n",
  // blank line(s) between a keyword and trailing comments -> exercises the
  // "skip blank line" branch of hasOnlyCommentsAfter.
  blockBlankThenComments: "block:\n\n# trailing comment\n",
  // keyword followed by a real (non-comment, non-blank) line -> the
  // "not only comments after keyword" branch.
  blockThenTasks: "block:\n  - name: a\n  - name: b\n  - name: c",
  // multiple keyword sections with list items at several indents -> populates
  // the per-line trigger-indent map across columns.
  multiKeywordIndents:
    "rescue:\n  - name: r\nalways:\n    - name: a\nblock:\n      - name: b",
  // deeply indented playbook task block.
  deepPlaybookTasks:
    "- hosts: all\n  tasks:\n      - name: deep\n        ansible.builtin.debug:",
  // a leading comment (index 0 stays unset) before the keyword, so the
  // "previous line matches but no earlier line does" fall-through is reached.
  commentThenBlock: "# lead\nblock:\n  - name: a\n  - name: b",
};

const SPACES = [0, 1, 2, 3, 4, 6, 8, 10];
const PROMPT_LINES = [0, 1, 2, 3, 4, 99];
const FILE_TYPES: IAnsibleFileType[] = [
  "playbook",
  "tasks",
  "tasks_in_role",
  "other",
];

describe("shouldTriggerMultiTaskSuggestion (characterization)", () => {
  it("matches the golden-master result matrix", () => {
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const [docName, content] of Object.entries(DOCUMENTS)) {
      for (const fileType of FILE_TYPES) {
        for (const spaces of SPACES) {
          for (const promptLine of PROMPT_LINES) {
            (matrix[docName] ??= {})[`${fileType}|s${spaces}|p${promptLine}`] =
              shouldTriggerMultiTaskSuggestion(
                content,
                spaces,
                promptLine,
                fileType,
              );
          }
        }
      }
    }
    expect(matrix).toMatchSnapshot();
  });
});
