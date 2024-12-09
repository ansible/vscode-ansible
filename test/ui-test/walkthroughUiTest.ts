import { config, expect } from "chai";
import {
  By,
  EditorView,
  ModalDialog,
  SettingsEditor,
  until,
  Workbench,
} from "vscode-extension-tester";
import { updateSettings, sleep } from "./uiTestHelper";

config.truncateThreshold = 0;

let workbench: Workbench;
let editorView: EditorView;
let settingsEditor: SettingsEditor;

before(async () => {
  workbench = new Workbench();
  editorView = new EditorView();
});

describe("Check walkthroughs, elements and associated commands", async () => {
  const walkthroughs = [
    [
      "Create an Ansible environment",
      [
        "Create an Ansible playbook",
        "tag in the status bar",
        "Install the Ansible environment package",
      ],
    ],
    [
      "Discover Ansible Development Tools",
      ["Create", "Test", "Deploy", "Where do I start"],
    ],
    [
      "Start automating with your first Ansible playbook",
      [
        "Enable Ansible Lightspeed",
        "Create an Ansible playbook project",
        "Create an Ansible playbook",
        "Save your playbook to a playbook project",
        "Learn more about playbooks",
      ],
    ],
  ];

  walkthroughs.forEach(([walkthroughName, steps]) => {
    it(`Open the ${walkthroughName} walkthrough and check elements`, async function () {
      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();

      await sleep(1000);

      // Select the editor window
      const welcomeTab = await editorView.getTabByTitle("Walkthrough: Ansible");
      expect(welcomeTab).is.not.undefined;

      // Locate walkthrough title text
      const titleText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      expect(
        titleText.includes(`${walkthroughName}`),
        `${walkthroughName} title not found`,
      ).to.be.true;

      // Locate one of the steps
      const fullStepText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'step-list-container') ]"),
        )
        .getText();

      const stepText = fullStepText.split("\n")[0];
      expect(steps, "No walkthrough step").to.include(stepText);
    });
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
    await dialogBox.getDriver().wait(until.stalenessOf(dialogBox), 2000);
  });
});
