import { expect, describe, it, assert } from "vitest";
import { Position } from "vscode-languageserver";
import { getDoc } from "@test/helper.js";
import { prepareRename, doRename } from "@src/providers/renameProvider.js";

describe("prepareRename()", () => {
  describe("handler rename", () => {
    const textDoc = getDoc("references/playbook_handlers.yml");

    it("should allow rename on notify value", () => {
      // line 6: `notify: Restart nginx`
      const range = prepareRename(textDoc, Position.create(6, 14));
      assert(range);
      expect(range.start.line).toBe(6);
    });

    it("should allow rename on handler name", () => {
      // file line 18 (1-based) = 0-based line 17
      const range = prepareRename(textDoc, Position.create(17, 14));
      assert(range);
      expect(range.start.line).toBe(17);
    });

    it("should allow rename on listen value", () => {
      // file line 27 (1-based) = 0-based line 26
      const range = prepareRename(textDoc, Position.create(26, 14));
      assert(range);
      expect(range.start.line).toBe(26);
    });
  });

  describe("variable rename", () => {
    const textDoc = getDoc("references/playbook_variables.yml");

    it("should allow rename on vars key", () => {
      // line 3: `http_port: 8080`
      const range = prepareRename(textDoc, Position.create(3, 6));
      assert(range);
    });

    it("should allow rename on register value", () => {
      // file line 17 (1-based) = 0-based line 16
      const range = prepareRename(textDoc, Position.create(16, 16));
      assert(range);
    });

    it("should allow rename on Jinja2 variable", () => {
      // file line 13 (1-based) = 0-based line 12
      const range = prepareRename(textDoc, Position.create(12, 28));
      assert(range);
    });
  });

  describe("unsupported renames", () => {
    const textDoc = getDoc("references/playbook_includes.yml");

    it("should return null for filePath", () => {
      // line 6: include_tasks value
      const range = prepareRename(textDoc, Position.create(6, 38));
      expect(range).toBeNull();
    });

    it("should return null for role name", () => {
      // file line 21 (1-based) = 0-based line 20: `name: test_role` in include_role
      const range = prepareRename(textDoc, Position.create(20, 16));
      expect(range).toBeNull();
    });

    it("should return null for non-symbol position", () => {
      const range = prepareRename(textDoc, Position.create(0, 0));
      expect(range).toBeNull();
    });
  });
});

describe("doRename()", () => {
  describe("handler rename", () => {
    const textDoc = getDoc("references/playbook_handlers.yml");

    it("should rename handler from notify", () => {
      // line 6: `notify: Restart nginx`
      const edit = doRename(
        textDoc,
        Position.create(6, 14),
        "Restart apache",
      );
      assert(edit);
      assert(edit.changes);

      // Should have edits in this file
      const fileEdits = Object.values(edit.changes);
      expect(fileEdits.length).toBeGreaterThanOrEqual(1);

      const allEdits = fileEdits.flat();
      // notify→ updates all: notify + name + listen
      expect(allEdits.length).toBeGreaterThanOrEqual(3);

      for (const e of allEdits) {
        expect(e.newText).toBe("Restart apache");
      }
    });

    it("should rename handler from name (updates name + notify only)", () => {
      // file line 18 (1-based) = 0-based line 17
      const edit = doRename(
        textDoc,
        Position.create(17, 14),
        "Restart apache",
      );
      assert(edit);
      assert(edit.changes);

      const allEdits = Object.values(edit.changes).flat();
      // name→ updates name + notify (not listen at line 26)
      const hasListen = allEdits.some(
        (e) => e.range.start.line === 26,
      );
      expect(hasListen).toBe(false);
    });

    it("should rename handler from listen (updates listen + notify only)", () => {
      // file line 27 (1-based) = 0-based line 26
      const edit = doRename(
        textDoc,
        Position.create(26, 14),
        "Restart apache",
      );
      assert(edit);
      assert(edit.changes);

      const allEdits = Object.values(edit.changes).flat();
      // listen→ updates listen + notify (not name at line 17)
      const hasNameDef = allEdits.some(
        (e) => e.range.start.line === 17,
      );
      expect(hasNameDef).toBe(false);
    });
  });

  describe("variable rename", () => {
    const textDoc = getDoc("references/playbook_variables.yml");

    it("should rename variable across all occurrences", () => {
      // line 3: `http_port: 8080`
      const edit = doRename(
        textDoc,
        Position.create(3, 6),
        "server_port",
      );
      assert(edit);
      assert(edit.changes);

      const allEdits = Object.values(edit.changes).flat();
      expect(allEdits.length).toBeGreaterThanOrEqual(3);

      for (const e of allEdits) {
        expect(e.newText).toBe("server_port");
      }
    });
  });

  describe("unsupported renames", () => {
    const textDoc = getDoc("references/playbook_includes.yml");

    it("should return null for filePath rename", () => {
      const edit = doRename(
        textDoc,
        Position.create(6, 38),
        "new_tasks.yml",
      );
      expect(edit).toBeNull();
    });
  });

  describe("handler rename with long block (>20 lines between name and listen)", () => {
    const textDoc = getDoc("references/playbook_handlers_long.yml");

    it("should correctly exclude name when listen exists in same handler block", () => {
      // line 6: `notify: Restart nginx` — rename from notify
      const edit = doRename(
        textDoc,
        Position.create(6, 14),
        "Restart apache",
      );
      assert(edit);
      assert(edit.changes);

      const allEdits = Object.values(edit.changes).flat();
      // name is at 0-based line 9, listen is at 0-based line 35 (>20 lines apart)
      // With handlerMapOffset fix, name should still be excluded
      const hasNameDef = allEdits.some(
        (e) => e.range.start.line === 9,
      );
      expect(hasNameDef).toBe(false);

      // listen should be included
      const hasListen = allEdits.some(
        (e) => e.range.start.line === 35,
      );
      expect(hasListen).toBe(true);
    });
  });
});
