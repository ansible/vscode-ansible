import { By, EditorView, WebElement } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import os from "os";

config.truncateThreshold = 0;

describe("Test Ansible playbook and collection project scaffolding at default path", () => {
  let createButton: WebElement;
  let editorView: EditorView;

  before(async () => {
    // Install ansible-creator
    await workbenchExecuteCommand("Install Ansible Content Creator");
    await sleep(2000);
  });

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

describe("Test Ansible playbook and collection project scaffolding at provided path", () => {
  let editorView: EditorView;

  before(async () => {
    await workbenchExecuteCommand("Install Ansible Content Creator");
    await sleep(2000);
  });

  async function testWebViewElements(command: string, editorTitle: string) {
    await workbenchExecuteCommand(command);
    await sleep(4000);

    await new EditorView().openEditor(editorTitle);
    const webview = await getWebviewByLocator(
      By.xpath("//vscode-textfield[@id='path-url']"),
    );

    async function checkAndInteractWithField(fieldId: string, value: string) {
      const textField = await webview.findWebElement(
        By.xpath(`//vscode-textfield[@id='${fieldId}']`),
      );
      expect(textField, `${fieldId} should not be undefined`).not.to.be
        .undefined;
      await textField.sendKeys(value);
      await sleep(2000);
    }

    await checkAndInteractWithField("namespace-name", "test_namespaces");
    await checkAndInteractWithField("collection-name", "test-collection_name");
    await checkAndInteractWithField("path-url", path.join(os.homedir()));
    const logToFileCheckbox = await webview.findWebElement(
      By.xpath("//vscode-checkbox[@id='log-to-file-checkbox']"),
    );
    await logToFileCheckbox.click();
    await sleep(2000);

    await checkAndInteractWithField(
      "log-file-path",
      path.join(os.homedir(), "log-file.txt"),
    );

    async function clickButtonAndCheckEnabled(buttonId: string) {
      const button = await webview.findWebElement(
        By.xpath(`//vscode-button[@id='${buttonId}']`),
      );
      expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
      expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be
        .true;
      await button.click();
      await sleep(2000);
    }

    await clickButtonAndCheckEnabled("create-button");

    const overwriteCheckbox = await webview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
      .to.be.undefined;
    await overwriteCheckbox.click();
    await sleep(1000);

    await clickButtonAndCheckEnabled("create-button");
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
    );
  });

  it("Check create-ansible-collection webview elements", async () => {
    await testWebViewElements(
      "Ansible: Create New Collection",
      "Create Ansible collection",
    );
  });
});

describe("Test collection plugins scaffolding", () => {
  let createButton: WebElement;
  let editorView: EditorView;

  function scaffoldCollection(collectionPath: string) {
    try {
      execSync(
        `ansible-creator init collection test_namespace.test_collection ${collectionPath} --no-ansi`,
      );
      console.log("Collection scaffolded at:", collectionPath);
    } catch {
      console.error("Failed to scaffold collection");
    }
  }

  async function testWebViewElements(
    command: string,
    editorTitle: string,
    pluginName: string,
    pluginType: string,
    verifyPath: boolean = false,
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
    await sleep(3000);
    if (verifyPath) {
      scaffoldCollection("~");
      await createButton.click();
      await sleep(5000);

      const openPluginButton = await webview.findWebElement(
        By.xpath("//vscode-button[@id='open-folder-button']"),
      );
      expect(
        await openPluginButton.isEnabled(),
        "Open Plugin button should be enabled",
      ).to.be.true;
      // Verify if plugin file exists
      const pluginPath = path.join(
        os.homedir(),
        "plugins",
        "filter",
        "plugin_name.py",
      );
      expect(fs.existsSync(pluginPath)).to.be.true;
    }
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
      "Lookup",
    );
  });
  it("Check add-plugin webview elements for action plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "Add Plugin",
      "test_plugin_name",
      "Action",
    );
  });
  it("Verify Open Plugin button is enabled and plugin file exists", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "Add Plugin",
      "plugin_name",
      "filter",
      true,
    );
  });
});
