/**
 * @file Tests for the MCP (Model Context Protocol) Server toggle.
 *
 * Verifies that `ansible.mcpServer.enabled` can be flipped on/off via
 * commands and settings, and that the value is consistent regardless of
 * which configuration scope is queried.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browser } from "@wdio/globals";

function assertMcpEnableCommandContributedInManifest(): void {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { contributes?: { commands?: Array<{ command: string }> } };
  const commands = manifest.contributes?.commands ?? [];
  assert.ok(
    commands.some((entry) => entry.command === "ansible.mcpServer.enabled"),
    "package.json must contribute ansible.mcpServer.enabled in contributes.commands",
  );
}

/**
 * Read `mcpServer.enabled` from the `ansible` settings section.
 *
 * Uses the dot-notation path (`getConfiguration("ansible").get("mcpServer.enabled")`)
 * which is how the extension itself reads the value.
 */
async function readMcpServerEnabledAnsibleSection(): Promise<boolean> {
  return browser.executeWorkbench((vscode) => {
    const enabled = vscode.workspace
      .getConfiguration("ansible")
      .get("mcpServer.enabled");
    return enabled === true;
  });
}

/**
 * Read `enabled` from the `ansible.mcpServer` settings section.
 *
 * Verifies VS Code surfaces the same value through the narrower
 * `getConfiguration("ansible.mcpServer")` scope.
 */
async function readMcpServerEnabledMcpSection(): Promise<boolean> {
  return browser.executeWorkbench((vscode) => {
    const enabled = vscode.workspace
      .getConfiguration("ansible.mcpServer")
      .get("enabled");
    return enabled === true;
  });
}

const MCP_SETTING_TIMEOUT_MS = 20_000;

/**
 * Invoke an extension command by id inside the extension host.
 *
 * `workbench.executeCommand` only confirms the command palette. On a slow
 * macOS runner that returns before the handler finishes, and fuzzy match can
 * select `ansible.mcpServer.enabled` when the typed id is
 * `ansible.mcpServer.disable`.
 */
async function runAnsibleCommand(commandId: string): Promise<void> {
  await browser.executeWorkbench(async (vscode, command: string) => {
    await vscode.commands.executeCommand(command);
  }, commandId);
}

/** Poll both configuration scopes until `ansible.mcpServer.enabled` matches. */
async function waitForMcpServerEnabled(expected: boolean): Promise<void> {
  await browser.waitUntil(
    async () => {
      const fromAnsibleSection = await readMcpServerEnabledAnsibleSection();
      const fromMcpSection = await readMcpServerEnabledMcpSection();
      return fromAnsibleSection === expected && fromMcpSection === expected;
    },
    {
      timeout: MCP_SETTING_TIMEOUT_MS,
      interval: 250,
      timeoutMsg:
        `ansible.mcpServer.enabled did not become ${expected} within ` +
        `${MCP_SETTING_TIMEOUT_MS}ms`,
    },
  );
}

/** Write the workspace setting and wait until both scopes observe it. */
async function setMcpServerEnabled(enabled: boolean): Promise<void> {
  await browser.executeWorkbench(async (vscode, value: boolean) => {
    const mcp = vscode.workspace.getConfiguration("ansible.mcpServer");
    await mcp.update("enabled", value, vscode.ConfigurationTarget.Workspace);
  }, enabled);
  await waitForMcpServerEnabled(enabled);
}

/** Disable MCP, close editors, and dismiss quick open to reset between tests. */
async function resetEditorsAndMcp(): Promise<void> {
  await browser.executeWorkbench(async (vscode) => {
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    const mcp = vscode.workspace.getConfiguration("ansible.mcpServer");
    await mcp.update("enabled", false, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });
  await waitForMcpServerEnabled(false);
}

describe("MCP Server", () => {
  before(async function () {
    this.timeout(90_000);
    await browser.executeWorkbench(async (vscode) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error("WDIO workspace should open the fixtures folder");
      }
      const uri = vscode.Uri.joinPath(folder.uri, "playbook.ansible.yml");
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
    });
    await browser.waitUntil(
      async () =>
        browser.executeWorkbench(async (vscode) => {
          const ext = vscode.extensions.getExtension("redhat.ansible");
          if (!ext) {
            return false;
          }
          if (!ext.isActive) {
            await ext.activate();
          }
          if (!ext.isActive) {
            return false;
          }
          const commands = await vscode.commands.getCommands(true);
          return (
            commands.includes("ansible.mcpServer.enabled") &&
            commands.includes("ansible.mcpServer.disable")
          );
        }),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: "MCP server commands were not registered within 60s",
      },
    );
  });

  afterEach(async () => {
    await resetEditorsAndMcp();
  });

  after(async () => {
    await resetEditorsAndMcp();
  });

  it("should enable MCP server via command", async () => {
    assertMcpEnableCommandContributedInManifest();
    await runAnsibleCommand("ansible.mcpServer.enabled");
    await waitForMcpServerEnabled(true);
    assert.strictEqual(await readMcpServerEnabledAnsibleSection(), true);
    assert.strictEqual(await readMcpServerEnabledMcpSection(), true);
  });

  it("should disable MCP server via command", async () => {
    // The disable handler no-ops when it still reads false. Wait until the
    // workspace write is visible, then await the command itself.
    await setMcpServerEnabled(true);
    await runAnsibleCommand("ansible.mcpServer.disable");
    await waitForMcpServerEnabled(false);
    assert.strictEqual(await readMcpServerEnabledAnsibleSection(), false);
    assert.strictEqual(await readMcpServerEnabledMcpSection(), false);
  });

  it("should enable MCP server via settings", async () => {
    await browser.executeWorkbench(async (vscode) => {
      const ansible = vscode.workspace.getConfiguration("ansible");
      await ansible.update(
        "mcpServer.enabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );
    });
    await waitForMcpServerEnabled(true);
    assert.strictEqual(await readMcpServerEnabledAnsibleSection(), true);
    assert.strictEqual(await readMcpServerEnabledMcpSection(), true);
  });

  it("should have MCP toggle command registered", async () => {
    await runAnsibleCommand("ansible.mcpServer.enabled");
    await waitForMcpServerEnabled(true);

    try {
      const workbench = await browser.getWorkbench();
      await workbench.executeCommand("MCP: List Servers");
    } catch {
      // Quick pick / command availability varies by VS Code channel; assertion below is authoritative.
    }

    const hasAnsibleMcpEnableCommand = await browser.executeWorkbench(
      async (vscode) => {
        const commands = await vscode.commands.getCommands(true);
        return commands.includes("ansible.mcpServer.enabled");
      },
    );
    assert.strictEqual(
      hasAnsibleMcpEnableCommand,
      true,
      "ansible.mcpServer.enabled should be registered when the extension is active",
    );
  });
});
