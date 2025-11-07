import {
  By,
  EditorView,
  WebView,
  WebElement,
  Workbench,
  InputBox,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  waitForCondition,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import os from "os";

config.truncateThreshold = 0;

const homeDir = os.homedir();

async function openCreateWebview(command: string, webviewId: string) {
  await workbenchExecuteCommand(command);
  const editorView = new EditorView();
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
  const textField = await waitForCondition({
    condition: async () => {
      return await webview.findWebElement(
        By.xpath(`//vscode-textfield[@id='${fieldId}']`),
      );
    },
    message: `Timed out waiting for text field with id ${fieldId}`,
    timeout: 5000,  // Reduced from default 10000ms
    pollTimeout: 100,
  });
  expect(textField, `${fieldId} should not be undefined`).not.to.be.undefined;

  await webview
    .getDriver()
    .executeScript("arguments[0].scrollIntoView(true);", textField);

  await textField.sendKeys(value);
}

async function clickButtonAndCheckEnabled(webview: WebView, buttonId: string) {
  const button = await waitForCondition({
    condition: async () => {
      return await webview.findWebElement(
        By.xpath(`//vscode-button[@id='${buttonId}']`),
      );
    },
    message: `Timed out waiting for button with id ${buttonId}`,
    timeout: 5000,  // Reduced from default 10000ms
    pollTimeout: 100,
  });
  expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
  expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be.true;
  await button.click();
}

describe("Content Creator UI Tests", function () {
  let editorView: EditorView;

  before(async function () {
    // Install ansible-creator
    await workbenchExecuteCommand("Install Ansible Content Creator");
    // This sleep is hard to get rid of because the installation takes time
    // need to look at ways to determine when the installation is ready
    await sleep(2000);
    
    // Create shared EditorView instance
    editorView = new EditorView();
  });

  afterEach(async function () {
    // Clean up editors after each test
    if (editorView) {
      await editorView.closeAllEditors();
    }
  });

  describe("ee-project-scaffolding-at-default-path", function () {
    it("Check execution-environment webview elements", async function () {
      const eeWebview = await openCreateWebview(
        "Ansible: Create an Execution Environment file",
        "Create Execution Environment",
      );

      const descriptionText = await (
        await eeWebview.findWebElement(By.xpath("//div[@class='title-div']/h1"))
      ).getText();
      expect(descriptionText).to.contain(
        "Create an Ansible execution environment",
      );

      await checkAndInteractWithField(eeWebview, "path-url", homeDir);
      await checkAndInteractWithField(
        eeWebview,
        "tag-name",
        "ansible-ee:latest",
      );

      const imageDropdown = await eeWebview.findWebElement(
        By.xpath("//vscode-single-select[@id='baseImage-dropdown']"),
      );
      await eeWebview.getDriver().executeScript(
        (dropdown: HTMLSelectElement, index: number) => {
          if (dropdown) {
            dropdown.selectedIndex = index;
            dropdown.dispatchEvent(new Event("change"));
          }
        },
        imageDropdown,
        0,
      );
      await checkAndInteractWithField(
        eeWebview,
        "customBaseImage-name",
        "custom-image:latest",
      );
      await checkAndInteractWithField(
        eeWebview,
        "collections-name",
        "ansible.posix, ansible.utils, ansible.aws, ansible.network, kubernetes.core",
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

      const initEEProjectCheckbox = await waitForCondition({
        condition: async () => {
          return await eeWebview.findWebElement(
            By.xpath("//vscode-checkbox[@id='initEE-checkbox']"),
          );
        },
        message: "Timed out waiting for EE project checkbox",
      });

      const overwriteCheckbox = await waitForCondition({
        condition: async () => {
          return await eeWebview.findWebElement(
            By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
          );
        },
        message: `Timed out waiting for overwrite checkbox`,
      });
      const buildImageCheckbox = await waitForCondition({
        condition: async () => {
          return await eeWebview.findWebElement(
            By.xpath("//vscode-checkbox[@id='buildImage-checkbox']"),
          );
        },
        message: `Timed out waiting for overwrite checkbox`,
      });
      const createContextCheckbox = await waitForCondition({
        condition: async () => {
          return await eeWebview.findWebElement(
            By.xpath("//vscode-checkbox[@id='createContext-checkbox']"),
          );
        },
        message: `Timed out waiting for overwrite checkbox`,
      });
      await createContextCheckbox.click();
      await buildImageCheckbox.click();
      await initEEProjectCheckbox.click();
      await overwriteCheckbox.click();
      await clickButtonAndCheckEnabled(eeWebview, "create-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-button");

      await eeWebview.switchBack();
      // Editors cleaned up in afterEach hook
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
            if (
              message === "Active file is not an execution environment file!"
            ) {
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

  describe("Ansible playbook and collection project scaffolding at provided path", function () {
    async function testWebViewElements(command: string, editorTitle: string) {
      await workbenchExecuteCommand(command);

      await waitForCondition({
        condition: async () => {
          return await new EditorView().openEditor(editorTitle);
        },
        message: `Timed out waiting for ${editorTitle} to open`,
      });

      const webview = await getWebviewByLocator(
        By.xpath("//vscode-textfield[@id='path-url']"),
      );

      await checkAndInteractWithField(
        webview,
        "namespace-name",
        "test_namespaces",
      );
      await checkAndInteractWithField(
        webview,
        "collection-name",
        "test_collection_name",
      );
      await checkAndInteractWithField(webview, "path-url", path.join(homeDir));
      const logToFileCheckbox = await webview.findWebElement(
        By.xpath("//vscode-checkbox[@id='log-to-file-checkbox']"),
      );
      await logToFileCheckbox.click();

      await checkAndInteractWithField(
        webview,
        "log-file-path",
        path.join(homeDir, "log-file.txt"),
      );

      await clickButtonAndCheckEnabled(webview, "create-button");

      const overwriteCheckbox = await webview.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );
      expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
        .to.be.undefined;
      await overwriteCheckbox.click();

      await clickButtonAndCheckEnabled(webview, "create-button");
      await webview.switchBack();

      // Editors cleaned up in afterEach hook
    }

    it("Check create-ansible-project webview elements", async function () {
      await testWebViewElements(
        "Ansible: Create New Playbook Project",
        "Create Ansible project",
      );
    });

    it("Check create-ansible-collection webview elements", async function () {
      await testWebViewElements(
        "Ansible: Create New Collection",
        "Create Ansible collection",
      );
    });
  });

  describe("Ansible playbook and collection project scaffolding at default path", function () {
    let createButton: WebElement;
    let editorView: EditorView;

    async function testWebViewElements(
      command: string,
      editorTitle: string,
      namespaceName: string,
      collectionName: string,
    ) {
      await workbenchExecuteCommand(command);

      await new EditorView().openEditor(editorTitle);
      const textFieldTag = "vscode-textfield";
      const webview = await getWebviewByLocator(
        By.xpath(`//${textFieldTag}[@id='namespace-name']`),
      );

      const namespaceTextField = await webview.findWebElement(
        By.xpath(`//${textFieldTag}[@id='namespace-name']`),
      );
      expect(namespaceTextField, "namespaceTextField should not be undefined")
        .not.to.be.undefined;
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

      // If on the collection page, look for the editable checkbox
      if (editorTitle.includes("collection")) {
        const editableCheckbox = await webview.findWebElement(
          By.xpath("//vscode-checkbox[@id='editable-mode-checkbox']"),
        );
        expect(editableCheckbox, "editableCheckbox should not be undefined").not
          .to.be.undefined;
        await editableCheckbox.click();
      }

      await createButton.click();
      await webview.switchBack();
      // Editors cleaned up in afterEach hook
    }

    it("Check create-ansible-project webview elements", async function () {
      await testWebViewElements(
        "Ansible: Create New Playbook Project",
        "Create Ansible project",
        "test_namespace",
        "test_collection",
      );
    });

    it("Check create-ansible-collection webview elements", async function () {
      await testWebViewElements(
        "Ansible: Create New Collection",
        "Create Ansible collection",
        "test_namespace",
        "test_collection",
      );
    });
  });

  describe("collection plugins scaffolding", function () {
    let createButton: WebElement;
    let editorView: EditorView;

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
    async function scaffoldCollection(collectionPath: string): Promise<void> {
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

      console.log(`Executing command: ${command}`);
      await workbenchExecuteCommand(command);

      console.log(`Waiting for editor "${editorTitle}" to open...`);

      try {
        await waitForCondition({
          condition: async () => {
            try {
              const result = await new EditorView().openEditor(editorTitle);
              console.log(`Successfully opened editor with default parameters`);
              return result;
            } catch {
              return false;
            }
          },
          message: `Timed out waiting for ${editorTitle} to open.`,
          timeout: 20000, // Longer timeout
        });
      } catch (error) {
        console.log(
          `Default approach failed after timeout: ${(error as Error).message}`,
        );
      }

      console.log(
        `Editor "${editorTitle}" opened successfully, getting webview...`,
      );
      const webview = await getWebviewByLocator(
        By.xpath("//vscode-textfield[@id='path-url']"),
      );
      console.log(`Webview obtained successfully for "${editorTitle}"`);

      const collectionPathUrlTextField = await webview.findWebElement(
        By.xpath("//vscode-textfield[@id='path-url']"),
      );
      expect(
        collectionPathUrlTextField,
        "collectionPathUrlTextField should not be undefined",
      ).not.to.be.undefined;
      await collectionPathUrlTextField.sendKeys(collectionPath);
      const pluginNameTextField = await webview.findWebElement(
        By.xpath("//vscode-textfield[@id='name']"),
      );
      expect(pluginNameTextField, "pluginNameTextField should not be undefined")
        .not.to.be.undefined;
      await pluginNameTextField.sendKeys(pluginName);
      const pluginTypeDropdown = await webview.findWebElement(
        By.xpath("//vscode-single-select[@id='plugin-dropdown']"),
      );
      expect(pluginTypeDropdown, "pluginTypeDropdown should not be undefined")
        .not.to.be.undefined;
      await pluginTypeDropdown.click();
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
      if (verifyPath) {
        await scaffoldCollection(collectionPath);
        await createButton.click();
        
        // Wait for plugin file to exist (more reliable than fixed sleep)
        const pluginPath = path.join(
          collectionPath,
          "plugins",
          "filter",
          "sample_filter.py",
        );
        await waitForCondition({
          condition: async () => fs.existsSync(pluginPath),
          message: "Timed out waiting for plugin file to be created",
          timeout: 10000,  // 10s max, but usually finishes in 2-3s
          pollTimeout: 200,
        });

        const openPluginButton = await webview.findWebElement(
          By.xpath("//vscode-button[@id='open-folder-button']"),
        );

        expect(
          await openPluginButton.isEnabled(),
          "Open Plugin button should be enabled",
        ).to.be.true;
        // Plugin file existence already verified by waitForCondition above
        console.log("Plugin file exists at:", pluginPath);
        expect(fs.existsSync(pluginPath)).to.be.true;
      }
      await webview.switchBack();
      // Editors cleaned up in afterEach hook
    }

    it("Check add-plugin webview elements for lookup plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        `${homeDir}/test_collection`,
        "Add Plugin",
        "sample_plugin_name",
        "Lookup",
      );
    });

    it("Check add-plugin webview elements for action plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        `${homeDir}/test_collection`,
        "Add Plugin",
        "sample_plugin_name",
        "Action",
      );
    });

    it("Check add-plugin webview elements for generic module plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        `${homeDir}/test_collection`,
        "Add Plugin",
        "sample_plugin_name",
        "Module",
      );
    });

    it("Check add-plugin webview elements for test plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        `${homeDir}/test_collection`,
        "Add Plugin",
        "sample_plugin_name",
        "Test",
      );
    });

    it("Verify Open Plugin button is enabled and plugin file exists", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        `${homeDir}/test_collection`,
        "Add Plugin",
        "sample_filter",
        "Filter",
        true,
      );
    });
  });

  describe("role scaffolding in an existing collection", function () {
    let editorView: EditorView;

    async function testWebViewElements(command: string, editorTitle: string) {
      await workbenchExecuteCommand(command);

      await waitForCondition({
        condition: async () => {
          return await new EditorView().openEditor(editorTitle);
        },
        message: `Timed out waiting for ${editorTitle} to open`,
      });
      const webview = await getWebviewByLocator(
        By.xpath("//vscode-textfield[@id='path-url']"),
      );

      await checkAndInteractWithField(
        webview,
        "path-url",
        path.join(homeDir, "/test"),
      );
      await checkAndInteractWithField(webview, "role-name", "role_name");

      await clickButtonAndCheckEnabled(webview, "create-button");

      const overwriteCheckbox = await webview.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );
      expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
        .to.be.undefined;
      await overwriteCheckbox.click();
      await clickButtonAndCheckEnabled(webview, "create-button");
      await webview.switchBack();

      // Editors cleaned up in afterEach hook
    }

    it("Check create-ansible-project webview elements", async function () {
      await testWebViewElements("Ansible: Add Role", "Create Role");
    });
  });
});
