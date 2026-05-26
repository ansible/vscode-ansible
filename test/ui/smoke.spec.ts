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

    expect(titles).toContain("Ansible Environments");
  });
});
