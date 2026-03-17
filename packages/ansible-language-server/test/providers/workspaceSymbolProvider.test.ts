import { expect, describe, it } from "vitest";
import { SymbolKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDoc } from "@test/helper.js";
import { getWorkspaceSymbols } from "@src/providers/workspaceSymbolProvider.js";

function query(q: string, docs: TextDocument[]) {
  return getWorkspaceSymbols({ query: q }, docs);
}

describe("getWorkspaceSymbols()", () => {
  describe("handler symbols", () => {
    const doc = getDoc("references/playbook_handlers.yml");

    it("should find handler definitions", () => {
      const symbols = query("", [doc]);
      const handlers = symbols.filter((s) => s.kind === SymbolKind.Function);
      expect(handlers.length).toBe(2);
      expect(handlers.map((s) => s.name).sort()).toEqual([
        "Reload firewall",
        "Restart nginx",
      ]);
    });

    it("should not include notify usages as handler symbols", () => {
      const symbols = query("Restart", [doc]);
      const handlers = symbols.filter((s) => s.kind === SymbolKind.Function);
      // Only the handler definition, not notify references
      expect(handlers.length).toBe(1);
      expect(handlers[0].name).toBe("Restart nginx");
      // Should be at the handler name line (0-based line 17)
      expect(handlers[0].location.range.start.line).toBe(17);
    });
  });

  describe("variable symbols", () => {
    const doc = getDoc("references/playbook_variables.yml");

    it("should find vars definitions", () => {
      const symbols = query("", [doc]);
      const vars = symbols.filter((s) => s.kind === SymbolKind.Variable);
      const varNames = vars.map((s) => s.name);
      expect(varNames).toContain("http_port");
      expect(varNames).toContain("app_name");
    });

    it("should find register definitions", () => {
      const symbols = query("cmd_result", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const reg = symbols.find((s) => s.name === "cmd_result");
      expect(reg).toBeDefined();
      expect(reg!.kind).toBe(SymbolKind.Variable);
      // register: cmd_result is on 0-based line 16
      expect(reg!.location.range.start.line).toBe(16);
    });

    it("should find vars_prompt definitions", () => {
      const symbols = query("user_password", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const prompt = symbols.find((s) => s.name === "user_password");
      expect(prompt).toBeDefined();
      expect(prompt!.kind).toBe(SymbolKind.Variable);
    });
  });

  describe("set_fact variables", () => {
    const doc = getDoc("references/playbook_set_fact.yml");

    it("should find set_fact variable definitions", () => {
      const symbols = query("", [doc]);
      const vars = symbols.filter((s) => s.kind === SymbolKind.Variable);
      const varNames = vars.map((s) => s.name);
      expect(varNames).toContain("my_fact");
      expect(varNames).toContain("another_fact");
    });

    it("should not include cacheable as a variable", () => {
      const symbols = query("cacheable", [doc]);
      expect(symbols.length).toBe(0);
    });
  });

  describe("role symbols", () => {
    const doc = getDoc("references/playbook_includes.yml");

    it("should find role references", () => {
      const symbols = query("", [doc]);
      const roles = symbols.filter((s) => s.kind === SymbolKind.Package);
      expect(roles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("cross-file role context", () => {
    const doc = getDoc("references/roles/test_role/tasks/main.yml");

    it("should include variables from defaults/main.yml", () => {
      const symbols = query("app_port", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const appPort = symbols.find((s) => s.name === "app_port");
      expect(appPort).toBeDefined();
      expect(appPort!.kind).toBe(SymbolKind.Variable);
    });

    it("should include handler definitions from handlers/main.yml", () => {
      const symbols = query("Restart app", [doc]);
      const handlers = symbols.filter((s) => s.kind === SymbolKind.Function);
      expect(handlers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("query filtering", () => {
    const doc = getDoc("references/playbook_variables.yml");

    it("should filter by case-insensitive substring", () => {
      const symbols = query("HTTP", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols[0].name).toBe("http_port");
    });

    it("should return all symbols for empty query", () => {
      const all = query("", [doc]);
      expect(all.length).toBeGreaterThanOrEqual(4); // http_port, app_name, user_password, cmd_result
    });

    it("should return empty array for non-matching query", () => {
      const symbols = query("nonexistent_xyz", [doc]);
      expect(symbols.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty documents list", () => {
      const symbols = query("", []);
      expect(symbols.length).toBe(0);
    });

    it("should handle invalid YAML gracefully", () => {
      const badDoc = TextDocument.create(
        "file:///tmp/bad.yml",
        "yaml",
        1,
        "---\n: [\ninvalid yaml {{{\n",
      );
      const goodDoc = getDoc("references/playbook_variables.yml");
      // Should not throw, and should still return symbols from the good doc
      const symbols = query("", [badDoc, goodDoc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
    });
  });
});
