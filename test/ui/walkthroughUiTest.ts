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
      // Increase overall test timeout for slower CI environments
      this.timeout(60000);

      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();

      // Give VS Code time to process the command (especially important on slower CI)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Wait for the tab to appear first (simpler check)
      const welcomeTab = await waitForCondition({
        condition: async () => {
          try {
            return await editorView.getTabByTitle("Walkthrough: Ansible");
          } catch {
            return false;
          }
        },
        message: "Timed out waiting for walkthrough tab to appear",
        timeout: 30000, // Increased timeout for CI
      });

      expect(welcomeTab).is.not.undefined;

      // Then wait for content to be fully rendered with correct title
      await waitForCondition({
        condition: async () => {
          try {
            const titleElement = await welcomeTab.findElement(
              By.xpath("//div[contains(@class, 'getting-started-category')]"),
            );
            const titleText = await titleElement.getText();
            // Check if element has content and matches the expected walkthrough name
            if (titleText && titleText.includes(`${walkthroughName}`)) {
              return true;
            }
          } catch {
            // Element not ready yet or doesn't match
            return false;
          }
          return false;
        },
        message: `Timed out waiting for walkthrough content to load with title: ${walkthroughName}`,
        timeout: 30000, // Increased timeout for content loading on CI
      });

      // Wait for and locate one of the steps
      const stepListElement = await waitForCondition({
        condition: async () => {
          try {
            const element = await welcomeTab.findElement(
              By.xpath("//div[contains(@class, 'step-list-container')]"),
            );
            const text = await element.getText();
            if (text && text.length > 0) {
              return element;
            }
          } catch {
            return false;
          }
          return false;
        },
        message: "Timed out waiting for walkthrough steps to load",
        timeout: 10000,
      });

      const fullStepText = await stepListElement.getText();
      const stepText = fullStepText.split("\n")[0];
      expect(steps, "No walkthrough step").to.include(stepText);

      await editorView.closeEditor("Walkthrough: Ansible");
    });
  });

  const testPlaybookCommand = async (command: string) => {
    await workbench.executeCommand(command);

    const newFileEditor = await openUntitledFile();
    const startingText = await newFileEditor.getText();
    expect(
      startingText.startsWith("---"),
      "The playbook file should start with ---",
    ).to.be.true;

    await workbench.executeCommand("View: Close All Editor Groups");

    // Wait for modal dialog to appear
    const dialogBox = await waitForCondition({
      condition: async () => {
        try {
          const dialog = new ModalDialog();
          await dialog.getMessage(); // Verify dialog is actually ready
          return dialog;
        } catch {
          return false;
        }
      },
      message: "Timed out waiting for save dialog",
      timeout: 5000,
    });

    await dialogBox.pushButton(`Don't Save`);
    await dialogBox.getDriver().wait(until.stalenessOf(dialogBox), 2000);
  };

  it("Check empty playbook command option", async function () {
    await testPlaybookCommand("Ansible: Create an empty Ansible playbook");
  });

  it("Check unauthenticated playbook command option", async function () {
    await testPlaybookCommand(
      "Ansible: Create an empty playbook or with Lightspeed (if authenticated)",
    );
  });
});
