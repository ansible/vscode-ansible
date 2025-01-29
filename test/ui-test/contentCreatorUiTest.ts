import {
  By,
  EditorView,
  WebElement,
  Workbench,
  VSBrowser,
  SideBarView,
  TreeSection,
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
    // TODO: Temp fix, to be removed when playbook project webview is updated
    const textFieldTag =
      editorTitle === "Create Ansible collection"
        ? "vscode-textfield"
        : "vscode-text-field";
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
      "Ansible: Create a sample Ansible Execution Environment file",
      "Create Sample Ansible Execution Environment",
    );
  });

  it("Executes the build command from the right-click menu", async function () {
    const homeDir = path.resolve(
      process.env.HOME ?? process.env.USERPROFILE ?? "~",
    );
    await VSBrowser.instance.openResources(homeDir);
    const workbench = new Workbench();
    const explorer = await workbench
      .getActivityBar()
      .getViewControl("Explorer");
    if (!explorer) {
      throw new Error("Explorer view control not found");
    }

    const sideBar = await explorer.openView();
    if (!(sideBar instanceof SideBarView)) {
      throw new Error("Explorer view is not a SideBarView");
    }

    const sections = await sideBar.getContent().getSections();
    let explorerTree: TreeSection | null = null;

    for (const section of sections) {
      const title = await section.getTitle();
      if (title === path.basename(homeDir)) {
        explorerTree = section as TreeSection;
        break;
      }
    }

    if (!explorerTree) {
      throw new Error("Could not find the correct section in the Explorer");
    }
    await sleep(3000);

    const explorerItem = await explorerTree.findItem(
      "execution-environment.yml",
    );
    if (!explorerItem) {
      throw new Error("Test file not found in the workspace");
    }

    const contextMenu = await explorerItem.openContextMenu();
    const menuItem = await contextMenu.getItem(
      "Build Ansible execution environment",
    );
    if (!menuItem) {
      throw new Error("Build option not found in the context menu");
    }
    await menuItem.select();

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const notifications = await workbench.getNotifications();
    const successNotification = notifications.find(async (notification) => {
      const message = await notification.getMessage();
      return message.includes("Running: ansible-builder");
    });
    if (!successNotification) {
      throw new Error("Successful run notification not found");
    }

    expect(await successNotification.getMessage()).to.include(
      "Running: ansible-builder",
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
      By.xpath("//vscode-text-field[@id='path-url']"),
    );

    const collectionPathUrlTextField = await webview.findWebElement(
      By.xpath("//vscode-text-field[@id='path-url']"),
    );
    expect(
      collectionPathUrlTextField,
      "collectionPathUrlTextField should not be undefined",
    ).not.to.be.undefined;
    await collectionPathUrlTextField.sendKeys("~");

    const pluginNameTextField = await webview.findWebElement(
      By.xpath("//vscode-text-field[@id='plugin-name']"),
    );
    expect(pluginNameTextField, "pluginNameTextField should not be undefined")
      .not.to.be.undefined;
    await pluginNameTextField.sendKeys(pluginName);

    const pluginTypeDropdown = await webview.findWebElement(
      By.xpath("//vscode-dropdown[@id='plugin-dropdown']"),
    );
    expect(pluginTypeDropdown, "pluginTypeDropdown should not be undefined").not
      .to.be.undefined;
    await pluginTypeDropdown.sendKeys(pluginType);

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

  it("Check add-plugin webview elements", async () => {
    await testWebViewElements(
      "Ansible: Add a Plugin",
      "Add Plugin",
      "test_plugin_name",
      "lookup",
    );
  });
});
