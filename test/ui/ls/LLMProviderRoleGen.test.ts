// BEFORE: ansible.lightspeed.enabled: true
// UI Test for LLM Provider Role Generation (Google Gemini)
// Uses Mocha hooks to start/stop the mock server

import { By, Key, EditorView } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
  waitForCondition,
  openSettings,
  updateSettings,
} from "../uiTestHelper";
import { expect } from "chai";
import {
  startLLMProviderServer,
  stopLLMProviderServer,
} from "../mockLightspeedLLMProviderServer/serverManager";

describe("LLM Provider Role Generation", function () {
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

    const settingsEditor = await openSettings();
    await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.apiEndpoint",
      serverUrl,
    );
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.apiKey",
      "dummy-key-for-tests",
    );
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.modelName",
      "gemini-2.5-flash",
    );
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.provider",
      "google",
    );

    await new EditorView().closeAllEditors();
    await sleep(2000);
  });

  after(async function () {
    await stopLLMProviderServer();
  });

  it("Should generate role using Google Gemini provider", async function () {
    this.timeout(100000);

    await workbenchExecuteCommand("Ansible Lightspeed: Role generation");

    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a role with Ansible Lightspeed']"),
    );
    expect(webView).not.to.be.undefined;

    const promptInput = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    await promptInput.sendKeys("Install and configure nginx");
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

    const roleContent = await waitForCondition({
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
      message: "Generated role should contain nginx",
    });
    expect(roleContent).not.to.be.undefined;

    const content = await roleContent.getText();
    expect(content).to.include("nginx");

    await webView.switchBack();
  });
});
