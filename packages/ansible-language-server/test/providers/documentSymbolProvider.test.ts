import { expect, describe, it, assert } from "vitest";
import { SymbolKind } from "vscode-languageserver";
import { getDoc } from "@test/helper.js";
import {
  getDocumentSymbols,
  flattenSymbols,
} from "@src/providers/documentSymbolProvider.js";

describe("getDocumentSymbols()", () => {
  describe("playbook with plays, tasks, and handlers", () => {
    const textDoc = getDoc("documentSymbol/playbook.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should return symbols for all plays", () => {
      expect(symbols).not.toBeNull();
      expect(symbols).toHaveLength(2);
    });

    it("should identify plays as Struct", () => {
      assert(symbols);
      expect(symbols[0].kind).toBe(SymbolKind.Struct);
      expect(symbols[1].kind).toBe(SymbolKind.Struct);
    });

    it("should use play name", () => {
      assert(symbols);
      expect(symbols[0].name).toBe("Install webserver");
      expect(symbols[1].name).toBe("Configure database");
    });

    it("should include tasks section with child tasks", () => {
      assert(symbols);
      const play1 = symbols[0];
      const tasksSection = play1.children?.find((c) => c.name === "tasks");
      assert(tasksSection);
      expect(tasksSection.kind).toBe(SymbolKind.Field);
      assert(tasksSection.children);
      expect(tasksSection.children).toHaveLength(2);
      expect(tasksSection.children[0].name).toBe("Install nginx");
      expect(tasksSection.children[0].kind).toBe(SymbolKind.Function);
    });

    it("should include handlers section", () => {
      assert(symbols);
      const play1 = symbols[0];
      const handlersSection = play1.children?.find(
        (c) => c.name === "handlers",
      );
      assert(handlersSection?.children);
      expect(handlersSection.children).toHaveLength(1);
      expect(handlersSection.children[0].name).toBe("Restart nginx");
    });

    it("should include pre_tasks and post_tasks sections", () => {
      assert(symbols);
      const play2 = symbols[1];
      const preTasksSection = play2.children?.find(
        (c) => c.name === "pre_tasks",
      );
      const postTasksSection = play2.children?.find(
        (c) => c.name === "post_tasks",
      );
      assert(preTasksSection?.children);
      assert(postTasksSection?.children);
      expect(preTasksSection.children).toHaveLength(1);
      expect(postTasksSection.children).toHaveLength(1);
    });
  });

  describe("playbook with blocks", () => {
    const textDoc = getDoc("documentSymbol/block.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should return play with block", () => {
      expect(symbols).not.toBeNull();
      expect(symbols).toHaveLength(1);
    });

    it("should identify block as Namespace", () => {
      assert(symbols);
      const play = symbols[0];
      const tasksSection = play.children?.find((c) => c.name === "tasks");
      assert(tasksSection?.children);
      expect(tasksSection.children).toHaveLength(1);

      const block = tasksSection.children[0];
      expect(block.kind).toBe(SymbolKind.Namespace);
      expect(block.name).toBe("block: Main block");
    });

    it("should include block/rescue/always sections", () => {
      assert(symbols);
      const block = symbols[0].children?.find((c) => c.name === "tasks")
        ?.children?.[0];
      assert(block?.children);

      const blockSection = block.children.find((c) => c.name === "block");
      const rescueSection = block.children.find((c) => c.name === "rescue");
      const alwaysSection = block.children.find((c) => c.name === "always");

      assert(blockSection?.children);
      assert(rescueSection?.children);
      assert(alwaysSection?.children);
      expect(blockSection.children).toHaveLength(2);
      expect(rescueSection.children).toHaveLength(1);
      expect(alwaysSection.children).toHaveLength(1);
    });
  });

  describe("playbook with roles", () => {
    const textDoc = getDoc("documentSymbol/roles.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should include roles section with Package symbols", () => {
      assert(symbols);
      const play = symbols[0];
      const rolesSection = play.children?.find((c) => c.name === "roles");
      assert(rolesSection?.children);
      expect(rolesSection.children).toHaveLength(3);

      expect(rolesSection.children[0].name).toBe("common");
      expect(rolesSection.children[0].kind).toBe(SymbolKind.Package);

      expect(rolesSection.children[1].name).toBe("nginx");
      expect(rolesSection.children[1].kind).toBe(SymbolKind.Package);

      expect(rolesSection.children[2].name).toBe("app");
      expect(rolesSection.children[2].kind).toBe(SymbolKind.Package);
    });
  });

  describe("tasklist without play", () => {
    const textDoc = getDoc("documentSymbol/tasklist.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should return tasks at root level", () => {
      assert(symbols);
      expect(symbols).toHaveLength(3);
    });

    it("should use task name when available", () => {
      assert(symbols);
      expect(symbols[0].name).toBe("Install package");
      expect(symbols[0].kind).toBe(SymbolKind.Function);
    });

    it("should fall back to module name when name is absent", () => {
      assert(symbols);
      expect(symbols[1].name).toBe("ansible.builtin.debug");
      expect(symbols[1].kind).toBe(SymbolKind.Function);
    });
  });

  describe("play without name", () => {
    const textDoc = getDoc("documentSymbol/no_name_play.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should fall back to hosts-based name", () => {
      assert(symbols);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("Play [hosts: all]");
      expect(symbols[0].kind).toBe(SymbolKind.Struct);
    });
  });

  describe("block without name", () => {
    const textDoc = getDoc("documentSymbol/no_name_block.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should use 'block' as fallback name", () => {
      assert(symbols);
      const block = symbols[0].children?.find((c) => c.name === "tasks")
        ?.children?.[0];
      assert(block);
      expect(block.name).toBe("block");
      expect(block.kind).toBe(SymbolKind.Namespace);
    });
  });

  describe("task with no name and only task keywords", () => {
    const textDoc = getDoc("documentSymbol/task_no_name_no_module.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should fall back to 'Task' when no name or module is present", () => {
      assert(symbols);
      const play = symbols[0];
      const tasksSection = play.children?.find((c) => c.name === "tasks");
      assert(tasksSection?.children);
      expect(tasksSection.children).toHaveLength(1);
      expect(tasksSection.children[0].name).toBe("Task");
      expect(tasksSection.children[0].kind).toBe(SymbolKind.Function);
    });
  });

  describe("play without hosts", () => {
    const textDoc = getDoc("documentSymbol/play_no_hosts.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should fall back to 'Play' when hosts is absent", () => {
      assert(symbols);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("Play");
      expect(symbols[0].kind).toBe(SymbolKind.Struct);
    });
  });

  describe("roles with name key instead of role key", () => {
    const textDoc = getDoc("documentSymbol/roles_name_key.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should use name key for role name", () => {
      assert(symbols);
      const play = symbols[0];
      const rolesSection = play.children?.find((c) => c.name === "roles");
      assert(rolesSection?.children);
      expect(rolesSection.children).toHaveLength(1);
      expect(rolesSection.children[0].name).toBe("my_role");
      expect(rolesSection.children[0].kind).toBe(SymbolKind.Package);
    });
  });

  describe("non-sequence YAML", () => {
    const textDoc = getDoc("documentSymbol/non_yaml.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should return null for non-sequence root", () => {
      expect(symbols).toBeNull();
    });
  });

  describe("empty file", () => {
    const textDoc = getDoc("documentSymbol/empty.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should return null for empty file", () => {
      expect(symbols).toBeNull();
    });
  });

  describe("flattenSymbols()", () => {
    const textDoc = getDoc("documentSymbol/playbook.yml");
    const symbols = getDocumentSymbols(textDoc);

    it("should flatten hierarchical symbols", () => {
      assert(symbols);
      const flat = flattenSymbols(symbols, "file:///test.yml");

      for (const s of flat) {
        expect(s.location.uri).toBe("file:///test.yml");
        expect(s.location.range).toBeDefined();
      }

      const names = flat.map((s) => s.name);
      expect(names).toContain("Install webserver");
      expect(names).toContain("tasks");
      expect(names).toContain("Install nginx");
      expect(names).toContain("handlers");
      expect(names).toContain("Restart nginx");
    });

    it("should have more items than top-level symbols", () => {
      assert(symbols);
      const flat = flattenSymbols(symbols, "file:///test.yml");
      expect(flat.length).toBeGreaterThan(symbols.length);
    });
  });
});
