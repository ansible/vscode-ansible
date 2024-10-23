import { config, expect } from "chai";
import {
  By,
  EditorView,
  ModalDialog,
  SettingsEditor,
  Workbench,
} from "vscode-extension-tester";
import { updateSettings, sleep } from "./uiTestHelper";

config.truncateThreshold = 0;
export function walkthroughUiTest(): void {
  let workbench: Workbench;
  let editorView: EditorView;

  before(async () => {
    workbench = new Workbench();
    editorView = new EditorView();
  });

  after(async function () {
    if (editorView) {
      await editorView.closeAllEditors();
    }
  });

  describe("Check for the walkthrough - Create an Ansible environment", async () => {
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

  describe("Check for the walkthrough - Discover Ansible Development Tools", async () => {
    it("Open the walkthrough and check the elements", async function () {
      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText("Discover Ansible Development Tools");
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
        titleText.includes("Discover Ansible Development Tools"),
        "Discover Ansible Development Tools title not found",
      ).to.be.true;

      // Locate one of the steps
      const stepText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'step-list-container') ]"),
        )
        .getText();

      expect(stepText).to.contain.oneOf([
        "Create",
        "Test",
        "Deploy",
        "Where do I start",
      ]);
    });
  });
  describe("Check for the walkthrough - Start automating with your first Ansible playbook", async () => {
    let settingsEditor: SettingsEditor;

    it("Check walkthrough elements", async function () {
      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(
        "Start automating with your first Ansible playbook",
      );
      await commandInput.confirm();

      await sleep(1500);

      // Select the editor window
      const mainTab = await editorView.getTabByTitle("Welcome");
      expect(mainTab).is.not.undefined;

      // Locate walkthrough title text
      const headerText = await mainTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      expect(
        headerText.includes("Start automating with your"),
        "Start automating with your first Ansible playbook title not found",
      ).to.be.true;

      // Locate one of the steps
      const stepTitles = await mainTab
        .findElement(
          By.xpath("//div[contains(@class, 'step-list-container') ]"),
        )
        .getText();

      expect(stepTitles).to.contain.oneOf([
        "Enable Ansible Lightspeed",
        "Create an Ansible playbook project",
        "Create an Ansible playbook",
        "Save your playbook to a playbook project",
        "Learn more about playbooks",
      ]);
    });
    it("Check empty playbook command option", async function () {
      settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", false);
      await workbench.executeCommand(
        "Ansible: Create an empty playbook or with Lightspeed (if enabled)",
      );
      await sleep(500);

      const newFileEditor = await new EditorView().openEditor("Untitled-1");
      const startingText = await newFileEditor.getText();
      expect(
        startingText.startsWith("---"),
        "The playbook file should start with ---",
      ).to.be.true;
      await workbench.executeCommand("View: Close All Editor Groups");
      const dialogBox = new ModalDialog();
      await dialogBox.pushButton(`Don't Save`);
    });
  });
}
