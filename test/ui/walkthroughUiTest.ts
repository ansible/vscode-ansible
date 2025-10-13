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
        console.log("untitledTitle search, all titles:", titles);

        // Find any untitled document
        const untitledTitle = titles.find((title) =>
          title.startsWith("Untitled"),
        );
        if (untitledTitle) {
          console.log("Found untitledTitle:", untitledTitle);
          return await editorView.openEditor(untitledTitle);
        }
        return false;
      } catch (error) {
        console.log("Error in openUntitledFile:", error);
        return false;
      }
    },
    message: "Timed out waiting for untitled file to open",
    timeout: 15000,
  });
};

before(async function () {
  workbench = new Workbench();
  editorView = new EditorView();
});

afterEach(async function () {
  // Clean up after each test to prevent state pollution
  try {
    console.log("Cleaning up: closing all editors...");
    await workbench.executeCommand("View: Close All Editor Groups");

    // Handle any "Don't Save" modal dialogs that might appear
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const dialogBox = new ModalDialog();
      await dialogBox.pushButton(`Don't Save`);
      console.log("Dismissed 'Don't Save' dialog");
      await dialogBox.getDriver().wait(until.stalenessOf(dialogBox), 2000);
    } catch {
      // No dialog present, that's fine
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.log(`Failed to close editor groups: ${error}`);
  }
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

  walkthroughs.forEach(([walkthroughName, steps], index) => {
    it(`Open the ${walkthroughName} walkthrough and check elements`, async function () {
      // Set Mocha timeout to 2 minutes for these slow UI tests
      this.timeout(120000);

      console.log(
        `\n=== Testing walkthrough #${index + 1}: "${walkthroughName}" ===`,
      );

      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();
      console.log("Command confirmed for:", walkthroughName);

      // Wait a bit for the command to execute
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Select the editor window
      console.log("Waiting for walkthrough tab to appear...");
      const welcomeTab = await waitForCondition({
        condition: async () => {
          try {
            // Get fresh instance to avoid stale references
            const ev = new EditorView();
            const allTitles = await ev.getOpenEditorTitles();
            console.log("Current open tabs:", allTitles);

            const tab = await ev.getTabByTitle("Walkthrough: Ansible");
            if (tab) {
              console.log("Found Walkthrough tab!");
            }
            return tab;
          } catch (error) {
            console.log(
              "Error getting tab:",
              error instanceof Error ? error.message : String(error),
            );
            return false;
          }
        },
        message: `Timed out waiting for walkthrough tab to open for "${walkthroughName}"`,
        timeout: 30000,
        pollTimeout: 1000,
      });

      expect(welcomeTab).is.not.undefined;

      // Locate walkthrough title text
      const titleText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      console.log("Walkthrough title found:", titleText);
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
      console.log("First step text:", fullStepText.split("\n")[0]);

      const stepText = fullStepText.split("\n")[0];
      expect(steps, "No walkthrough step").to.include(stepText);

      // Close the walkthrough tab
      await editorView.closeEditor("Walkthrough: Ansible");
      console.log("Walkthrough tab closed\n");
    });
  });

  it("Check empty playbook command option", async function () {
    this.timeout(60000);

    console.log("\n=== Testing empty playbook command ===");
    await workbench.executeCommand("Ansible: Create an empty Ansible playbook");

    const newFileEditor = await openUntitledFile();
    const startingText = await newFileEditor.getText();
    expect(
      startingText.startsWith("---"),
      "The playbook file should start with ---",
    ).to.be.true;
    console.log("Empty playbook created successfully");

    // Cleanup is handled by afterEach hook
  });

  it("Check unauthenticated playbook command option", async function () {
    this.timeout(60000);

    console.log("\n=== Testing unauthenticated playbook command ===");
    await workbench.executeCommand(
      "Ansible: Create an empty playbook or with Lightspeed (if authenticated)",
    );

    const newFileEditor = await openUntitledFile();
    const startingText = await newFileEditor.getText();
    expect(
      startingText.startsWith("---"),
      "The playbook file should start with ---",
    ).to.be.true;
    console.log("Unauthenticated playbook created successfully");

    // Cleanup is handled by afterEach hook
  });
});
