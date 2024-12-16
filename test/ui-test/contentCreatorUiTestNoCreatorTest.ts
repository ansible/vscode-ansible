import { By, EditorView, WebView } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";

config.truncateThreshold = 0;

async function openCreateWebview(command: string, webviewId: string) {
  await workbenchExecuteCommand(command);
  const editorView = new EditorView();
  await sleep(5000);
  await editorView.openEditor(webviewId);
  return await getWebviewByLocator(
    By.xpath("//vscode-text-field[@id='path-url']"),
  );
}

async function checkAndInteractWithField(
  webview: WebView,
  fieldId: string,
  value: string,
) {
  const textField = await webview.findWebElement(
    By.xpath(`//vscode-text-field[@id='${fieldId}']`),
  );
  expect(textField, `${fieldId} should not be undefined`).not.to.be.undefined;
  await textField.sendKeys(value);
}

async function clickButtonAndCheckEnabled(webview: WebView, buttonId: string) {
  const button = await webview.findWebElement(
    By.xpath(`//vscode-button[@id='${buttonId}']`),
  );
  expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
  expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be.true;
  await button.click();
}

describe("Test devfile generation webview (without creator)", () => {
  it("Check create-devfile webview elements", async () => {
    const devfileWebview = await openCreateWebview(
      "Ansible: Create a Devfile",
      "Create Devfile",
    );

    const descriptionText = await (
      await devfileWebview.findWebElement(
        By.xpath("//div[@class='description-div']"),
      )
    ).getText();
    expect(descriptionText).to.contain("Devfiles are yaml files");

    await checkAndInteractWithField(devfileWebview, "path-url", "~");
    await checkAndInteractWithField(devfileWebview, "devfile-name", "test");

    await clickButtonAndCheckEnabled(devfileWebview, "create-button");

    const overwriteDevfileCheckbox = await devfileWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    await overwriteDevfileCheckbox.click();

    await clickButtonAndCheckEnabled(devfileWebview, "create-button");
    await sleep(1000);
    await clickButtonAndCheckEnabled(devfileWebview, "clear-logs-button");
    await clickButtonAndCheckEnabled(devfileWebview, "reset-button");

    await checkAndInteractWithField(devfileWebview, "path-url", "~/test");
    await checkAndInteractWithField(devfileWebview, "devfile-name", "test");
    await clickButtonAndCheckEnabled(devfileWebview, "create-button");

    await clickButtonAndCheckEnabled(devfileWebview, "reset-button");
    await sleep(1000);
    await devfileWebview.switchBack();
  });
});

describe("Test devcontainer generation webview (without creator)", () => {
  it("Check create-devcontainer webview elements", async () => {
    const devcontainerWebview = await openCreateWebview(
      "Ansible: Create a Devcontainer",
      "Create Devcontainer",
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
  await sleep(1000);
  await clickButtonAndCheckEnabled(devcontainerWebview, "clear-logs-button");
  await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");

    await checkAndInteractWithField(devcontainerWebview, "path-url", "~/test");

  await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

    await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");
    await sleep(1000);
    await devcontainerWebview.switchBack();
  });
});
