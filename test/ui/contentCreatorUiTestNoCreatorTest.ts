import { By, WebView, Workbench } from "vscode-extension-tester";
import {
  dismissNotifications,
  getWebviewByLocator,
  waitForCondition,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import os from "os";

config.truncateThreshold = 0;

async function openCreateWebview(command: string, formId: string) {
  await workbenchExecuteCommand(command);
  return await getWebviewByLocator(
    By.xpath(`//form[@id='${formId}']`),
  );
}

async function checkAndInteractWithField(
  webview: WebView,
  fieldId: string,
  value: string,
) {
  const textField = await waitForCondition({
    condition: async () => {
      return await webview.findWebElement(
        By.xpath(`//vscode-textfield[@id='${fieldId}']`),
      );
    },
    message: `Timed out waiting for text field with id ${fieldId}`,
  });
  expect(textField, `${fieldId} should not be undefined`).not.to.be.undefined;
  await textField.sendKeys(value);
}

async function clickButtonAndCheckEnabled(webview: WebView, buttonId: string) {
  const button = await waitForCondition({
    condition: async () => {
      return await webview.findWebElement(
        By.xpath(`//vscode-button[@id='${buttonId}']`),
      );
    },
    message: `Timed out waiting for ${buttonId} button`,
  });
  expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
  expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be.true;
  await button.click();
}

afterEach(async function () {
  const workbench = new Workbench();
  await dismissNotifications(workbench);
});

describe(__filename, function () {
  describe("devfile generation webview (without creator)", function () {
    it("Check create-devfile webview elements", async function () {
      const devfileWebview = await openCreateWebview(
        "Ansible: Create a Devfile",
        "devfile-form",
      );

      const descriptionText = await (
        await devfileWebview.findWebElement(
          By.xpath("//div[@class='description-div']"),
        )
      ).getText();
      expect(descriptionText).to.contain("Devfiles are yaml files");

      await checkAndInteractWithField(devfileWebview, "path-url", os.homedir());
      await checkAndInteractWithField(devfileWebview, "devfile-name", "test");

      await clickButtonAndCheckEnabled(devfileWebview, "create-button");

      const overwriteDevfileCheckbox = await devfileWebview.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );
      await overwriteDevfileCheckbox.click();

      await clickButtonAndCheckEnabled(devfileWebview, "create-button");
      await clickButtonAndCheckEnabled(devfileWebview, "clear-logs-button");
      await clickButtonAndCheckEnabled(devfileWebview, "reset-button");

      await checkAndInteractWithField(devfileWebview, "path-url", "~/test");
      await checkAndInteractWithField(devfileWebview, "devfile-name", "test");
      await clickButtonAndCheckEnabled(devfileWebview, "create-button");
      await overwriteDevfileCheckbox.click();
      await clickButtonAndCheckEnabled(devfileWebview, "create-button");

      await clickButtonAndCheckEnabled(devfileWebview, "reset-button");
      await devfileWebview.switchBack();
    });
  });

  describe("devcontainer generation webview (without creator)", function () {
    it("Check create-devcontainer webview elements", async function () {
      const devcontainerWebview = await openCreateWebview(
        "Ansible: Create a Devcontainer",
        "devcontainer-form",
      );

      const descriptionText = await (
        await devcontainerWebview.findWebElement(
          By.xpath("//div[@class='description-div']"),
        )
      ).getText();
      expect(descriptionText).to.contain("Devcontainers are json files");

      await checkAndInteractWithField(devcontainerWebview, "path-url", "~");

      await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

      const overwriteDevcontainerCheckbox =
        await devcontainerWebview.findWebElement(
          By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
        );
      await overwriteDevcontainerCheckbox.click();

      await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");
      await clickButtonAndCheckEnabled(
        devcontainerWebview,
        "clear-logs-button",
      );
      await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");

      await checkAndInteractWithField(
        devcontainerWebview,
        "path-url",
        "~/test",
      );

      await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

      await overwriteDevcontainerCheckbox.click();
      await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

      await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");
      await devcontainerWebview.switchBack();
    });
  });
});
