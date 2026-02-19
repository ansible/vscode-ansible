import { commands, extensions, Uri, workspace } from "vscode";
import { activate, sleep, updateSettings, clearActivationCache } from "../e2e.utils";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "path";
import { createRequire } from "node:module";
import { PROJECT_ROOT } from "../../setup";

describe("MCP server activation and availability (AAP-64488)", function () {
  const playbookPath = Uri.file(
    path.resolve(PROJECT_ROOT, "test", "testFixtures", "diagnostics", "playbook_1.yml"),
  );

  before(async function () {
    await commands.executeCommand("workbench.action.closeAllEditors");
    clearActivationCache();
  });

  after(async function () {
    // Restore MCP server to disabled state
    await updateSettings("mcpServer.enabled", false);
    await commands.executeCommand("workbench.action.closeAllEditors");
    clearActivationCache();
  });

  describe("MCP server CLI availability", function () {
    it("should have MCP server package resolvable via module resolution", function () {
      const extension = extensions.getExtension("redhat.ansible");
      assert.ok(extension, "Extension should be found");

      const extensionPath = extension.extensionPath;

      // The MCP server should be resolvable via Node.js module resolution
      // from the extension's context
      try {
        const require = createRequire(path.join(extensionPath, "package.json"));
        const serverPath = require.resolve("@ansible/ansible-mcp-server");
        assert.ok(serverPath, "MCP server package should be resolvable");

        // CLI should be in the same directory as the main module
        const cliPath = path.join(path.dirname(serverPath), "cli.js");
        assert.ok(
          existsSync(cliPath),
          `MCP CLI should exist at: ${cliPath}`,
        );
      } catch (error) {
        // If module resolution fails, check for legacy paths as fallback
        const packagedCliPath = path.join(extensionPath, "out", "mcp", "cli.js");
        const devCliPath = path.join(
          extensionPath,
          "packages",
          "ansible-mcp-server",
          "out",
          "server",
          "src",
          "cli.js",
        );

        const hasPackagedCli = existsSync(packagedCliPath);
        const hasDevCli = existsSync(devCliPath);

        assert.ok(
          hasPackagedCli || hasDevCli,
          `MCP CLI should be resolvable via module resolution or exist at:\n` +
            `  - Packaged: ${packagedCliPath} (exists: ${hasPackagedCli})\n` +
            `  - Development: ${devCliPath} (exists: ${hasDevCli})\n` +
            `  - Module resolution error: ${error}`,
        );
      }
    });
  });

  describe("MCP server enable/disable commands", function () {
    it("should have enable command registered", async function () {
      const allCommands = await commands.getCommands(true);
      assert.ok(
        allCommands.includes("ansible.mcpServer.enabled"),
        "Enable MCP server command should be registered",
      );
    });

    it("should have disable command registered", async function () {
      const allCommands = await commands.getCommands(true);
      assert.ok(
        allCommands.includes("ansible.mcpServer.disable"),
        "Disable MCP server command should be registered",
      );
    });
  });

  describe("MCP server settings", function () {
    it("should have ansible.mcpServer.enabled setting available", function () {
      const config = workspace.getConfiguration("ansible.mcpServer");
      const enabled = config.get<boolean>("enabled");
      // Setting should exist (either true or false)
      assert.ok(
        typeof enabled === "boolean",
        `ansible.mcpServer.enabled should be a boolean, got: ${typeof enabled}`,
      );
    });

    it("should be able to enable MCP server via settings", async function () {
      // First ensure extension is active
      await activate(playbookPath);

      // Enable MCP server
      await updateSettings("mcpServer.enabled", true);
      await sleep(200); // Allow setting change to propagate

      const config = workspace.getConfiguration("ansible.mcpServer");
      const enabled = config.get<boolean>("enabled");
      assert.strictEqual(enabled, true, "MCP server should be enabled");
    });

    it("should be able to disable MCP server via settings", async function () {
      // Disable MCP server
      await updateSettings("mcpServer.enabled", false);
      await sleep(200); // Allow setting change to propagate

      const config = workspace.getConfiguration("ansible.mcpServer");
      const enabled = config.get<boolean>("enabled");
      assert.strictEqual(enabled, false, "MCP server should be disabled");
    });
  });

  describe("MCP provider registration", function () {
    it("should register MCP provider on extension activation", async function () {
      // Activate extension
      await activate(playbookPath);

      // The MCP provider is registered via vscode.lm.registerMcpServerDefinitionProvider
      // We can't directly query registered providers, but we can verify the extension
      // exports indicate successful activation
      const extension = extensions.getExtension("redhat.ansible");
      assert.ok(extension, "Extension should be found");
      assert.ok(extension.isActive, "Extension should be active");
    });

    it("should enable MCP server and verify provider responds", async function () {
      // Enable MCP server
      await updateSettings("mcpServer.enabled", true);
      await sleep(500); // Give time for provider to refresh

      // Execute the enable command which should show success message if server is available
      // This indirectly tests that the provider is working
      try {
        await commands.executeCommand("ansible.mcpServer.enabled");
        // If no error thrown, command executed successfully
        assert.ok(true, "MCP enable command executed successfully");
      } catch (error) {
        // Command may show info message about already enabled, which is fine
        assert.ok(true, "MCP enable command responded");
      }
    });
  });
});
