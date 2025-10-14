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
      // First test gets extra time since VS Code walkthrough system needs to initialize
      const isFirstTest = index === 0;
      this.timeout(10000);

      // Execute the walkthrough command which will open a picker
      await workbench.executeCommand("Welcome: Open Walkthrough");

      // Wait for the walkthrough picker to appear and stabilize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Type the walkthrough name to filter the list
      const driver = workbench.getDriver();
      const activeElement = await driver.switchTo().activeElement();
      await activeElement.sendKeys(String(walkthroughName));

      // Wait for filtering to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Press Enter to select the filtered walkthrough
      await activeElement.sendKeys("\n");

      // Select the editor window - walkthrough opens in a tab with title like "Walkthrough: Ansible"
      // Wait for the walkthrough tab to appear
      const welcomeTab = await waitForCondition({
        condition: async () => {
          try {
            const allTitles = await editorView.getOpenEditorTitles();

            // Look for any tab that starts with "Walkthrough:" or is "Welcome"
            const walkthroughTitle = allTitles.find(
              (title) =>
                title.startsWith("Walkthrough:") || title === "Welcome",
            );

            if (walkthroughTitle) {
              // Get the walkthrough tab
              const tabs = await editorView.getOpenTabs();
              for (const tab of tabs) {
                const title = await tab.getTitle();
                if (title === walkthroughTitle) {
                  // Check if this tab contains the walkthrough content
                  try {
                    const elements = await tab.findElements(
                      By.xpath(
                        "//div[contains(@class, 'getting-started-category')]",
                      ),
                    );

                    if (elements.length > 0) {
                      // Give it a moment to fully render
                      await new Promise((resolve) => setTimeout(resolve, 1000));
                      return tab;
                    }
                  } catch (e) {
                    console.log("Error checking for walkthrough content:", e);
                  }
                }
              }
            }
            return false;
          } catch (e) {
            console.log("Error in walkthrough detection:", e);
            return false;
          }
        },
        timeout: 6000,
        message: "Timed out waiting for walkthrough content to load",
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
