/**
 * @file Tests for the MCP (Model Context Protocol) Server toggle.
 *
 * Verifies that `ansible.mcpServer.enabled` can be flipped on/off via
 * commands and settings, and that the value is consistent regardless of
 * which configuration scope is queried.
 */
import assert from "node:assert/strict";
import { browser } from "@wdio/globals";

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

/** Disable MCP, close editors, and dismiss quick open to reset between tests. */
async function resetEditorsAndMcp(): Promise<void> {
  await browser.executeWorkbench(async (vscode) => {
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    const mcp = vscode.workspace.getConfiguration("ansible.mcpServer");
    await mcp.update("enabled", false, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });
  await browser.pause(200);
}

type WorkbenchWithNotifications = {
  getNotifications: () => Promise<Array<{ getMessage: () => Promise<string> }>>;
};

/**
 * Check if any visible notification mentions the MCP Server being enabled.
 *
 * Returns `false` (rather than throwing) when the notification panel is not
 * visible, so callers can fall back to checking the setting value directly.
 */
async function notificationMentionsMcpEnabled(
  workbench: WorkbenchWithNotifications,
): Promise<boolean> {
  try {
    const notifications = await workbench.getNotifications();
    for (const notification of notifications) {
      const message = await notification.getMessage();
      if (/\bMCP Server\b/i.test(message) && /\benabled\b/i.test(message)) {
        return true;
      }
    }
  } catch {
    /* notifications panel may not be visible */
  }
  return false;
}

describe("MCP Server", () => {
  before(async () => {
    await browser.executeWorkbench(async (vscode) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error("WDIO workspace should open the fixtures folder");
      }
      const uri = vscode.Uri.joinPath(folder.uri, "playbook.ansible.yml");
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    });
    await browser.pause(500);
  });

  afterEach(async () => {
    await resetEditorsAndMcp();
  });

  after(async () => {
    await resetEditorsAndMcp();
  });

  it("should enable MCP server via command", async () => {
    const workbench = await browser.getWorkbench();
    await workbench.executeCommand("ansible.mcpServer.enabled");
    await browser.pause(1500);

    const sawNotification = await notificationMentionsMcpEnabled(workbench);
    if (!sawNotification) {
      assert.strictEqual(
        await readMcpServerEnabledAnsibleSection(),
        true,
        "Expected ansible.mcpServer.enabled to be true when no matching notification was found",
      );
    } else {
      assert.ok(sawNotification, "Expected an MCP enable notification");
    }

    assert.strictEqual(await readMcpServerEnabledMcpSection(), true);
  });

  it("should disable MCP server via command", async () => {
    await browser.executeWorkbench(async (vscode) => {
      const mcp = vscode.workspace.getConfiguration("ansible.mcpServer");
      await mcp.update("enabled", true, vscode.ConfigurationTarget.Workspace);
    });
    await browser.pause(300);

    const workbench = await browser.getWorkbench();
    await workbench.executeCommand("ansible.mcpServer.disable");
    await browser.pause(800);

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
    await browser.pause(500);

    assert.strictEqual(await readMcpServerEnabledAnsibleSection(), true);
    assert.strictEqual(await readMcpServerEnabledMcpSection(), true);
  });

  it("should have MCP toggle command registered", async () => {
    const workbench = await browser.getWorkbench();
    await workbench.executeCommand("ansible.mcpServer.enabled");
    await browser.pause(800);

    try {
      await workbench.executeCommand("MCP: List Servers");
      await browser.pause(500);
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
