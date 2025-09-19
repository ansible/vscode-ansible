import { config, expect } from "chai";
import {
  By,
  EditorView,
  ModalDialog,
  until,
  Workbench,
} from "vscode-extension-tester";
import { waitForCondition } from "./uiTestHelper";

config.truncateThreshold = 0;

let workbench: Workbench;
let editorView: EditorView;

const openUntitledFile = async () => {
  return await waitForCondition({
    condition: async () => {
      return await new EditorView().openEditor("Untitled-1");
    },
    message: "Timed out waiting for Untitled-1 file to open",
  });
};

before(async function () {
  workbench = new Workbench();
  editorView = new EditorView();
});

describe("Check walkthroughs, elements and associated commands", function () {
  const walkthroughs = [
    [
      "Create an Ansible environment",
      [
        "Create an Ansible playbook",
        'Make sure you see the "Ansible" tag in the status bar',
        "Install the Ansible development package",
      ],
    ],
    [
      "Discover Ansible Development Tools",
      ["Create", "Test", "Deploy", "Where do I start?"],
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

  const walkthroughIdByName: Record<string, string> = {
    "Create an Ansible environment": "create-ansible-environment",
    "Discover Ansible Development Tools": "discover-ansible-development-tools",
    "Start automating with your first Ansible playbook":
      "start-automating-playbook",
  };

  walkthroughs.forEach(([walkthroughName, steps]) => {
    it(`Open the ${walkthroughName} walkthrough and check elements`, async function () {
      // Increase test timeout for walkthrough loading
      this.timeout(30000);

      // Open the walkthrough via Command Palette (single-arg API in tester)
      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");

      // Wait a bit for the command to process
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();

      // Wait for the command to execute
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Select the editor window
      const welcomeTab = await waitForCondition({
        condition: async () => {
          return (
            (await editorView.getTabByTitle("Get Started: Ansible")) ||
            (await editorView.getTabByTitle("Walkthroughs: Ansible")) ||
            (await editorView.getTabByTitle("Walkthrough: Ansible"))
          );
        },
        message: "Timed out waiting for walkthrough tab to open",
        timeout: 20000,
      });

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

      // Close the walkthrough tab (support multiple possible titles across VS Code versions)
      if (await editorView.getTabByTitle("Get Started: Ansible")) {
        await editorView.closeEditor("Get Started: Ansible");
      } else if (await editorView.getTabByTitle("Walkthroughs: Ansible")) {
        await editorView.closeEditor("Walkthroughs: Ansible");
      } else {
        await editorView.closeEditor("Walkthrough: Ansible");
      }
    });
  });

  it("Check empty playbook command option", async function () {
    await workbench.executeCommand("Ansible: Create an empty Ansible playbook");

    const newFileEditor = await openUntitledFile();
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

  it("Check unauthenticated playbook command option", async function () {
    await workbench.executeCommand(
      "Ansible: Create an empty playbook or with Lightspeed (if authenticated)",
    );

    const newFileEditor = await openUntitledFile();
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
