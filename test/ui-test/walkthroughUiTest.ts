import { config, expect } from "chai";
import { By, EditorView, Workbench } from "vscode-extension-tester";
import { sleep } from "./uiTestHelper";

config.truncateThreshold = 0;
export function walkthroughUiTest(): void {
  describe("Check for the walkthrough - Create an Ansible environment", async () => {
    let workbench: Workbench;
    let editorView: EditorView;

    before(async () => {
      workbench = new Workbench();
      editorView = new EditorView();
    });

    it("Open the walkthrough and check the elements", async function () {
      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText("Create an Ansible environment");
      await commandInput.confirm();

      await sleep(1000);

      // Select the editor window
      const welcomeTab = await editorView.getTabByTitle("Welcome");
      expect(welcomeTab).is.not.undefined;

      // Locate walkthrough title text
      const titleText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      expect(
        titleText.includes("Create an Ansible environment"),
        "Create an Ansible environment title not found",
      ).to.be.true;

      // Locate one of the steps
      const stepText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'step-list-container') ]"),
        )
        .getText();

      expect(stepText).to.contain.oneOf([
        "Create an Ansible playbook",
        "tag in the status bar",
        "Install the Ansible environment package",
      ]);
    });
  });
}
