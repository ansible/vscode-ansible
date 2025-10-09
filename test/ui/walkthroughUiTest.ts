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
  // Clean state before each test to prevent interference
  beforeEach(async function () {
    await editorView.closeAllEditors();
  });

  // Skip walkthrough tests on CI if they're known to be flaky with new extest version
  // Can be enabled by setting SKIP_WALKTHROUGH_TESTS=1
  before(function () {
    if (process.env.SKIP_WALKTHROUGH_TESTS === "1") {
      console.log(
        "[Walkthrough] Skipping walkthrough tests due to SKIP_WALKTHROUGH_TESTS env var",
      );
      this.skip();
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
      // Retry once for flaky CI issues
      this.retries(1);
      this.timeout(60000);

      console.log(`[Walkthrough] Opening: ${walkthroughName}`);

      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();

      console.log(`[Walkthrough] Command executed, waiting for tab...`);

      // Wait for the tab to appear AND content to load with correct title
      const welcomeTab = await waitForCondition({
        condition: async () => {
          try {
            const tab = await editorView.getTabByTitle("Walkthrough: Ansible");
            if (!tab) {
              console.log(`[Walkthrough] Tab not found yet`);
              return false;
            }

            console.log(`[Walkthrough] Tab found, checking content...`);

            // Immediately check if content is loaded with correct title
            const titleElement = await tab.findElement(
              By.xpath("//div[contains(@class, 'getting-started-category')]"),
            );
            const titleText = await titleElement.getText();
            console.log(`[Walkthrough] Title text: "${titleText}"`);

            if (titleText && titleText.includes(`${walkthroughName}`)) {
              console.log(`[Walkthrough] Content loaded successfully!`);
              return tab;
            }
            console.log(
              `[Walkthrough] Title doesn't match expected: "${walkthroughName}"`,
            );
            return false;
          } catch (error) {
            console.log(`[Walkthrough] Error checking tab: ${error}`);
            return false;
          }
        },
        message: `Timed out waiting for walkthrough "${walkthroughName}" to open and load`,
        timeout: 40000,
        pollTimeout: 1000, // Poll every 1s to reduce load on CI
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
