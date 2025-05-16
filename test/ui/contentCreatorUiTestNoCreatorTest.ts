import { By, WebView, Workbench, InputBox } from "vscode-extension-tester";
import {
  dismissNotifications,
  getWebviewByLocator,
  waitForCondition,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import os from "os";
import fs from "fs";

config.truncateThreshold = 0;

async function openCreateWebview(command: string) {
  await workbenchExecuteCommand(command);
  return await getWebviewByLocator(
    By.xpath("//vscode-textfield[@id='path-url']"),
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

afterEach(async () => {
  const workbench = new Workbench();
  await dismissNotifications(workbench);
});

describe("Test devfile generation webview (without creator)", () => {
  it("Check create-devfile webview elements", async () => {
    const devfileWebview = await openCreateWebview("Ansible: Create a Devfile");

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

describe("Test devcontainer generation webview (without creator)", () => {
  it("Check create-devcontainer webview elements", async () => {
    const devcontainerWebview = await openCreateWebview(
      "Ansible: Create a Devcontainer",
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
    await clickButtonAndCheckEnabled(devcontainerWebview, "clear-logs-button");
    await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");

    await checkAndInteractWithField(devcontainerWebview, "path-url", "~/test");

    await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

    await overwriteDevcontainerCheckbox.click();
    await clickButtonAndCheckEnabled(devcontainerWebview, "create-button");

    await clickButtonAndCheckEnabled(devcontainerWebview, "reset-button");
    await devcontainerWebview.switchBack();
  });
});

describe("Test execution-environment generation webview (without creator)", () => {
  it("Check execution-environment webview elements", async () => {
    const eeWebview = await openCreateWebview(
      "Ansible: Create an Execution Environment file",
    );

    const descriptionText = await (
      await eeWebview.findWebElement(By.xpath("//div[@class='title-div']/h1"))
    ).getText();
    expect(descriptionText).to.contain(
      "Create an Ansible execution environment",
    );

    await checkAndInteractWithField(eeWebview, "path-url", "~");
    await checkAndInteractWithField(eeWebview, "tag-name", "ansible-ee:latest");
    await checkAndInteractWithField(
      eeWebview,
      "customBaseImage-name",
      "custom-image:latest",
    );
    await checkAndInteractWithField(
      eeWebview,
      "collections-name",
      "ansible.posix, ansible.utils",
    );
    await checkAndInteractWithField(
      eeWebview,
      "systemPackages-name",
      "openssh, curl",
    );
    await checkAndInteractWithField(
      eeWebview,
      "pythonPackages-name",
      "requests, numpy",
    );

    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    const overwriteCheckbox = await waitForCondition({
      condition: async () => {
        return await eeWebview.findWebElement(
          By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
        );
      },
      message: `Timed out waiting for overwrite checkbox`,
    });

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithField(
      eeWebview,
      "customBaseImage-name",
      "quay.io/new/custom",
    );
    await checkAndInteractWithField(
      eeWebview,
      "collections-name",
      "ansible.aws, kubernetes.core",
    );
    await checkAndInteractWithField(
      eeWebview,
      "systemPackages-name",
      "wget, nano",
    );
    await checkAndInteractWithField(
      eeWebview,
      "pythonPackages-name",
      "boto3, flask",
    );
    await checkAndInteractWithField(
      eeWebview,
      "tag-name",
      "ansible-ee:new-test",
    );

    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await clickButtonAndCheckEnabled(eeWebview, "clear-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithField(
      eeWebview,
      "customBaseImage-name",
      "quay.io/new/custom",
    );

    await checkAndInteractWithField(
      eeWebview,
      "tag-name",
      "ansible-ee:new-test",
    );
    const buildImageCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='buildImage-checkbox']"),
    );
    await buildImageCheckbox.click();

    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await clickButtonAndCheckEnabled(eeWebview, "clear-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithField(
      eeWebview,
      "customBaseImage-name",
      "quay.io/fedora/fedora:41",
    );
    await checkAndInteractWithField(
      eeWebview,
      "collections-name",
      "ansible.posix, ansible.utils",
    );
    await checkAndInteractWithField(
      eeWebview,
      "systemPackages-name",
      "openssh",
    );
    await checkAndInteractWithField(
      eeWebview,
      "pythonPackages-name",
      "boto3, flask",
    );
    await checkAndInteractWithField(eeWebview, "tag-name", "ansible-ee:latest");
    const createContextCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='createContext-checkbox']"),
    );
    await createContextCheckbox.click();

    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());
    await checkAndInteractWithField(
      eeWebview,
      "customBaseImage-name",
      "quay.io/centos/centos:stream9",
    );
    const suggestedCollectionsContainer = await eeWebview.findWebElement(
      By.id("suggestedCollections-checkboxes"),
    );
    const checkboxes = await suggestedCollectionsContainer.findElements(
      By.css("vscode-checkbox"),
    );
    const collectionsToSelect = ["ansible.aws", "ansible.posix"];
    for (const checkbox of checkboxes) {
      const value = await checkbox.getAttribute("value");
      if (collectionsToSelect.includes(value)) {
        await checkbox.click();
      }
    }
    await checkAndInteractWithField(eeWebview, "tag-name", "trial");
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());

    const baseImageDropdown = await eeWebview.findWebElement(
      By.xpath("//vscode-single-select[@id='baseImage-dropdown']"),
    );
    await baseImageDropdown.click();
    await eeWebview.getDriver().executeScript(`
      let dropdown = document.querySelector("vscode-single-select#baseImage-dropdown");
      if (dropdown) {
          dropdown.value = dropdown.options[1].value; // Select second option
          dropdown.dispatchEvent(new Event('change')); // Trigger change event
      }
    `);
    await checkAndInteractWithField(eeWebview, "tag-name", "ansible-ee:now");
    await clickButtonAndCheckEnabled(eeWebview, "create-button");

    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await eeWebview.switchBack();
  });

  it("Executes the build command from the right-click menu", async function () {
    const workbench = new Workbench();

    // Test with no file open in editor
    await workbenchExecuteCommand("Build Ansible execution environment");

    await waitForCondition({
      condition: async () => {
        const notifications = await workbench.getNotifications();
        for (const notification of notifications) {
          const message = await notification.getMessage();
          if (message === "No file selected and no active file found!") {
            return notification;
          }
        }
        return false;
      },
      message: `Timed out waiting for notification with message: "No file selected and no active file found!"`,
    });

    // Test with a file open but not the execution-environment.yml file
    await workbenchExecuteCommand("File: New Untitled Text file");
    await workbenchExecuteCommand("Build Ansible execution environment");

    await waitForCondition({
      condition: async () => {
        const notifications = await workbench.getNotifications();
        for (const notification of notifications) {
          const message = await notification.getMessage();
          if (message === "Active file is not an execution environment file!") {
            return notification;
          }
        }
        return false;
      },
      message: `Timed out waiting for notification with message: "Active file is not an execution environment file!"`,
    });

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

    await waitForCondition({
      condition: async () => {
        const notifications = await workbench.getNotifications();
        for (const notification of notifications) {
          const message = await notification.getMessage();
          if (message.match(/^Build (successful|failed)/)) {
            return notification;
          }
        }
        return false;
      },
      message: `Timed out waiting for notification with message: "Build successful" or "Build failed"`,
    });
  });
});
