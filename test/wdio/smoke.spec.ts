/**
 * @file Smoke tests that verify the bare minimum: VS Code launches, the
 * Ansible extension activates, commands are registered, and Ansible
 * language detection works. These run first and gate the rest of the suite.
 */
import { browser } from "@wdio/globals";
import path from "node:path";

/**
 * Wait until the Ansible extension is active, triggering activation if needed.
 * @param timeout - Maximum wait in milliseconds (default 60 s).
 */
async function waitForExtensionActive(timeout = 60_000): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.executeWorkbench(async (vscode) => {
        const ext = vscode.extensions.getExtension("redhat.ansible");
        if (!ext) return false;
        if (!ext.isActive) {
          await ext.activate();
        }
        return ext.isActive;
      }),
    { timeout, timeoutMsg: "Ansible extension did not activate in time" },
  );
}

describe("VS Code Ansible smoke test", () => {
  before(async function () {
    this.timeout(90_000);
    const fixturePath = path.resolve(
      process.cwd(),
      "test",
      "wdio",
      "fixtures",
      "playbook.ansible.yml",
    );
    await browser.executeWorkbench(async (vscode, uri: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(uri));
      await vscode.window.showTextDocument(doc);
    }, fixturePath);
    await waitForExtensionActive();
    await browser.pause(3000);
  });

  it("should launch a VS Code session", async () => {
    expect(browser.sessionId).toBeDefined();
  });

  it("should show the Ansible activity bar icon", async () => {
    const workbench = await browser.getWorkbench();
    const activityBar = workbench.getActivityBar();
    const viewControls = await activityBar.getViewControls();
    const titles = await Promise.all(viewControls.map((vc) => vc.getTitle()));

    expect(titles.some((t) => t.includes("Ansible"))).toBe(true);
  });

  it("should activate the Ansible extension", async () => {
    const isActive = await browser.executeWorkbench(async (vscode) => {
      const ext = vscode.extensions.getExtension("redhat.ansible");
      return ext?.isActive === true;
    });

    expect(isActive).toBe(true);
  });

  it("should register ansible commands", async function () {
    this.timeout(60_000);

    await browser.waitUntil(
      async () => {
        const hasAll = await browser.executeWorkbench(async (vscode) => {
          const all = await vscode.commands.getCommands(true);
          return (
            all.includes("ansible.content-creator.menu") &&
            all.includes("ansible.create-empty-playbook") &&
            all.includes("ansible.mcpServer.enabled")
          );
        });
        return hasAll;
      },
      {
        timeout: 30_000,
        interval: 2000,
        timeoutMsg: "Not all required ansible commands registered within 30s",
      },
    );
  });

  it("should detect .ansible.yml files as ansible language", async () => {
    const languageId = await browser.executeWorkbench(async (vscode) => {
      const editor = vscode.window.activeTextEditor;
      return editor?.document.languageId;
    });

    expect(languageId).toBe("ansible");
  });
});
