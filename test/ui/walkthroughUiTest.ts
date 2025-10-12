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
      try {
        const editorView = new EditorView();
        const titles = await editorView.getOpenEditorTitles();

        // Find any untitled document
        const untitledTitle = titles.find((title) =>
          title.startsWith("Untitled"),
        );
        if (untitledTitle) {
          return await editorView.openEditor(untitledTitle);
        }
        return false;
      } catch {
        return false;
      }
    },
    message: "Timed out waiting for untitled file to open",
  });
};

before(async function () {
  workbench = new Workbench();
  editorView = new EditorView();
});

describe("Check walkthroughs, elements and associated commands", function () {
  beforeEach(async function () {
    // Close all editors to ensure clean state between tests
    try {
      await editorView.closeAllEditors();
    } catch {
      // Ignore errors if no editors are open
    }
  });
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
      this.retries(3); // Essential for flaky UI automation in CI

      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");

      // Wait longer for the quick pick to be ready (especially in CI)
      await waitForCondition({
        condition: async () => {
          try {
            await commandInput.setText(`${walkthroughName}`);
            return true;
          } catch {
            return false;
          }
        },
        message: "Input not ready",
        timeout: 10000, // Increased for CI
      });

      await commandInput.confirm();

      // Wait longer for the command to process in CI
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Select the editor window with much longer timeout for CI
      const welcomeTab = await waitForCondition({
        condition: async () => {
          return await editorView.getTabByTitle("Walkthrough: Ansible");
        },
        message: "Timed out waiting for walkthrough tab to open",
        timeout: 30000, // Increased for slower CI environments
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
        .findElement(By.xpath("//div[contains(@class, 'step-list-container')]"))
        .getText();

      const stepText = fullStepText.split("\n")[0];
      expect(steps, "No walkthrough step").to.include(stepText);

      await editorView.closeEditor("Walkthrough: Ansible");
    });
  });

  it("Check empty playbook command option", async function () {
    this.retries(2); // Essential for flaky UI automation in CI
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
    this.retries(2); // Essential for flaky UI automation in CI
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
