import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const mcpPackageDir = path.join(projectRoot, "packages", "ansible-mcp-server");

const resourceDataFiles = [
  "agents.md",
  "ee-rules.md",
  "execution-environment-schema.json",
  "execution-environment-sample.yml",
];

describe("MCP server packaging", function () {
  describe(".vscodeignore includes MCP server files", function () {
    const vscodeignore = fs.readFileSync(
      path.join(projectRoot, ".vscodeignore"),
      "utf8",
    );

    it("should whitelist MCP server dist files", function () {
      expect(vscodeignore).toContain("!packages/ansible-mcp-server/dist/**/*");
    });

    it("should whitelist MCP server package.json", function () {
      expect(vscodeignore).toContain(
        "!packages/ansible-mcp-server/package.json",
      );
    });
  });

  describe("MCP server package structure", function () {
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

  describe("resource data files are present in build output", function () {
    const distDataDir = path.join(mcpPackageDir, "dist", "data");
    const sourceDataDir = path.join(mcpPackageDir, "src", "resources", "data");

    it("should have source resource data files", function () {
      for (const file of resourceDataFiles) {
        expect(
          fs.existsSync(path.join(sourceDataDir, file)),
          `source file missing: src/resources/data/${file}`,
        ).toBe(true);
      }
    });

    it("should have resource data files copied to dist/data/ after build", function () {
      if (!fs.existsSync(path.join(mcpPackageDir, "dist", "cli.js"))) {
        console.warn(
          "MCP server not built yet (dist/cli.js missing) - run 'pnpm build' first",
        );
        return;
      }
      for (const file of resourceDataFiles) {
        expect(
          fs.existsSync(path.join(distDataDir, file)),
          `dist/data/${file} missing — tsup onSuccess copy may have failed`,
        ).toBe(true);
      }
    });

    it("should have non-empty resource data files in dist/data/", function () {
      if (!fs.existsSync(distDataDir)) {
        console.warn("dist/data/ not found - run 'pnpm build' first");
        return;
      }
      for (const file of resourceDataFiles) {
        const filePath = path.join(distDataDir, file);
        if (!fs.existsSync(filePath)) continue;
        const stat = fs.statSync(filePath);
        expect(stat.size, `dist/data/${file} is empty`).toBeGreaterThan(0);
      }
    });
  });
});
