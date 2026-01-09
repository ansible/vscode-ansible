// BEFORE: ansible.lightspeed.enabled: true
// UI Test for LLM Provider Playbook Generation (Google Gemini)
// Uses Mocha hooks to start/stop the mock server

import { By, Key, EditorView } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
  waitForCondition,
  ensureSettings,
} from "../uiTestHelper";
import { expect } from "chai";
import {
  startLLMProviderServer,
  stopLLMProviderServer,
} from "../mockLightspeedLLMProviderServer/serverManager";

describe("LLM Provider Playbook Generation", function () {
  let serverUrl: string;

  before(async function () {
    this.timeout(60000);

    try {
      serverUrl = await startLLMProviderServer();
      console.log(`[Test] Mock server started at: ${serverUrl}`);
    } catch (err) {
      console.error("[Test] Failed to start mock server:", err);
      this.skip();
      return;
    }

    // Directly modify settings.json file
    ensureSettings({
      "ansible.lightspeed.enabled": true,
      "ansible.lightspeed.apiEndpoint": serverUrl,
      "ansible.lightspeed.apiKey": "dummy-key-for-tests",
      "ansible.lightspeed.modelName": "gemini-2.5-flash",
      "ansible.lightspeed.provider": "google",
    });

    await new EditorView().closeAllEditors();

    await sleep(3000);
  });

  after(async function () {
    await stopLLMProviderServer();
  });

  it("Should generate playbook using Google Gemini provider", async function () {
    this.timeout(100000);

    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");

    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );
    expect(webView).not.to.be.undefined;

    const promptInput = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    await promptInput.sendKeys("Create a playbook to install nginx web server");
    await promptInput.sendKeys(Key.ESCAPE);
    await promptInput.click();

    const analyzeButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
    );
    expect(analyzeButton).not.to.be.undefined;
    await analyzeButton.click();

    const continueButton = await waitForCondition({
      condition: async () => {
        try {
          return await webView.findWebElement(
            By.xpath("//vscode-button[contains(text(), 'Continue')]"),
          );
        } catch {
          return undefined;
        }
      },
      timeout: 15000,
      message: "Continue button should appear on step 2 (outline review)",
    });
    expect(continueButton).not.to.be.undefined;

    const outlineField = await webView.findWebElement(
      By.xpath("//textarea[@id='outline-field']"),
    );
    expect(outlineField).not.to.be.undefined;

    await continueButton.click();

    const playbookContent = await waitForCondition({
      condition: async () => {
        try {
          return await webView.findWebElement(
            By.xpath("//*[contains(text(), 'nginx')]"),
          );
        } catch {
          return undefined;
        }
      },
      timeout: 15000,
      message: "Generated playbook should contain nginx",
    });
    expect(playbookContent).not.to.be.undefined;

    const content = await playbookContent.getText();
    expect(content).to.include("nginx");

    await webView.switchBack();
  });
});
