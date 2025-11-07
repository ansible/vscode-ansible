import {
  By,
  EditorView,
  VSBrowser,
  WebView,
  Workbench,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  waitForCondition,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";

const execFileAsync = promisify(execFile);

config.truncateThreshold = 0;

const homeDir = os.homedir();

// REAL OPTIMIZATION: Reusable notification checker (eliminates duplicate code)
async function waitForNotification(
  workbench: Workbench,
  expectedMessage: string | RegExp,
): Promise<void> {
  // FIX: Don't dismiss notifications here - let the command create them first!
  // The afterEach cleanup will handle dismissing lingering notifications.

  await waitForCondition({
    condition: async () => {
      const notifications = await workbench.getNotifications();
      for (const notification of notifications) {
        const message = await notification.getMessage();
        const matches =
          typeof expectedMessage === "string"
            ? message === expectedMessage
            : message.match(expectedMessage);
        if (matches) {
          return notification;
        }
      }
      return false;
    },
    message: `Timed out waiting for notification: ${expectedMessage}`,
    timeout: 10000,
    pollTimeout: 200,
  });
}

// REAL OPTIMIZATION: Check if ansible-creator is actually installed and ready
async function waitForAnsibleCreatorReady(): Promise<void> {
  await waitForCondition({
    condition: async () => {
      try {
        const { stdout, stderr } = await execFileAsync("ansible-creator", [
          "--version",
        ]);
        // Check both stdout and stderr (some versions output to stderr)
        const output = (stdout + stderr).trim();
        return output.length > 0;
      } catch {
        return false; // Not ready yet
      }
    },
    message: "ansible-creator installation timed out or failed",
    timeout: 30000, // Max 30s for installation (generous for CI)
    pollTimeout: 500, // Check every 500ms
  });
}

// REAL OPTIMIZATION: Use shared editorView instead of creating new instance
async function openCreateWebview(
  command: string,
  webviewId: string,
  sharedEditorView: EditorView,
) {
  await workbenchExecuteCommand(command);
  await sharedEditorView.openEditor(webviewId);
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
    timeout: 5000, // Reduced from default 10000ms
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
    timeout: 5000, // Reduced from default 10000ms
    pollTimeout: 100,
  });
  expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
  expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be.true;
  await button.click();
}

// REAL OPTIMIZATION: Reusable checkbox finder and clicker
async function findAndClickCheckbox(
  webview: WebView,
  checkboxId: string,
  scrollIntoView: boolean = false,
): Promise<void> {
  const checkbox = await waitForCondition({
    condition: async () => {
      return await webview.findWebElement(
        By.xpath(`//vscode-checkbox[@id='${checkboxId}']`),
      );
    },
    message: `Timed out waiting for checkbox with id ${checkboxId}`,
    timeout: 5000,
    pollTimeout: 100,
  });
  expect(checkbox, `${checkboxId} should not be undefined`).not.to.be.undefined;

  // Scroll into view if needed (fixes ElementClickInterceptedError on Mac OS)
  if (scrollIntoView) {
    const driver = webview.getDriver();
    await driver.executeScript("arguments[0].scrollIntoView(true);", checkbox);
  }

  await checkbox.click();
}

describe("Content Creator UI Tests", function () {
  // Shared instances used across all tests
  let editorView: EditorView;
  let workbench: Workbench;

  before(async function () {
    // Initialize shared instances
    workbench = new Workbench();
    editorView = new EditorView();

    // Install ansible-creator
    await workbenchExecuteCommand("Install Ansible Content Creator");

    // REAL OPTIMIZATION: Wait until ansible-creator is actually ready
    // (instead of blind sleep) - exits as soon as ready, not after fixed time!
    await waitForAnsibleCreatorReady();
  });

  afterEach(async function () {
    // FIX: Ensure clean state between tests
    try {
      // Close all editors
      if (editorView) {
        await editorView.closeAllEditors();
      }

      // Dismiss any lingering notifications
      const notifications = await workbench.getNotifications();
      for (const notification of notifications) {
        try {
          await notification.dismiss();
        } catch {
          // Ignore if notification already gone
        }
      }
    } catch (error) {
      // Log but don't fail the test
      console.log("Cleanup warning:", error);
    }
  });

  describe("ee-project-scaffolding-at-default-path", function () {
    it("Check execution-environment webview elements", async function () {
      const eeWebview = await openCreateWebview(
        "Ansible: Create an Execution Environment file",
        "Create Execution Environment",
        editorView,
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

      // OPTIMIZATION: Use helper for consistent checkbox interaction
      await findAndClickCheckbox(eeWebview, "createContext-checkbox");
      await findAndClickCheckbox(eeWebview, "buildImage-checkbox");
      await findAndClickCheckbox(eeWebview, "initEE-checkbox");
      await findAndClickCheckbox(eeWebview, "overwrite-checkbox");
      await clickButtonAndCheckEnabled(eeWebview, "create-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-button");

      await eeWebview.switchBack();
      // Editors cleaned up in afterEach hook
    });
    it("Executes the build command from the right-click menu", async function () {
      // OPTIMIZATION: Use shared workbench instance instead of creating new one

      // Test 1: No file open
      await workbenchExecuteCommand("Build Ansible execution environment");
      await waitForNotification(
        workbench,
        "No file selected and no active file found!",
      );

      // Test 2: Wrong file type open
      await workbenchExecuteCommand("File: New Untitled Text file");
      await workbenchExecuteCommand("Build Ansible execution environment");
      await waitForNotification(
        workbench,
        "Active file is not an execution environment file!",
      );

      // Test 3: Correct execution-environment.yml file
      const eeFilePath = path.join(os.homedir(), "execution-environment.yml");
      fs.writeFileSync(eeFilePath, "ver: 4", "utf8");

      // OPTIMIZATION: Use VSBrowser.instance.openResources (faster than manual InputBox)
      await VSBrowser.instance.openResources(eeFilePath);
      await workbenchExecuteCommand("Build Ansible execution environment");
      await waitForNotification(workbench, /^Build (successful|failed)/);
    });
  });

  describe("Ansible playbook and collection project scaffolding at provided path", function () {
    async function testWebViewElements(command: string, editorTitle: string) {
      await workbenchExecuteCommand(command);

      // Use shared editorView instance with waitForCondition
      await waitForCondition({
        condition: async () => {
          return await editorView.openEditor(editorTitle);
        },
        message: `Timed out waiting for ${editorTitle} to open`,
        timeout: 5000, // Optimized timeout
        pollTimeout: 100,
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

      // OPTIMIZATION: Use helper for checkbox interaction
      await findAndClickCheckbox(webview, "log-to-file-checkbox");

      await checkAndInteractWithField(
        webview,
        "log-file-path",
        path.join(homeDir, "log-file.txt"),
      );

      await clickButtonAndCheckEnabled(webview, "create-button");

      // OPTIMIZATION: Use helper for checkbox interaction
      await findAndClickCheckbox(webview, "overwrite-checkbox");

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
    async function testWebViewElements(
      command: string,
      editorTitle: string,
      namespaceName: string,
      collectionName: string,
    ) {
      await workbenchExecuteCommand(command);

      // Use shared editorView instance
      await editorView.openEditor(editorTitle);
      const textFieldTag = "vscode-textfield";
      const webview = await getWebviewByLocator(
        By.xpath(`//${textFieldTag}[@id='namespace-name']`),
      );

      // Use checkAndInteractWithField helper for consistent field interaction
      await checkAndInteractWithField(webview, "namespace-name", namespaceName);
      await checkAndInteractWithField(
        webview,
        "collection-name",
        collectionName,
      );

      // OPTIMIZATION: Use helper for checkbox interaction
      await findAndClickCheckbox(webview, "overwrite-checkbox");

      // If on the collection page, look for the editable checkbox
      if (editorTitle.includes("collection")) {
        await findAndClickCheckbox(webview, "editable-mode-checkbox");
      }

      // Use clickButtonAndCheckEnabled helper
      await clickButtonAndCheckEnabled(webview, "create-button");
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
        (error, _stdout, stderr) => {
          if (error) {
            console.error(
              "Failed to scaffold collection:",
              stderr || error.message,
            );
            return;
          }
          // Collection scaffolded successfully
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

      // Use shared editorView instance with optimized timeout
      await waitForCondition({
        condition: async () => {
          try {
            return await editorView.openEditor(editorTitle);
          } catch {
            return false;
          }
        },
        message: `Timed out waiting for ${editorTitle} to open.`,
        timeout: 10000, // Plugin scaffolding needs longer timeout
        pollTimeout: 200,
      });

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

      // OPTIMIZATION: Use helper with scroll (fixes ElementClickInterceptedError on Mac OS)
      await findAndClickCheckbox(webview, "overwrite-checkbox", true);

      const createButton = await webview.findWebElement(
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
          timeout: 10000, // 10s max, but usually finishes in 2-3s
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
    async function testWebViewElements(command: string, editorTitle: string) {
      await workbenchExecuteCommand(command);

      // Use shared editorView instance with optimized timeout
      await waitForCondition({
        condition: async () => {
          return await editorView.openEditor(editorTitle);
        },
        message: `Timed out waiting for ${editorTitle} to open`,
        timeout: 5000, // Optimized timeout
        pollTimeout: 100,
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

      // OPTIMIZATION: Use helper for checkbox interaction
      await findAndClickCheckbox(webview, "overwrite-checkbox");

      await clickButtonAndCheckEnabled(webview, "create-button");
      await webview.switchBack();

      // Editors cleaned up in afterEach hook
    }

    it("Check create-ansible-project webview elements", async function () {
      await testWebViewElements("Ansible: Add Role", "Create Role");
    });
  });
});
