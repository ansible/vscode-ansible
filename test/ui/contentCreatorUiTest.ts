import { By, EditorView, WebView, WebElement } from "vscode-extension-tester";
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
  });
  expect(button, `${buttonId} should not be undefined`).not.to.be.undefined;
  expect(await button.isEnabled(), `${buttonId} should be enabled`).to.be.true;
  await button.click();
}

describe("Content Creator UI Tests", function () {
  before(async function () {
    // Install ansible-creator
    await workbenchExecuteCommand("Install Ansible Content Creator");
    // This sleep is hard to get rid of because the installation takes time
    // need to look at ways to determine when the installation is ready
    await sleep(2000);
  });

  describe("Test execution-environment project scaffolding at default path", function () {
    it("Check execution-environment webview elements", async function () {
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

      await checkAndInteractWithField(eeWebview, "path-url", homeDir);

      const initEEProjectCheckbox = await waitForCondition({
        condition: async () => {
          return await eeWebview.findWebElement(
            By.xpath("//vscode-checkbox[@id='initEE-checkbox']"),
          );
        },
        message: "Timed out waiting for EE project checkbox",
      });

      await initEEProjectCheckbox.click();

      const overwriteCheckbox = await eeWebview.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );
      await overwriteCheckbox.click();
      await clickButtonAndCheckEnabled(eeWebview, "create-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-button");

      await checkAndInteractWithField(eeWebview, "path-url", homeDir);

      await initEEProjectCheckbox.click();
      await overwriteCheckbox.click();
      await clickButtonAndCheckEnabled(eeWebview, "create-button");

      await clickButtonAndCheckEnabled(eeWebview, "clear-button");
      await clickButtonAndCheckEnabled(eeWebview, "clear-logs-button");

      await eeWebview.switchBack();
      const editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
    });
  });

  describe("Test Ansible playbook and collection project scaffolding at provided path", function () {
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

      editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
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

  describe("Test Ansible playbook and collection project scaffolding at default path", function () {
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
      editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
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

  describe("Test collection plugins scaffolding", function () {
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

      console.log(`Executing command: ${command}`);
      await workbenchExecuteCommand(command);

      // Try multiple approaches to open the editor
      console.log(`Waiting for editor "${editorTitle}" to open...`);

      let editorOpened = false;
      let webview: WebView;

      // Approach 1: Try with default parameters (current approach)
      try {
        await waitForCondition({
          condition: async () => {
            try {
              const result = await new EditorView().openEditor(editorTitle);
              console.log(`Successfully opened editor with default parameters`);
              return result;
            } catch (error) {
              console.log(`Default approach failed:`, (error as Error).message);
              return false;
            }
          },
          message: `Timed out waiting for ${editorTitle} to open (default approach)`,
          timeout: 15000, // Shorter timeout for first attempt
        });
        editorOpened = true;
      } catch (error) {
        console.log(
          `Default approach failed after timeout: ${(error as Error).message}`,
        );
      }

      // Approach 2: Try with tab index parameter if first approach failed
      if (!editorOpened) {
        console.log(`Trying alternative approach with tab index...`);
        try {
          await waitForCondition({
            condition: async () => {
              try {
                // Try different tab indices
                for (let tabIndex = 0; tabIndex < 3; tabIndex++) {
                  try {
                    const result = await new EditorView().openEditor(
                      editorTitle,
                      tabIndex,
                    );
                    console.log(
                      `Successfully opened editor with tab index ${tabIndex}`,
                    );
                    return result;
                  } catch (e) {
                    console.log(
                      `Tab index ${tabIndex} failed: ${(e as Error).message}`,
                    );
                  }
                }
                return false;
              } catch (error) {
                console.log(
                  `Tab index approach error:`,
                  (error as Error).message,
                );
                return false;
              }
            },
            message: `Timed out waiting for ${editorTitle} to open (tab index approach)`,
            timeout: 20000, // Longer timeout for second attempt
          });
          editorOpened = true;
        } catch (error) {
          console.log(
            `Tab index approach failed after timeout: ${(error as Error).message}`,
          );
        }
      }

      // Approach 3: Try waiting longer with more retries if still failed
      if (!editorOpened) {
        console.log(`Trying final approach with extended timeout...`);
        await waitForCondition({
          condition: async () => {
            try {
              const editorView = new EditorView();
              console.log(`Attempting to open editor "${editorTitle}"...`);

              // Add extra delay to allow for Vue app mounting
              await sleep(1000);

              const result = await editorView.openEditor(editorTitle);
              console.log(`Successfully opened editor with extended timeout`);
              return result;
            } catch (error) {
              console.log(
                `Extended timeout attempt failed:`,
                (error as Error).message,
              );

              // Log available editors for debugging
              try {
                const editorView = new EditorView();
                const titles = await editorView.getOpenEditorTitles();
                console.log(`Available editor titles:`, titles);
              } catch (e) {
                console.log(
                  `Could not get editor titles:`,
                  (e as Error).message,
                );
              }

              return false;
            }
          },
          message: `Timed out waiting for ${editorTitle} to open (final approach)`,
          timeout: 30000, // Maximum timeout
        });
      }

      console.log(
        `Editor "${editorTitle}" opened successfully, getting webview...`,
      );
      webview = await getWebviewByLocator(
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
        By.xpath("//vscode-textfield[@id='plugin-name']"),
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
        scaffoldCollection(collectionPath);
        await createButton.click();
        // This sleep is hard to get rid of because scaffold collection takes time
        // need to look at ways to determine when the collection is ready
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
          homeDir,
          "test",
          "plugins",
          "filter",
          "sample_filter.py",
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

    it("Check add-plugin webview elements for lookup plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        homeDir,
        "Add Plugin",
        "test_plugin_name",
        "Lookup",
      );
    });

    it("Check add-plugin webview elements for action plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        homeDir,
        "Add Plugin",
        "test_plugin_name",
        "Action",
      );
    });

    it("Check add-plugin webview elements for generic module plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        homeDir,
        "Add Plugin",
        "test_plugin_name",
        "Module",
      );
    });

    it("Check add-plugin webview elements for test plugin", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        homeDir,
        "Add Plugin",
        "test_plugin_name",
        "Test",
      );
    });

    it("Verify Open Plugin button is enabled and plugin file exists", async function () {
      await testWebViewElements(
        "Ansible: Add a Plugin",
        os.homedir + "/test",
        "Add Plugin",
        "sample_filter",
        "Filter",
        true,
      );
    });
  });

  describe("Test role scaffolding in an existing collection", function () {
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

      editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
    }

    it("Check create-ansible-project webview elements", async function () {
      await testWebViewElements("Ansible: Add Role", "Create Role");
    });
  });
});
