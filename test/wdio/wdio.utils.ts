/**
 * @file Shared helpers for WDIO specs (extension activation, activity bar).
 */
import { browser } from "@wdio/globals";
import type { ViewControl } from "wdio-vscode-service";

/** Open a fixture from the WDIO workspace to trigger `onLanguage:ansible`. */
export async function openPlaybookFixture(
  fixture = "playbook.ansible.yml",
): Promise<void> {
  await browser.executeWorkbench(async (vscode, fixtureName: string) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("WDIO workspace folder is missing");
    }
    const uri = vscode.Uri.joinPath(folder.uri, fixtureName);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }, fixture);
}

/** Wait until redhat.ansible is active, calling activate() if needed. */
export async function waitForExtensionActive(timeout = 60_000): Promise<void> {
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
        return ext.isActive;
      }),
    { timeout, timeoutMsg: "Ansible extension did not activate in time" },
  );
}

/**
 * Resolve the Ansible activity-bar view control, polling until contributions
 * are registered. Prefer matching by visible title because `getViewControl`
 * can return undefined briefly after activation.
 */
export async function getAnsibleViewControl(
  timeout = 30_000,
): Promise<ViewControl> {
  let control: ViewControl | undefined;

  await browser.waitUntil(
    async () => {
      const workbench = await browser.getWorkbench();
      const activityBar = workbench.getActivityBar();

      control = await activityBar.getViewControl("Ansible");
      if (control) {
        return true;
      }

      const viewControls = await activityBar.getViewControls();
      for (const viewControl of viewControls) {
        const title = await viewControl.getTitle();
        if (title.includes("Ansible")) {
          control = viewControl;
          return true;
        }
      }
      return false;
    },
    {
      timeout,
      interval: 1000,
      timeoutMsg: "Ansible activity bar view control did not appear in time",
    },
  );

  if (!control) {
    throw new Error("Ansible view control not found after wait");
  }
  return control;
}

/** Standard setup: open ansible fixture, activate extension, wait for sidebar. */
export async function prepareAnsibleExtension(): Promise<void> {
  await openPlaybookFixture();
  await waitForExtensionActive();
  await getAnsibleViewControl();
}
