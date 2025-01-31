import {
  By,
  EditorView,
  WebView,
  Workbench,
  InputBox,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import os from "os";
import fs from "fs";

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

// Until devfile and devcontainer transitions to vscode-elements
async function openEEWebview(command: string, webviewId: string) {
  await workbenchExecuteCommand(command);
  const editorView = new EditorView();
  await sleep(5000);
  await editorView.openEditor(webviewId);
  return await getWebviewByLocator(
    By.xpath("//vscode-textfield[@id='path-url']"),
  );
}

async function checkAndInteractWithEEField(
  webview: WebView,
  fieldId: string,
  value: string,
) {
  const textField = await webview.findWebElement(
    By.xpath(`//vscode-textfield[@id='${fieldId}']`),
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
    await overwriteDevfileCheckbox.click();
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

    await overwriteDevcontainerCheckbox.click();
    await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

    await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");
    await sleep(1000);
    await devcontainerWebview.switchBack();
  });
});

describe("Test execution-environment generation webview (without creator)", () => {
  it("Check execution-environment webview elements", async () => {
    const eeWebview = await openEEWebview(
      "Ansible: Create an Execution Environment file",
      "Create Ansible Execution Environment",
    );

    const descriptionText = await (
      await eeWebview.findWebElement(By.xpath("//div[@class='title-div']/h1"))
    ).getText();
    expect(descriptionText).to.contain(
      "Create an Ansible execution environment",
    );

    await checkAndInteractWithEEField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithEEField(
      eeWebview,
      "tag-name",
      "ansible-ee:latest",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "customBaseImage-name",
      "custom-image:latest",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "collections-name",
      "ansible.posix, ansible.utils",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "systemPackages-name",
      "openssh, curl",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "pythonPackages-name",
      "requests, numpy",
    );

    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(1000);

    const overwriteCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(1000);

    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await checkAndInteractWithEEField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithEEField(
      eeWebview,
      "customBaseImage-name",
      "quay.io/new/custom",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "collections-name",
      "ansible.aws, kubernetes.core",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "systemPackages-name",
      "wget, nano",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "pythonPackages-name",
      "boto3, flask",
    );
    await checkAndInteractWithEEField(
      eeWebview,
      "tag-name",
      "ansible-ee:new-test",
    );

    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(1000);

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(1000);

    await clickButtonAndCheckEnabled(eeWebview, "clear-button");
    await sleep(1000);
    await eeWebview.switchBack();
  });

  it("Executes the build command from the right-click menu", async function () {
    const workbench = new Workbench();

    // Test with no file open in editor
    await workbenchExecuteCommand("Build Ansible execution environment");
    let notifications = await workbench.getNotifications();
    const errorNotification = notifications.find(async (notification) => {
      return (await notification.getMessage()).includes(
        "No file selected and no active file found!",
      );
    });
    if (!errorNotification) throw new Error("Notification not found");

    // Test with a file open but not the execution-environment.yml file
    await workbenchExecuteCommand("File: New Untitled Text file");
    await workbenchExecuteCommand("Build Ansible execution environment");
    notifications = await workbench.getNotifications();
    const fileTypeError = notifications.find(async (notification) => {
      return (await notification.getMessage()).includes(
        "Active file is not an execution environment file!",
      );
    });
    if (!fileTypeError) throw new Error("Notification not found");

    // Test with the execution-environment.yml file
    const eeFilePath = path.join(os.homedir(), "execution-environment.yml");
    fs.writeFileSync(eeFilePath, "ver: 4", "utf8");

    await workbenchExecuteCommand("Go to File...");
    const inputBox = await InputBox.create();
    await inputBox.setText(
      path.join(os.homedir(), "execution-environment.yml"),
    );
    await inputBox.confirm();
    await workbenchExecuteCommand("Build Ansible execution environment");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    notifications = await workbench.getNotifications();
    const buildResultNotification = notifications.find(async (notification) => {
      const message = await notification.getMessage();
      return (
        message.includes("Build successful") || message.includes("Build failed")
      );
    });
    if (!buildResultNotification) throw new Error("Notification not found");
    expect(await buildResultNotification.getMessage()).to.match(
      /^Build (successful|failed)/,
    );
  });
});
