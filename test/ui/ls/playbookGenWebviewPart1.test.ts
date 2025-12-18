// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  ActivityBar,
  By,
  ViewControl,
  ViewSection,
  WebviewView,
  Key,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  workbenchExecuteCommand,
  waitForCondition,
} from "../uiTestHelper";

config.truncateThreshold = 0;

describe("playbook generation features work", function () {
  let explorerView: WebviewView;
  let adtView: ViewSection;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
  });

  it.skip("Ensures we can go from DevTools to Playbook generation https://github.com/ansible/vscode-ansible/issues/2235", async function () {
    // Open Ansible Development Tools by clicking the Getting started button on the side bar
    const view = (await new ActivityBar().getViewControl(
      "Ansible",
    )) as ViewControl;
    const sideBar = await view.openView();
    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtView.expand();
    console.log("Expanded ADT view");

    await workbenchExecuteCommand(
      "Ansible: Focus on Ansible Development Tools View",
    );

    explorerView = new WebviewView();
    expect(explorerView).not.undefined;
    await explorerView.switchToFrame(1000);
    console.log("Switched to sidebar webview");

    const welcomePageLink = await explorerView.findWebElement(
      By.xpath(
        "//a[contains(@title, 'Ansible Development Tools welcome page')]",
      ),
    );

    expect(welcomePageLink).not.to.be.undefined;
    if (welcomePageLink) {
      await welcomePageLink.click();
    }

    await getWebviewByLocator(
      By.xpath(
        "//a[contains(@href,'command:ansible.lightspeed.playbookGeneration')]",
      ),
    );
  });

  it("Playbook generation webview works (full path) - part 1", async function () {
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");

    // Start operations on Playbook Generation UI
    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    let promptTextField = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    await promptTextField.sendKeys("Create an azure network.");
    await promptTextField.sendKeys(Key.ESCAPE);
    await promptTextField.click();

    const analyzeButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
    );
    await analyzeButton.click();

    // Verify outline output and text edit
    const outlineList = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath("//textarea[@id='outline-field']"),
        );
      },
      message: "Timed out waiting for playbook outline field",
      timeout: 30000,
    });
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

    const backButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Back')]"),
    );
    await backButton.click();

    promptTextField = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    text = await promptTextField.getText();
    expect(text.includes("Create an azure network."));
  });
});
