// BEFORE: ansible.lightspeed.suggestions.enabled: true

import { expect, config } from "chai";
import fs from "fs";

import { By, EditorView, VSBrowser, Workbench } from "vscode-extension-tester";
import {
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
  connectLightspeed,
} from "./uiTestHelper";

config.truncateThreshold = 0;

function cleanUpTmpfile() {
  fs.rm(
    "test/units/lightspeed/utils/samples/collections/ansible_collections/community/dummy/roles/install_nginx",
    {
      recursive: true,
      force: true,
    },
    (err) => {
      if (err) {
        // File deletion failed
        console.error(err.message);
        return;
      }
      console.log("File deleted successfully");
    },
  );
}

before(function () {
  if (process.platform !== "darwin") {
    this.skip();
  }
});

describe("Verify Role generation feature works as expected", function () {
  let workbench: Workbench;

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });
  beforeEach(function () {
    cleanUpTmpfile();
  });
  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    await VSBrowser.instance.openResources(
      "test/units/lightspeed/utils/samples/",
    );
    workbench = new Workbench();
    await workbenchExecuteCommand(
      "Ansible Lightspeed: Enable experimental features",
    );
    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);

    await connectLightspeed();
  });

  after(async function () {
    cleanUpTmpfile();
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

  it("Role generation webview works as expected", async function () {
    await workbenchExecuteCommand("Ansible Lightspeed: Role generation");
    await sleep(500);
    let webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-field"),
    );
    await textArea.sendKeys("Install and configure Nginx");

    (
      await webView.findWebElement(
        By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
      )
    ).click();

    const dropdown = await webView.findWebElement(
      By.xpath("//vscode-dropdown"),
    );
    await dropdown.click();

    const option = await webView.findWebElement(
      By.xpath("//vscode-option[contains(text(), 'community.dummy')]"),
    );
    await option.click();

    const button = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
    );
    await button.click();

    cleanUpTmpfile();

    await sleep(10000);

    const continueButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Continue')]"),
    );
    await continueButton.click();

    await sleep(500);
    webView = await getWebviewByLocator(
      By.xpath("//li[contains(text(), 'tasks/main.yml')]"),
    );

    await (
      await webView.findWebElement(
        By.xpath("//vscode-button[contains(text(), 'Save files')]"),
      )
    ).click();

    await sleep(1000);
    const link = await webView.findWebElement(
      By.xpath(
        "//a[contains(text(), 'collections/community/dummy/roles/install_nginx/tasks/main.yml')]",
      ),
    );
    await link.click();

    const driver = webView.getDriver();
    driver.switchTo().defaultContent();

    const editorView = new EditorView();

    const titles = await editorView.getOpenEditorTitles();
    expect(titles[0].includes("- name"));
    expect(titles[1].includes("install_nginx_packages:"));
    await workbenchExecuteCommand("View: Close All Editor Groups");

    driver.switchTo().defaultContent();
  });
});
