import { expect, describe, it, assert } from "vitest";
import { Position } from "vscode-languageserver";
import { getDoc } from "@test/helper.js";
import { getReferences } from "@src/providers/referencesProvider.js";

describe("getReferences()", () => {
  describe("handler references", () => {
    const textDoc = getDoc("references/playbook_handlers.yml");

    it("should find all references for handler from notify", async () => {
      // line 6: `notify: Restart nginx`
      const refs = await getReferences(textDoc, Position.create(6, 14), true);
      assert(refs);
      expect(refs.length).toBeGreaterThanOrEqual(4);
    });

    it("should find references excluding declaration", async () => {
      // line 6: `notify: Restart nginx`
      const refs = await getReferences(textDoc, Position.create(6, 14), false);
      assert(refs);
      // Excluding definition (handler name), should still have notify + listen
      expect(refs.length).toBeGreaterThanOrEqual(3);
    });

    it("should find references from handler name", async () => {
      // file line 18 (1-based) = 0-based line 17: `- name: Restart nginx` in handlers
      const refs = await getReferences(textDoc, Position.create(17, 14), true);
      assert(refs);
      expect(refs.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("variable references", () => {
    const textDoc = getDoc("references/playbook_variables.yml");

    it("should find all references for http_port", async () => {
      // line 3: `http_port: 8080` in vars
      const refs = await getReferences(textDoc, Position.create(3, 6), true);
      assert(refs);
      expect(refs.length).toBeGreaterThanOrEqual(3);
    });

    it("should find references for registered variable", async () => {
      // file line 17 (1-based) = 0-based line 16: `register: cmd_result`
      const refs = await getReferences(textDoc, Position.create(16, 16), true);
      assert(refs);
      expect(refs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cross-file handler references in role", () => {
    const textDoc = getDoc("references/roles/test_role/tasks/main.yml");

    it("should find handler references across role files", async () => {
      // line 11: `notify: Restart app`
      const refs = await getReferences(textDoc, Position.create(11, 12), true);
      assert(refs);

      // Should include occurrences from tasks AND handlers
      const uris = new Set(refs.map((r) => r.uri));
      expect(uris.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cross-file variable references in role", () => {
    const textDoc = getDoc("references/roles/test_role/tasks/main.yml");

    it("should find variable references across role files", async () => {
      // line 3: `name: "{{ app_user }}"` — cursor on app_user in Jinja2
      const refs = await getReferences(textDoc, Position.create(3, 18), true);
      assert(refs);
      expect(refs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("returns null for unsupported", () => {
    const textDoc = getDoc("references/playbook_includes.yml");

    it("should return null for non-symbol positions", async () => {
      // line 0: `---`
      const refs = await getReferences(textDoc, Position.create(0, 0), true);
      expect(refs).toBeNull();
    });
  });
});
