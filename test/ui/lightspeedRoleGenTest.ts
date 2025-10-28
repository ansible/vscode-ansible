// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import fs from "fs";

import {
  By,
  EditorView,
  Workbench,
  Key,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
  openResources,
  waitForCondition,
} from "./uiTestHelper";

config.truncateThreshold = 0;

async function cleanUpTmpfile(): Promise<void> {
  try {
    await fs.promises.rm(
      "test/units/lightspeed/utils/samples/collections/ansible_collections/community/dummy/roles/install_nginx",
      {
        recursive: true,
        force: true,
      },
    );
  } catch {
    console.log(
      "Error deleting file in test/units/lightspeed/utils/samples/collections/ansible_collections/community/dummy/roles/install_nginx",
    );
  }
}

before(function () {
  if (process.platform === "darwin") {
    this.skip();
  }
});

describe.skip("Role generation feature works", function () {
  let workbench: Workbench;

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  beforeEach(async function () {
    await cleanUpTmpfile();
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    await openResources(
      "test/unit/lightspeed/utils/samples/",
    );
    workbench = new Workbench();
    await workbenchExecuteCommand(
      "Ansible Lightspeed: Enable experimental features",
    );
    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);
  });

  after(async function () {
    await cleanUpTmpfile();
    await workbenchExecuteCommand("View: Close All Editor Groups");

    // Reset the feedback event queue
    try {
      await fetch(`${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`, {
        method: "GET",
      });
    } catch (error) {
      console.error("Failed to reset the feedback event queue", error);
      expect.fail("Failed to reset the feedback event queue");
    }
  });

  it("Role generation webview works", async function () {
    await workbenchExecuteCommand("Ansible Lightspeed: Role generation");
    let webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );

    const promptTextField = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    await promptTextField.sendKeys("Install and configure Nginx");
    await promptTextField.sendKeys(Key.ESCAPE);
    await promptTextField.click();

    (
      await webView.findWebElement(
        By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
      )
    ).click();

    await cleanUpTmpfile();

    const continueButton = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath("//vscode-button[contains(text(), 'Continue')]"),
        );
      },
      message: "Timed out waiting for Continue button",
    });
    await continueButton.click();

    webView = await getWebviewByLocator(
      By.xpath("//li[contains(text(), 'tasks/main.yml')]"),
    );

    const collectionNameTextField = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath('//*[@id="collectionNameTextField"]/input'),
        );
      },
      message: "Timed out waiting for collectionNameTextField input field",
    });

    await collectionNameTextField.sendKeys("community.dummy");
    await collectionNameTextField.click();

    const saveButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Save files')]"),
    );
    console.log("[RoleGen] Clicking 'Save files' button...");
    await saveButton.click();

    console.log(
      "[RoleGen] Waiting for role generation to complete and link to appear...",
    );
    const link = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath(
            "//a[contains(text(), 'community/dummy/roles/install_nginx/tasks/main.yml')]",
          ),
        );
      },
      message: "Timed out waiting for install_nginx link",
    });

    console.log("[RoleGen] Clicking link to open generated files...");
    await link.click();

    const driver = webView.getDriver();
    driver.switchTo().defaultContent();

    const editorView = new EditorView();

    const titles = await editorView.getOpenEditorTitles();
    console.log(`[RoleGen] Opened editor titles: ${JSON.stringify(titles)}`);
    expect(titles[0].includes("- name"));
    expect(titles[1].includes("install_nginx_packages:"));
    await workbenchExecuteCommand("View: Close All Editor Groups");

    driver.switchTo().defaultContent();

    const response: Response = await fetch(
      `${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`,
      {
        method: "GET",
      },
    );
    const data = await response.json();
    const expected = [
      {
        action: 0,
        toPage: 1,
      },
      {
        action: 2,
        fromPage: 1,
        toPage: 2,
      },
      {
        action: 2,
        fromPage: 2,
        toPage: 3,
      },
      {
        action: 3,
        fromPage: 3,
      },
    ];

    for (let i = 0; i < expected.length; i++) {
      expect(data["feedbacks"][i]["roleGenerationAction"]).to.deep.include(
        expected[i],
      );
    }
  });
});
