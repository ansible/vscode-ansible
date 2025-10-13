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
        console.log("Searching for untitled file, all open titles:", titles);

        // Find any untitled document
        const untitledTitle = titles.find((title) =>
          title.startsWith("Untitled"),
        );
        if (untitledTitle) {
          console.log("Found untitled file:", untitledTitle);
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
      this.timeout(60000);
      console.log(`\n--- Testing walkthrough: "${walkthroughName}" ---`);

      const commandInput = await workbench.openCommandPrompt();
      await workbench.executeCommand("Welcome: Open Walkthrough");
      await commandInput.setText(`${walkthroughName}`);
      await commandInput.confirm();
      console.log("Walkthrough command confirmed, waiting for tab...");

      // Give the walkthrough time to load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Select the editor window - walkthrough opens in a "Welcome" tab
      const welcomeTab = await waitForCondition({
        condition: async () => {
          const allTitles = await editorView.getOpenEditorTitles();
          console.log("Currently open tabs:", allTitles);

          // Walkthrough opens with "Welcome" title, check if we have multiple Welcome tabs
          const welcomeTabs = allTitles.filter((title) => title === "Welcome");
          if (welcomeTabs.length > 1) {
            console.log(
              `Found ${welcomeTabs.length} Welcome tabs - walkthrough likely opened`,
            );
            // Get the last Welcome tab (the newly opened one)
            const tabs = await editorView.getOpenTabs();
            for (const tab of tabs) {
              const title = await tab.getTitle();
              if (title === "Welcome") {
                console.log("Selecting Welcome tab for walkthrough");
                return tab;
              }
            }
          }
          return false;
        },
        timeout: 30000,
        message: "Timed out waiting for walkthrough tab to open",
      });

      expect(welcomeTab).is.not.undefined;
      console.log("Walkthrough Welcome tab found");

      // Locate walkthrough title text
      const titleText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      console.log("Walkthrough title:", titleText);
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
      console.log("First step:", stepText);
      expect(steps, "No walkthrough step").to.include(stepText);

      // Close the walkthrough tab (it has "Welcome" title)
      try {
        await welcomeTab.close();
        console.log("Walkthrough tab closed");
      } catch (e) {
        console.log("Failed to close walkthrough tab:", e);
      }
    });
  });

  it("Check empty playbook command option", async function () {
    this.timeout(60000);
    console.log("\n--- Testing empty playbook command ---");
    await workbench.executeCommand("Ansible: Create an empty Ansible playbook");

    const newFileEditor = await openUntitledFile();
    const startingText = await newFileEditor.getText();
    console.log("Playbook content starts with:", startingText.substring(0, 10));
    expect(
      startingText.startsWith("---"),
      "The playbook file should start with ---",
    ).to.be.true;
    await workbench.executeCommand("View: Close All Editor Groups");
    const dialogBox = new ModalDialog();
    await dialogBox.pushButton(`Don't Save`);
    await dialogBox.getDriver().wait(until.stalenessOf(dialogBox), 2000);
    console.log("Empty playbook test completed");
  });

  it("Check unauthenticated playbook command option", async function () {
    this.timeout(60000);

    console.log("\n--- Testing unauthenticated playbook command ---");
    await workbench.executeCommand(
      "Ansible: Create an empty playbook or with Lightspeed (if authenticated)",
    );

    const newFileEditor = await openUntitledFile();
    const startingText = await newFileEditor.getText();
    console.log("Playbook content starts with:", startingText.substring(0, 10));
    expect(
      startingText.startsWith("---"),
      "The playbook file should start with ---",
    ).to.be.true;
    await workbench.executeCommand("View: Close All Editor Groups");
    const dialogBox = new ModalDialog();
    await dialogBox.pushButton(`Don't Save`);
    await dialogBox.getDriver().wait(until.stalenessOf(dialogBox), 2000);
    console.log("Unauthenticated playbook test completed");
  });
});
