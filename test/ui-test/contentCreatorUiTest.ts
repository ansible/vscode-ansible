import { By, EditorView, WebView, WebElement } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import os from "os";

config.truncateThreshold = 0;

async function openCreateWebview(command: string, webviewId: string) {
  await workbenchExecuteCommand(command);
  const editorView = new EditorView();
  await sleep(5000);
  await editorView.openEditor(webviewId);
  return await getWebviewByLocator(
    By.xpath("//vscode-textfield[@id='path-url']"),
  );
}

async function checkAndInteractWithField(
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

describe("Test execution-environment project scaffolding at default path", () => {
  it("Check execution-environment webview elements", async () => {
    const eeWebview = await openCreateWebview(
      "Ansible: Create an Execution Environment file",
      "Create Ansible Execution Environment",
    );

    const descriptionText = await (
      await eeWebview.findWebElement(By.xpath("//div[@class='title-div']/h1"))
    ).getText();
    expect(descriptionText).to.contain(
      "Create an Ansible execution environment",
    );

    await checkAndInteractWithField(eeWebview, "path-url", "~");
    await sleep(500);

    const initEEProjectCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='initEE-checkbox']"),
    );
    await initEEProjectCheckbox.click();

    const overwriteCheckbox = await eeWebview.findWebElement(
      By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
    );
    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(500);

    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-button");

    await checkAndInteractWithField(eeWebview, "path-url", os.homedir());
    await sleep(500);

    await initEEProjectCheckbox.click();
    await overwriteCheckbox.click();
    await clickButtonAndCheckEnabled(eeWebview, "create-button");
    await sleep(500);

    await clickButtonAndCheckEnabled(eeWebview, "clear-button");
    await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
    await sleep(500);

    await eeWebview.switchBack();
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
    await checkAndInteractWithField("collection-name", "test_collection_name");
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

  before(async () => {
    await workbenchExecuteCommand("Install Ansible Content Creator");
    await sleep(2000);
  });

  // Safely finds the absolute path of the executable from system PATH without using shell commands.
  function findExecutable(command: string): string | null {
    const systemPaths = (process.env.PATH || "").split(path.delimiter);
    for (const systemPath of systemPaths) {
      const executablePath = path.join(systemPath, command);
      if (
        fs.existsSync(executablePath) &&
        fs.statSync(executablePath).isFile()
      ) {
        return executablePath;
      }
    }
    return null;
  }

  // Using execFile for safer execution without shell, ensuring SonarCloud compliance.
  function scaffoldCollection(collectionPath: string) {
    const safePath = path.resolve(collectionPath);

    const ansibleCreatorPath = findExecutable("ansible-creator");
    if (!ansibleCreatorPath) {
      console.error("ansible-creator not found in PATH");
      return;
    }

    execFile(
      ansibleCreatorPath,
      [
        "init",
        "collection",
        "test_namespace.test_collection",
        safePath,
        "--no-ansi",
      ],
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            "Failed to scaffold collection:",
            stderr || error.message,
          );
          return;
        }
        console.log("Collection scaffolded at:", safePath);
        console.log(stdout);
      },
    );
  }

  async function testWebViewElements(
    command: string,
    collectionPath: string,
    editorTitle: string,
    pluginName: string,
    pluginType: string,
    verifyPath: boolean = false,
  ) {
    const dropdownTagMap = {
      Action: 0,
      Filter: 1,
      Lookup: 2,
    } as { [key: string]: number };

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
    await collectionPathUrlTextField.sendKeys(collectionPath);
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
    await pluginTypeDropdown.click();
    await sleep(1000);
    const index = dropdownTagMap[pluginType];
    await webview.getDriver().executeScript(
      (dropdown: HTMLSelectElement, index: number) => {
        if (dropdown) {
          dropdown.selectedIndex = index;
          dropdown.dispatchEvent(new Event("change"));
        }
      },
      pluginTypeDropdown,
      index,
    );
    await sleep(1000);
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
      scaffoldCollection(collectionPath);
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
        "test",
        "plugins",
        "filter",
        "plugin_name.py",
      );
      console.log("Checking if plugin file exists at:", pluginPath);
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
      "~",
      "Add Plugin",
      "test_plugin_name",
      "Lookup",
    );
  });
  it("Check add-plugin webview elements for action plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "~",
      "Add Plugin",
      "test_plugin_name",
      "Action",
    );
  });
  it("Check add-plugin webview elements for generic module plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "~",
      "Add Plugin",
      "test_plugin_name",
      "Module",
    );
  });
  it("Check add-plugin webview elements for test plugin", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "~",
      "Add Plugin",
      "test_plugin_name",
      "Test",
    );
  });
  it("Verify Open Plugin button is enabled and plugin file exists", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      os.homedir + "/test",
      "Add Plugin",
      "plugin_name",
      "Filter",
      true,
    );
  });
});
