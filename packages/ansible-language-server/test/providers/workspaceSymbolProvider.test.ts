import { expect, describe, it } from "vitest";
import { SymbolKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDoc } from "@test/helper.js";
import { getWorkspaceSymbols } from "@src/providers/workspaceSymbolProvider.js";

async function query(q: string, docs: TextDocument[]) {
  return await getWorkspaceSymbols({ query: q }, docs);
}

describe("getWorkspaceSymbols()", () => {
  describe("handler symbols", () => {
    const doc = getDoc("references/playbook_handlers.yml");

    it("should find handler definitions", async () => {
      const symbols = await query("", [doc]);
      const handlers = symbols.filter((s) => s.kind === SymbolKind.Function);
      expect(handlers.length).toBe(2);
      expect(handlers.map((s) => s.name).sort()).toEqual([
        "Reload firewall",
        "Restart nginx",
      ]);
    });

    it("should not include notify usages as handler symbols", async () => {
      const symbols = await query("Restart", [doc]);
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

    it("should find vars definitions", async () => {
      const symbols = await query("", [doc]);
      const vars = symbols.filter((s) => s.kind === SymbolKind.Variable);
      const varNames = vars.map((s) => s.name);
      expect(varNames).toContain("http_port");
      expect(varNames).toContain("app_name");
    });

    it("should find register definitions", async () => {
      const symbols = await query("cmd_result", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const reg = symbols.find((s) => s.name === "cmd_result");
      expect(reg).toBeDefined();
      expect(reg!.kind).toBe(SymbolKind.Variable);
      // register: cmd_result is on 0-based line 16
      expect(reg!.location.range.start.line).toBe(16);
    });

    it("should find vars_prompt definitions", async () => {
      const symbols = await query("user_password", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const prompt = symbols.find((s) => s.name === "user_password");
      expect(prompt).toBeDefined();
      expect(prompt!.kind).toBe(SymbolKind.Variable);
    });
  });

  describe("set_fact variables", () => {
    const doc = getDoc("references/playbook_set_fact.yml");

    it("should find set_fact variable definitions", async () => {
      const symbols = await query("", [doc]);
      const vars = symbols.filter((s) => s.kind === SymbolKind.Variable);
      const varNames = vars.map((s) => s.name);
      expect(varNames).toContain("my_fact");
      expect(varNames).toContain("another_fact");
    });

    it("should not include cacheable as a variable", async () => {
      const symbols = await query("cacheable", [doc]);
      expect(symbols.length).toBe(0);
    });
  });

  describe("role symbols", () => {
    const doc = getDoc("references/playbook_includes.yml");

    it("should find role references", async () => {
      const symbols = await query("", [doc]);
      const roles = symbols.filter((s) => s.kind === SymbolKind.Package);
      expect(roles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("cross-file role context", () => {
    const doc = getDoc("references/roles/test_role/tasks/main.yml");

    it("should include variables from defaults/main.yml", async () => {
      const symbols = await query("app_port", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const appPort = symbols.find((s) => s.name === "app_port");
      expect(appPort).toBeDefined();
      expect(appPort!.kind).toBe(SymbolKind.Variable);
    });

    it("should include handler definitions from handlers/main.yml", async () => {
      const symbols = await query("Restart app", [doc]);
      const handlers = symbols.filter((s) => s.kind === SymbolKind.Function);
      expect(handlers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("query filtering", () => {
    const doc = getDoc("references/playbook_variables.yml");

    it("should filter by case-insensitive substring", async () => {
      const symbols = await query("HTTP", [doc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols[0].name).toBe("http_port");
    });

    it("should return all symbols for empty query", async () => {
      const all = await query("", [doc]);
      expect(all.length).toBeGreaterThanOrEqual(4); // http_port, app_name, user_password, cmd_result
    });

    it("should return empty array for non-matching query", async () => {
      const symbols = await query("nonexistent_xyz", [doc]);
      expect(symbols.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty documents list", async () => {
      const symbols = await query("", []);
      expect(symbols.length).toBe(0);
    });

    it("should handle invalid YAML gracefully", async () => {
      const badDoc = TextDocument.create(
        "file:///tmp/bad.yml",
        "yaml",
        1,
        "---\n: [\ninvalid yaml {{{\n",
      );
      const goodDoc = getDoc("references/playbook_variables.yml");
      // Should not throw, and should still return symbols from the good doc
      const symbols = await query("", [badDoc, goodDoc]);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
    });
  });
});
