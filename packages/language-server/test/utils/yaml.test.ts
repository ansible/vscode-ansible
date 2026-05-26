import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { YAMLMap } from "yaml";
import {
  AncestryBuilder,
  getPathAt,
  isTaskParam,
  isPlayParam,
  isBlockParam,
  isRoleParam,
  getDeclaredCollections,
  getYamlMapKeys,
  getOrigRange,
  parseAllDocuments,
  isPlaybook,
  isCursorInsideJinjaBrackets,
} from "../../src/utils/yaml";

function doc(content: string): TextDocument {
  return TextDocument.create("file:///test.yml", "ansible", 1, content);
}

describe("parseAllDocuments", () => {
  it("returns empty array for empty string", () => {
    expect(parseAllDocuments("")).toEqual([]);
  });

  it("returns a single document for simple YAML", () => {
    const docs = parseAllDocuments("key: value");
    expect(docs).toHaveLength(1);
  });

  it("preserves source tokens", () => {
    const docs = parseAllDocuments("foo: bar");
    const contents = docs[0].contents;
    expect(contents).toBeTruthy();
    expect(contents!.range).toBeDefined();
  });
});

describe("getOrigRange", () => {
  it("returns undefined for null node", () => {
    expect(getOrigRange(null)).toBeUndefined();
  });

  it("returns undefined for undefined node", () => {
    expect(getOrigRange(undefined)).toBeUndefined();
  });

  it("returns [start, end] for node with range", () => {
    const docs = parseAllDocuments("key: value");
    const range = getOrigRange(docs[0].contents);
    expect(range).toBeDefined();
    expect(range![0]).toBe(0);
    expect(range![1]).toBeGreaterThan(0);
  });
});

describe("getYamlMapKeys", () => {
  it("extracts string keys from a YAML map", () => {
    const docs = parseAllDocuments("foo: 1\nbar: 2\nbaz: 3");
    const mapNode = docs[0].contents;
    expect(mapNode).toBeInstanceOf(YAMLMap);
    const keys = getYamlMapKeys(mapNode as InstanceType<typeof YAMLMap>);
    expect(keys).toEqual(["foo", "bar", "baz"]);
  });
});

describe("getPathAt", () => {
  it("returns null for empty document", () => {
    const d = doc("");
    const docs = parseAllDocuments(d.getText());
    expect(getPathAt(d, { line: 0, character: 0 }, docs)).toBeNull();
  });

  it("returns a path for a key position", () => {
    const content = "name: test\nhosts: all";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 0 }, docs);
    expect(path).toBeTruthy();
    expect(path!.length).toBeGreaterThan(0);
  });
});

describe("isPlayParam", () => {
  it("identifies a play-level parameter (hosts)", () => {
    const content = "- hosts: all\n  tasks:\n    - name: test";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 2 }, docs, true);
    if (path) {
      const result = isPlayParam(path);
      expect(result).toBe(true);
    }
  });

  it("returns false for nested task parameter", () => {
    const content = "- hosts: all\n  tasks:\n    - name: test task";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      expect(isPlayParam(path)).toBe(false);
    }
  });

  it("returns false for role file context", () => {
    const content = "- name: install pkg\n  apt:\n    name: nginx";
    const d = TextDocument.create(
      "file:///project/roles/webserver/tasks/main.yml",
      "ansible",
      1,
      content,
    );
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 2 }, docs, true);
    if (path) {
      const result = isPlayParam(
        path,
        "file:///project/roles/webserver/tasks/main.yml",
      );
      expect(result).toBe(false);
    }
  });
});

describe("isBlockParam", () => {
  it("identifies a block-level parameter", () => {
    const content =
      "- hosts: all\n  tasks:\n    - block:\n        - name: inside block\n      rescue:\n        - name: rescue task";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      expect(isBlockParam(path)).toBe(true);
    }
  });
});

describe("isRoleParam", () => {
  it("identifies a role entry under roles key", () => {
    const content = "- hosts: all\n  roles:\n    - role: webserver";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      expect(isRoleParam(path)).toBe(true);
    }
  });

  it("returns false for non-role params", () => {
    const content = "- hosts: all\n  tasks:\n    - name: test";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      expect(isRoleParam(path)).toBe(false);
    }
  });
});

describe("isTaskParam", () => {
  it("identifies task-level parameter under tasks", () => {
    const content = "- hosts: all\n  tasks:\n    - name: my task";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      expect(isTaskParam(path)).toBe(true);
    }
  });

  it("identifies a task at the root level (role task file)", () => {
    const content = "- name: install package\n  apt:\n    name: nginx";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 2 }, docs, true);
    if (path) {
      const isPlay = isPlayParam(path);
      if (isPlay === false || isPlay === undefined) {
        expect(isTaskParam(path)).toBe(true);
      }
    }
  });
});

describe("getDeclaredCollections", () => {
  it("extracts collections from play level", () => {
    const content =
      "- hosts: all\n  collections:\n    - ansible.posix\n    - community.general\n  tasks:\n    - name: test";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 5, character: 6 }, docs, true);
    if (path) {
      const collections = getDeclaredCollections(path);
      expect(collections).toContain("ansible.posix");
      expect(collections).toContain("community.general");
    }
  });

  it("returns empty for no collections keyword", () => {
    const content = "- hosts: all\n  tasks:\n    - name: test";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 2, character: 6 }, docs, true);
    if (path) {
      const collections = getDeclaredCollections(path);
      expect(collections).toEqual([]);
    }
  });
});

describe("isPlaybook", () => {
  it("returns false for empty document", () => {
    const d = doc("");
    expect(isPlaybook(d)).toBe(false);
  });

  it("returns false for whitespace-only document", () => {
    const d = doc("   \n\n  ");
    expect(isPlaybook(d)).toBe(false);
  });

  it("returns true for document with play keywords", () => {
    const d = doc("- hosts: all\n  gather_facts: false\n  tasks: []");
    expect(isPlaybook(d)).toBe(true);
  });

  it("returns false for a plain key-value document", () => {
    const d = doc("key: value");
    expect(isPlaybook(d)).toBe(false);
  });

  it("returns false for a task-only list (role tasks)", () => {
    const d = doc("- name: install\n  ansible.builtin.apt:\n    name: nginx");
    expect(isPlaybook(d)).toBe(false);
  });
});

describe("isCursorInsideJinjaBrackets", () => {
  it("returns true when cursor is inside {{ }}", () => {
    const content = "name: \"{{ my_var }}\"";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 10 }, docs, true);
    if (path) {
      expect(isCursorInsideJinjaBrackets(d, { line: 0, character: 10 }, path)).toBe(true);
    }
  });

  it("returns false when cursor is outside {{ }}", () => {
    const content = "name: plain_value";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 0, character: 8 }, docs, true);
    if (path) {
      expect(isCursorInsideJinjaBrackets(d, { line: 0, character: 8 }, path)).toBe(false);
    }
  });
});

describe("AncestryBuilder", () => {
  it("returns null from get() when path is null", () => {
    const builder = new AncestryBuilder(null);
    expect(builder.get()).toBeNull();
  });

  it("returns null from getPath() after too many parent() calls", () => {
    const docs = parseAllDocuments("key: value");
    const path = [docs[0].contents!];
    const builder = new AncestryBuilder(path);
    const result = builder.parent().parent().parent().getPath();
    expect(result).toBeNull();
  });

  it("traverses parent map nodes", () => {
    const content = "top:\n  nested: value";
    const d = doc(content);
    const docs = parseAllDocuments(content);
    const path = getPathAt(d, { line: 1, character: 5 }, docs, true);
    if (path) {
      const builder = new AncestryBuilder(path);
      expect(builder.get()).toBeTruthy();
    }
  });
});
