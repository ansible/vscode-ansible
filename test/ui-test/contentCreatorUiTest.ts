import {
  By,
  EditorView,
  WebElement,
  Workbench,
  InputBox,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import fs from "fs";
import path from "path";
import os from "os";

config.truncateThreshold = 0;

describe("Test Ansible playbook and collection project scaffolding", () => {
  let createButton: WebElement;
  let editorView: EditorView;

  async function testWebViewElements(
    command: string,
    editorTitle: string,
    namespaceName: string,
    collectionName: string,
  ) {
    await workbenchExecuteCommand(command);
    await sleep(4000);

    await new EditorView().openEditor(editorTitle);
    const textFieldTag = "vscode-textfield";
    const webview = await getWebviewByLocator(
      By.xpath(`//${textFieldTag}[@id='namespace-name']`),
    );

    const namespaceTextField = await webview.findWebElement(
      By.xpath(`//${textFieldTag}[@id='namespace-name']`),
    );
    expect(namespaceTextField, "namespaceTextField should not be undefined").not
      .to.be.undefined;
    await namespaceTextField.sendKeys(namespaceName);

    const collectionTextField = await webview.findWebElement(
      By.xpath(`//${textFieldTag}[@id='collection-name']`),
    );
    expect(collectionTextField, "collectionTextField should not be undefined")
      .not.to.be.undefined;
    await collectionTextField.sendKeys(collectionName);

    const overwriteCheckbox = await webview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
      .to.be.undefined;
    await overwriteCheckbox.click();

    createButton = await webview.findWebElement(
      By.xpath("//vscode-button[@id='create-button']"),
    );
    expect(createButton, "createButton should not be undefined").not.to.be
      .undefined;

    expect(
      await createButton.isEnabled(),
      "Create button should be enabled now",
    ).to.be.true;

    await createButton.click();
    await webview.switchBack();
    editorView = new EditorView();
    if (editorView) {
      await editorView.closeAllEditors();
    }
  }

  it("Check create-ansible-project webview elements", async () => {
    await testWebViewElements(
      "Ansible: Create New Playbook Project",
      "Create Ansible project",
      "test_namespace",
      "test_collection",
    );
  });

  it("Check create-ansible-collection webview elements", async () => {
    await testWebViewElements(
      "Ansible: Create New Collection",
      "Create Ansible collection",
      "test_namespace",
      "test_collection",
    );
  });
});

describe("Test Ansible sample execution environment file scaffolding", () => {
  let createEEButton: WebElement;
  let editorView: EditorView;
  let output: WebElement;

  before(async () => {
    // Install ansible-creator
    await workbenchExecuteCommand("Install Ansible Content Creator");
    await sleep(2000);
  });

  async function testWebViewElements(command: string, editorTitle: string) {
    await workbenchExecuteCommand(command);
    await sleep(5000);

    await new EditorView().openEditor(editorTitle);
    const eeWebview = await getWebviewByLocator(
      By.xpath("//vscode-text-field[@id='path-url']"),
    );

    const eeDestination = await eeWebview.findWebElement(
      By.xpath("//vscode-text-field[@id='path-url']"),
    );
    expect(eeDestination, "eeDestination should not be undefined").not.to.be
      .undefined;
    await eeDestination.sendKeys("~");

    const overwriteCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
      .to.be.undefined;
    await overwriteCheckbox.click();

    createEEButton = await eeWebview.findWebElement(
      By.xpath("//vscode-button[@id='create-button']"),
    );
    expect(createEEButton, "createEEButton should not be undefined").not.to.be
      .undefined;

    expect(
      await createEEButton.isEnabled(),
      "createEEbutton should be enabled now",
    ).to.be.true;

    await createEEButton.click();
    await sleep(1000);

    output = await eeWebview.findWebElement(
      By.xpath("//vscode-text-area[@id='log-text-area']"),
    );

    expect(
      await output.getAttribute("current-value"),
      "Creator output should contain success message",
    ).contains("Note: Resource added to");

    // Modify the content of the file to create an overwrite failure
    const eeFilePath = path.join(os.homedir(), "execution-environment.yml");
    fs.writeFileSync(eeFilePath, "version: 4", "utf8");

    // retry without overwrite selected
    await overwriteCheckbox.click();

    await createEEButton.click();
    await sleep(1000);

    output = await eeWebview.findWebElement(
      By.xpath("//vscode-text-area[@id='log-text-area']"),
    );
    expect(
      await output.getAttribute("current-value"),
      "Creator output should contain overwrite failure message",
    ).contains(
      "The destination directory contains files that can be overwritten",
    );
    await sleep(500);

    await eeWebview.switchBack();
    editorView = new EditorView();
    if (editorView) {
      await editorView.closeAllEditors();
    }
  }

  it("Check create-sample-execution-env-file webview elements", async () => {
    await testWebViewElements(
      "Ansible: Create a sample Ansible execution environment file",
      "Create Sample Ansible Execution Environment",
    );
  });

  it("Executes the build command from the right-click menu", async function () {
    const workbench = new Workbench();

    await workbenchExecuteCommand("Build Ansible execution environment");
    let notifications = await workbench.getNotifications();
    const errorNotification = notifications.find(async (notification) => {
      return (await notification.getMessage()).includes(
        "No file selected and no active file found!",
      );
    });
    if (!errorNotification) throw new Error("Notification not found");

    await workbenchExecuteCommand("File: New Untitled Text file");
    await workbenchExecuteCommand("Build Ansible execution environment");
    notifications = await workbench.getNotifications();
    const fileTypeError = notifications.find(async (notification) => {
      return (await notification.getMessage()).includes(
        "Active file is not an execution environment file!",
      );
    });
    if (!fileTypeError) throw new Error("Notification not found");

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

describe("Test collection plugins scaffolding", () => {
  let createButton: WebElement;
  let editorView: EditorView;

  async function testWebViewElements(
    command: string,
    editorTitle: string,
    pluginName: string,
    pluginType: string,
  ) {
    await workbenchExecuteCommand(command);
    await sleep(10000);

    await new EditorView().openEditor(editorTitle);
    const webview = await getWebviewByLocator(
      By.xpath("//vscode-textfield[@id='path-url']"),
    );

    const collectionPathUrlTextField = await webview.findWebElement(
      By.xpath("//vscode-textfield[@id='path-url']"),
    );
    expect(
      collectionPathUrlTextField,
      "collectionPathUrlTextField should not be undefined",
    ).not.to.be.undefined;
    await collectionPathUrlTextField.sendKeys("~");

    const pluginNameTextField = await webview.findWebElement(
      By.xpath("//vscode-textfield[@id='plugin-name']"),
    );
    expect(pluginNameTextField, "pluginNameTextField should not be undefined")
      .not.to.be.undefined;
    await pluginNameTextField.sendKeys(pluginName);

    const pluginTypeDropdown = await webview.findWebElement(
      By.xpath("//vscode-single-select[@id='plugin-dropdown']"),
    );
    expect(pluginTypeDropdown, "pluginTypeDropdown should not be undefined").not
      .to.be.undefined;
    await pluginTypeDropdown.sendKeys(pluginType);

    const overwriteCheckbox = await webview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
      .to.be.undefined;

    // Added `scrolling into view` before clicking overwriteCheckbox
    // to fix ElementClickInterceptedError on Mac OS runner.
    const driver = webview.getDriver();
    await driver.executeScript(
      "arguments[0].scrollIntoView(true);",
      overwriteCheckbox,
    );
    await overwriteCheckbox.click();

    createButton = await webview.findWebElement(
      By.xpath("//vscode-button[@id='create-button']"),
    );
    expect(createButton, "createButton should not be undefined").not.to.be
      .undefined;

    expect(
      await createButton.isEnabled(),
      "Create button should be enabled now",
    ).to.be.true;

    await createButton.click();
    await webview.switchBack();
    editorView = new EditorView();
    if (editorView) {
      await editorView.closeAllEditors();
    }
  }

  it("Check add-plugin webview elements for lookup plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "Add Plugin",
      "test_plugin_name",
      "lookup",
    );
  });
  it("Check add-plugin webview elements for action plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "Add Plugin",
      "test_plugin_name",
      "action",
    );
  });
});
