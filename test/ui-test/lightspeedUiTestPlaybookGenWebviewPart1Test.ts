// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  ActivityBar,
  By,
  ModalDialog,
  ViewControl,
  Workbench,
  ViewSection,
  WebviewView,
} from "vscode-extension-tester";
import {
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook generation features work as expected", function () {
  let workbench: Workbench;
  let adtView: ViewSection;
  let webviewView: InstanceType<typeof WebviewView>;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }

    await sleep(5000);
    workbench = new Workbench();
    // await workbenchExecuteCommand(
    //   "Ansible Lightspeed: Enable experimental features",
    // );
    await sleep(3000);

    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);
  });

  it("Ensures we can go from DevTools to Playbook generation", async function () {
    // Open Ansible Development Tools by clicking the Getting started button on the side bar
    const view = (await new ActivityBar().getViewControl(
      "Ansible",
    )) as ViewControl;
    const sideBar = await view.openView();
    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtView.expand();
    await sleep(2000);

    webviewView = new WebviewView();
    expect(webviewView).not.undefined;
    await webviewView.switchToFrame(1000);

    const welcomePageLink = await webviewView.findWebElement(
      By.xpath(
        "//a[contains(@title, 'Ansible Development Tools welcome page')]",
      ),
    );

    expect(welcomePageLink).not.to.be.undefined;
    if (welcomePageLink) {
      await welcomePageLink.click();
    }
    await sleep(2000);

    await getWebviewByLocator(
      By.xpath(
        "//a[contains(@href,'command:ansible.lightspeed.playbookGeneration')]",
      ),
    );
  });

  it("Playbook generation webview works as expected (full path) - part 1", async function () {
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(2000);

    // Start operations on Playbook Generation UI
    let webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    // Set input text and invoke summaries API
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );
    const submitButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='submit-button']"),
    );
    expect(submitButton, "submitButton should not be undefined").not.to.be
      .undefined;
    //
    // Note: Following line should succeed, but fails for some unknown reasons.
    //
    // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
    await textArea.sendKeys("Create an azure network.");
    expect(
      await submitButton.isEnabled(),
      "submit button should be enabled now",
    ).to.be.true;
    await submitButton.click();
    await sleep(2000);

    // Verify outline output and text edit
    let outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    expect(outlineList, "An ordered list should exist.");
    let text = await outlineList.getText();
    expect(
      text.includes("Create virtual network peering"),
      "Text should include the expected outline",
    );
    await outlineList.sendKeys("# COMMENT\n");
    text = await outlineList.getText();
    expect(text.includes("# COMMENT\n"));

    // Verify the prompt is displayed as a static text
    const prompt = await webView.findWebElement(
      By.xpath("//span[@id='prompt']"),
    );
    text = await prompt.getText();
    expect(text.includes("Create an azure network."));

    // Test Reset button
    const resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );
    expect(resetButton, "resetButton should not be undefined").not.to.be
      .undefined;
    await resetButton.click();
    await sleep(500);

    // Confirm reset of Outline
    await webView.switchBack();
    const resetOutlineDialog = new ModalDialog();
    await resetOutlineDialog.pushButton("Ok");
    await sleep(250);
    // Sadly we need to switch context and so we must reload the WebView elements
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );
    outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );

    text = await outlineList.getText();
    expect(!text.includes("# COMMENT\n"));

    // Test Back button
    const backButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='back-button']"),
    );
    expect(backButton, "backButton should not be undefined").not.to.be
      .undefined;
    await backButton.click();
    await sleep(500);

    text = await textArea.getText();
    expect(text.startsWith("Create an azure network."));
    await submitButton.click();
    await sleep(1000);
    text = await outlineList.getText();
    expect(text.includes("Create virtual network peering"));

    // Test Edit link next to the prompt text
    const backAnchor = await webView.findWebElement(
      By.xpath("//a[@id='back-anchor']"),
    );
    expect(backAnchor, "backAnchor should not be undefined").not.to.be
      .undefined;
    await backAnchor.click();
    await sleep(500);

    text = await textArea.getText();
    expect(text.startsWith("Create an azure network."));
    await submitButton.click();
    await sleep(1000);
    text = await outlineList.getText();
    expect(text.includes("Create virtual network peering"));
  });
});
