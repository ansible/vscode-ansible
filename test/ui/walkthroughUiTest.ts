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

  walkthroughs.forEach(([walkthroughName, steps]) => {
    it(`Open the ${walkthroughName} walkthrough and check elements`, async function () {
      this.timeout(15000);

      await workbench.executeCommand("Welcome: Open Walkthrough");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const driver = workbench.getDriver();
      const activeElement = await driver.switchTo().activeElement();
      await activeElement.sendKeys(String(walkthroughName));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await activeElement.sendKeys("\n");

      const welcomeTab = await waitForCondition({
        condition: async () => {
          try {
            const allTitles = await editorView.getOpenEditorTitles();
            const walkthroughTitle = allTitles.find(
              (title) =>
                title.startsWith("Walkthrough:") || title === "Welcome",
            );

            if (walkthroughTitle) {
              const tabs = await editorView.getOpenTabs();
              for (const tab of tabs) {
                const title = await tab.getTitle();
                if (title === walkthroughTitle) {
                  try {
                    const elements = await tab.findElements(
                      By.xpath(
                        "//div[contains(@class, 'getting-started-category')]",
                      ),
                    );

                    if (elements.length > 0) {
                      await new Promise((resolve) => setTimeout(resolve, 1000));
                      return tab;
                    }
                  } catch {
                    continue;
                  }
                }
              }
            }
            return false;
          } catch {
            return false;
          }
        },
        timeout: 6000,
        message: "Timed out waiting for walkthrough content to load",
      });

      expect(welcomeTab).is.not.undefined;

      const titleText = await welcomeTab
        .findElement(
          By.xpath("//div[contains(@class, 'getting-started-category') ]"),
        )
        .getText();
      expect(
        titleText.includes(`${walkthroughName}`),
        `${walkthroughName} title not found`,
      ).to.be.true;

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
