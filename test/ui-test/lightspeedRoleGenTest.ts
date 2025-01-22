// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";

import {
  By,
  Workbench,
  VSBrowser,
  EditorView,
  ModalDialog,
  until,
  WebView,
} from "vscode-extension-tester";
import {
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify Role generation feature works as expected", function () {
  let workbench: Workbench;

  before(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
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
  });

  after(async function () {
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
    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );
    await textArea.sendKeys("Install and configure Nginx");

    (
      await webView.findWebElement(
        By.xpath("//vscode-button[@id='submit-button']"),
      )
    ).click();
    await sleep(5000);

    await webView.findWebElement(
      By.xpath("//*[contains(text(), 'Review the suggested')]"),
    );
    await (
      await webView.findWebElement(
        By.xpath("//vscode-button[@id='generateButton']"),
      )
    ).click();

    await sleep(5000);

    await (
      await webView.findWebElement(
        By.xpath("//vscode-button[@id='openEditorButton']"),
      )
    ).click();

    const driver = webView.getDriver();
    driver.switchTo().defaultContent();

    const editorView = new EditorView();

    const titles = await editorView.getOpenEditorTitles();
    expect(titles[0].includes("- name"));
    expect(titles[1].includes("install_nginx_packages:"));
    await workbenchExecuteCommand("View: Close All Editor Groups");
    const dialog = new ModalDialog();
    await dialog.pushButton(`Don't Save`);
    await dialog.getDriver().wait(until.stalenessOf(dialog), 2000);

    driver.switchTo().defaultContent();
  });
});

describe("Verify Role generation reset button works as expected", function () {
  let webView: WebView;

  before(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  async function setupPage1() {
    await VSBrowser.instance.openResources(
      "test/units/lightspeed/utils/samples/",
    );
    const workbench = new Workbench();
    await workbenchExecuteCommand(
      "Ansible Lightspeed: Enable experimental features",
    );
    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);

    await workbenchExecuteCommand("Ansible Lightspeed: Role generation");
    await sleep(500);
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );
    await textArea.sendKeys("Install and configure Nginx");
  }

  async function gotoPage2() {
    const submitButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='submit-button']"),
    );
    await submitButton.click();
    await sleep(5000);
  }

  it("Go on the 2nd page and change the collection name", async function () {
    await setupPage1();
    await gotoPage2();

    await webView.findWebElement(
      By.xpath("//*[contains(text(), 'Review the suggested')]"),
    );

    await (
      await webView.findWebElement(
        By.xpath("//a[@id='backAnchorCollectionName']"),
      )
    ).click();

    await getWebviewByLocator(
      By.xpath("//*[text()='What do you want the role to accomplish?']"),
    );

    await workbenchExecuteCommand("View: Close All Editor Groups");
  });

  it("Role generation (outline reset, cancel)", async function () {
    await setupPage1();
    await gotoPage2();

    // Verify outline output and text edit
    let outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    expect(outlineList, "An ordered list should exist.").to.be.not.undefined;
    let text = await outlineList.getText();
    expect(text.includes("Install the Nginx packages")).to.be.true;

    // Test Reset button
    await outlineList.sendKeys("# COMMENT\n");
    text = await outlineList.getText();
    expect(text.includes("# COMMENT\n"));

    let resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );
    expect(resetButton, "resetButton should not be undefined").not.to.be
      .undefined;
    expect(await resetButton.isEnabled(), "reset button should be enabled now")
      .to.be.true;

    await resetButton.click();
    await sleep(500);

    // Cancel reset of Outline
    await webView.switchBack();
    const resetOutlineDialog = new ModalDialog();
    await resetOutlineDialog.pushButton("Cancel");
    await sleep(250);
    // Sadly we need to switch context and so we must reload the WebView elements
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );
    outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );

    text = await outlineList.getText();
    expect(text.includes("# COMMENT\n"));
    expect(await resetButton.isEnabled(), "reset button should be enabled now")
      .to.be.true;

    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});
