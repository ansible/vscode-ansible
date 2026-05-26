import { describe, it, expect } from "vitest";
import {
  parseModelineLanguage,
  searchModelineLanguage,
  looksLikePlaybook,
  isYamlExtension,
} from "../../../src/features/fileDetection";

describe("parseModelineLanguage", () => {
  it("extracts language=ansible from a standard modeline", () => {
    expect(parseModelineLanguage("# code: language=ansible")).toBe("ansible");
  });

  it("extracts lang=ansible (short form)", () => {
    expect(parseModelineLanguage("# code: lang=ansible")).toBe("ansible");
  });

  it("extracts language=yaml", () => {
    expect(parseModelineLanguage("# code: language=yaml")).toBe("yaml");
  });

  it("is case-insensitive for the key name", () => {
    expect(parseModelineLanguage("# code: Language=ansible")).toBe("ansible");
    expect(parseModelineLanguage("# code: LANG=ansible")).toBe("ansible");
  });

  it("strips surrounding quotes from the value", () => {
    expect(parseModelineLanguage("# code: language='ansible'")).toBe(
      "ansible",
    );
    expect(parseModelineLanguage('# code: language="ansible"')).toBe(
      "ansible",
    );
  });

  it("returns undefined for lines with no modeline", () => {
    expect(parseModelineLanguage("---")).toBeUndefined();
    expect(parseModelineLanguage("- hosts: all")).toBeUndefined();
    expect(parseModelineLanguage("")).toBeUndefined();
  });

  it("returns undefined when code: is present but no language option", () => {
    expect(parseModelineLanguage("# code: tabsize=4")).toBeUndefined();
  });

  it("allows up to 8 characters before code:", () => {
    expect(parseModelineLanguage("12345678code: language=ansible")).toBe(
      "ansible",
    );
    expect(
      parseModelineLanguage("123456789code: language=ansible"),
    ).toBeUndefined();
  });

  it("handles multiple options, takes the last language match", () => {
    expect(
      parseModelineLanguage("# code: lang=yaml language=ansible"),
    ).toBe("ansible");
  });
});

describe("searchModelineLanguage", () => {
  it("finds modeline on the first line", () => {
    const text = "# code: language=ansible\n---\n- hosts: all\n";
    expect(searchModelineLanguage(text)).toBe("ansible");
  });

  it("finds modeline on the last line", () => {
    const lines = [
      "---",
      "- hosts: all",
      "  tasks:",
      "    - debug:",
      "        msg: hello",
      "    - debug:",
      "        msg: world",
      "    - debug:",
      "        msg: foo",
      "    - debug:",
      "        msg: bar",
      "    - debug:",
      "        msg: baz",
      "# code: language=ansible",
    ];
    expect(searchModelineLanguage(lines.join("\n"))).toBe("ansible");
  });

  it("returns undefined when no modeline is present", () => {
    const text = "---\n- hosts: all\n  tasks: []\n";
    expect(searchModelineLanguage(text)).toBeUndefined();
  });

  it("ignores lines longer than 500 characters", () => {
    const longLine = "# code: language=ansible" + " ".repeat(500);
    expect(searchModelineLanguage(longLine)).toBeUndefined();
  });

  it("works with very short files (fewer than 10 lines)", () => {
    expect(searchModelineLanguage("# code: language=ansible")).toBe(
      "ansible",
    );
    expect(
      searchModelineLanguage("---\n# code: language=ansible"),
    ).toBe("ansible");
  });
});

describe("looksLikePlaybook", () => {
  it("detects a playbook with hosts key", () => {
    const text = "---\n- hosts: all\n  tasks: []\n";
    expect(looksLikePlaybook(text)).toBe(true);
  });

  it("detects a playbook with import_playbook key", () => {
    const text = "---\n- import_playbook: other.yml\n";
    expect(looksLikePlaybook(text)).toBe(true);
  });

  it("detects ansible.builtin.import_playbook", () => {
    const text = "---\n- ansible.builtin.import_playbook: other.yml\n";
    expect(looksLikePlaybook(text)).toBe(true);
  });

  it("rejects a plain mapping (not a list)", () => {
    const text = "---\nkey: value\nother: data\n";
    expect(looksLikePlaybook(text)).toBe(false);
  });

  it("rejects an empty array", () => {
    expect(looksLikePlaybook("[]")).toBe(false);
  });

  it("rejects an array of scalars", () => {
    expect(looksLikePlaybook("---\n- one\n- two\n")).toBe(false);
  });

  it("rejects a roles/tasks YAML (no hosts)", () => {
    const text = "---\n- name: Install nginx\n  apt:\n    name: nginx\n";
    expect(looksLikePlaybook(text)).toBe(false);
  });

  it("returns false for invalid YAML", () => {
    expect(looksLikePlaybook("{{invalid")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(looksLikePlaybook("")).toBe(false);
  });

  it("handles multiple plays, checks only the first", () => {
    const text = [
      "---",
      "- name: First play",
      "  hosts: webservers",
      "  tasks: []",
      "- name: Second play",
      "  roles: []",
    ].join("\n");
    expect(looksLikePlaybook(text)).toBe(true);
  });
});

describe("isYamlExtension", () => {
  it("returns true for yml", () => {
    expect(isYamlExtension("yml")).toBe(true);
  });

  it("returns true for yaml", () => {
    expect(isYamlExtension("yaml")).toBe(true);
  });

  it("returns false for other extensions", () => {
    expect(isYamlExtension("json")).toBe(false);
    expect(isYamlExtension("py")).toBe(false);
    expect(isYamlExtension("ts")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isYamlExtension(undefined)).toBe(false);
  });

  it("is case-sensitive (uppercase YAML is not matched)", () => {
    expect(isYamlExtension("YAML")).toBe(false);
    expect(isYamlExtension("YML")).toBe(false);
  });
});
