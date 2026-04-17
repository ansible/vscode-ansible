/**
 * @file Tests for Ansible extension commands (e.g. creating an empty playbook).
 *
 * Each test executes a command via the workbench, then inspects the resulting
 * editor state or document content to verify the command behaved correctly.
 */
import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import type { Workbench } from "wdio-vscode-service";

/** Dismiss the "Don't Save" dialog if it appears after closing a dirty editor. */
async function dismissDontSaveIfPresent(): Promise<void> {
  const dontSave = await browser.$('[aria-label="Don\'t Save"]');
  try {
    await dontSave.waitForDisplayed({ timeout: 2500 });
    await dontSave.click();
  } catch {
    return;
  }
}

/** Close the currently focused editor tab, dismissing save prompts. */
async function closeActiveEditor(workbench: Workbench): Promise<void> {
  await workbench.executeCommand("workbench.action.closeActiveEditor");
  await dismissDontSaveIfPresent();
}

describe("Ansible commands", () => {
  before(async function () {
    this.timeout(90_000);
    await browser.executeWorkbench(async (vscode) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error(
          "No workspace folder available; WDIO must open VS Code on test/wdio/fixtures",
        );
      }
      const uri = vscode.Uri.joinPath(folder.uri, "playbook.ansible.yml");
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    });
    await browser.waitUntil(
      async () => {
        const active = await browser.executeWorkbench(async (vscode) => {
          const ext = vscode.extensions.getExtension("redhat.ansible");
          return ext?.isActive === true;
        });
        return active === true;
      },
      {
        timeout: 60_000,
        interval: 2000,
        timeoutMsg: "redhat.ansible did not activate within 60s",
      },
    );
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });
  });

  it("should create an empty playbook via command", async () => {
    const workbench = await browser.getWorkbench();
    await workbench.executeCommand("ansible.create-empty-playbook");
    await browser.pause(3000);

    const text: string = await browser.executeWorkbench((vscode) => {
      return vscode.window.activeTextEditor?.document.getText() ?? "";
    });

    assert.ok(text.length > 0, "Playbook content should not be empty");
    assert.ok(
      text.split(/\r?\n/).length >= 3,
      "Playbook should have at least 3 lines",
    );

    await closeActiveEditor(workbench);
  });
});
