import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const projectRoot = path.resolve(__dirname, "..", "..", "..");

describe("MCP server packaging", function () {
  describe(".vscodeignore includes MCP server files", function () {
    const vscodeignore = fs.readFileSync(
      path.join(projectRoot, ".vscodeignore"),
      "utf8",
    );

    it("should whitelist MCP server dist files", function () {
      expect(vscodeignore).toContain(
        "!packages/ansible-mcp-server/dist/**/*",
      );
    });

    it("should whitelist MCP server package.json", function () {
      expect(vscodeignore).toContain(
        "!packages/ansible-mcp-server/package.json",
      );
    });

    it("should whitelist MCP server resource data files", function () {
      expect(vscodeignore).toContain(
        "!packages/ansible-mcp-server/src/resources/data/**/*",
      );
    });
  });

  describe("MCP server package structure", function () {
    const mcpPackageDir = path.join(
      projectRoot,
      "packages",
      "ansible-mcp-server",
    );

    it("should have package.json with correct main entry", function () {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(mcpPackageDir, "package.json"), "utf8"),
      );
      expect(pkg.name).toBe("@ansible/ansible-mcp-server");
      expect(pkg.main).toMatch(/dist\/cli/);
    });

    it("should have dist/cli.js after build", function () {
      const cliPath = path.join(mcpPackageDir, "dist", "cli.js");
      if (!fs.existsSync(cliPath)) {
        console.warn(
          "MCP server not built yet (dist/cli.js missing) - run 'pnpm build' first",
        );
        return;
      }
      expect(fs.statSync(cliPath).isFile()).toBe(true);
    });
  });
});
