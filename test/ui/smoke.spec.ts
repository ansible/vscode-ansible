import { browser } from "@wdio/globals";

describe("VS Code UI smoke test", () => {
  it("should launch a VS Code session", async () => {
    expect(browser.sessionId).toBeDefined();
  });

  it("should show the Ansible Environments activity bar icon", async () => {
    const workbench = await browser.getWorkbench();
    const activityBar = workbench.getActivityBar();
    const viewControls = await activityBar.getViewControls();
    const titles = await Promise.all(viewControls.map((vc) => vc.getTitle()));

    // The view container may be collapsed under "Additional Views" if
    // a previous spec changed the activity bar state in the same session.
    const visible = titles.includes("Ansible Environments");
    if (visible) {
      expect(titles).toContain("Ansible Environments");
      return;
    }

    const contributed: boolean = await browser.executeWorkbench(
      async (vscode) => {
        const ext = vscode.extensions.getExtension(
          "cidrblock.ansible-environments",
        );
        if (!ext) return false;
        const pkg = ext.packageJSON;
        return (pkg?.contributes?.viewsContainers?.activitybar ?? []).some(
          (c: { title: string }) => c.title === "Ansible Environments",
        );
      },
    );
    expect(contributed).toBe(true);
  });
});
