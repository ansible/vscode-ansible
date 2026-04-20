/**
 * @file Sidebar and settings tests.
 *
 * Validates the Ansible activity bar entry, the ADT sidebar view, the
 * welcome page link, and round-trip configuration changes via the VS Code
 * settings API.
 */
import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import path from "node:path";

describe("Sidebar and settings", () => {
  it("should show the ADT sidebar view", async () => {
    const workbench = await browser.getWorkbench();
    const control = await workbench.getActivityBar().getViewControl("Ansible");
    assert.ok(control);
    const sideBar = await control.openView();
    const title = await sideBar.getTitlePart().getTitle();
    assert.match(title, /Ansible Development Tools/i);

    const workspaceFolder = await browser.executeWorkbench((vscode) => {
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    });
    if (workspaceFolder) {
      assert.ok(path.isAbsolute(workspaceFolder));
    }
  });

  it("should show the welcome page link in sidebar", async () => {
    const workbench = await browser.getWorkbench();
    const control = await workbench.getActivityBar().getViewControl("Ansible");
    assert.ok(control);
    await control.openView();

    await browser.executeWorkbench((vscode) =>
      vscode.commands.executeCommand("ansible-home.focus"),
    );
    await browser.pause(1500);

    const sideTitle = await workbench.getSideBar().getTitlePart().getTitle();
    assert.match(sideTitle, /Ansible Development Tools/i);

    const webviews = await workbench.getAllWebviews();
    let foundWelcomeLink = false;
    for (const webview of webviews) {
      await webview.open();
      try {
        const link = await browser.$(
          'a[title="Ansible Development Tools welcome page"]',
        );
        if (await link.isExisting()) {
          foundWelcomeLink = true;
          break;
        }
      } finally {
        await webview.close();
      }
    }
    assert.ok(foundWelcomeLink);
  });

  it("should propagate settings changes to the extension", async () => {
    try {
      await browser.executeWorkbench(async (vscode) => {
        const config = vscode.workspace.getConfiguration("ansible");
        await config.update(
          "lightspeed.enabled",
          false,
          vscode.ConfigurationTarget.Global,
        );
      });
      await browser.pause(2000);

      const disabled = await browser.executeWorkbench((vscode) =>
        vscode.workspace.getConfiguration("ansible").get("lightspeed.enabled"),
      );
      assert.strictEqual(disabled, false);
    } finally {
      await browser.executeWorkbench(async (vscode) => {
        const config = vscode.workspace.getConfiguration("ansible");
        await config.update(
          "lightspeed.enabled",
          true,
          vscode.ConfigurationTarget.Global,
        );
      });
    }

    const restored = await browser.executeWorkbench((vscode) =>
      vscode.workspace.getConfiguration("ansible").get("lightspeed.enabled"),
    );
    assert.strictEqual(restored, true);
  });
});
