import { By, EditorView, WebElement, Workbench } from "vscode-extension-tester";
import { getWebviewByLocator, sleep } from "./uiTestHelper";
import { config, expect } from "chai";

config.truncateThreshold = 0;
export function contentCreatorUiTest(): void {
  describe("Test Ansible playbook project scaffolding", () => {
    let workbench: Workbench;
    let createButton: WebElement;
    let editorView: EditorView;

    before(async () => {
      workbench = new Workbench();
      editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
    });

    async function testWebViewElements(
      command: string,
      editorTitle: string,
      namespaceName: string,
      collectionName: string,
    ) {
      await workbench.executeCommand(command);
      await sleep(4000);

      await new EditorView().openEditor(editorTitle);
      const webview = await getWebviewByLocator(
        By.xpath("//vscode-text-field[@id='namespace-name']"),
      );

      const namespaceTextField = await webview.findWebElement(
        By.xpath("//vscode-text-field[@id='namespace-name']"),
      );
      expect(namespaceTextField, "namespaceTextField should not be undefined")
        .not.to.be.undefined;
      await namespaceTextField.sendKeys(namespaceName);

      const collectionTextField = await webview.findWebElement(
        By.xpath("//vscode-text-field[@id='collection-name']"),
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
  describe("Test devfile generation webview (without creator)", () => {
    let workbench: Workbench;
    let createDevfileButton: WebElement;
    let editorView: EditorView;

    before(async () => {
      workbench = new Workbench();
    });
    it("Check create-devfile webview elements", async () => {
      await workbench.executeCommand("Ansible: Create a Devfile");
      await sleep(2000);

      await new EditorView().openEditor("Create Devfile");
      const devfileWebview = await getWebviewByLocator(
        By.xpath("//vscode-text-field[@id='path-url']"),
      );

      const descriptionText = await (
        await devfileWebview.findWebElement(
          By.xpath("//div[@class='description-div']"),
        )
      ).getText();

      expect(
        descriptionText,
        "descriptionText should contain 'Devfiles are yaml files'",
      ).to.contain("Devfiles are yaml files");

      const devfileDestination = await devfileWebview.findWebElement(
        By.xpath("//vscode-text-field[@id='path-url']"),
      );

      expect(devfileDestination, "devfileDestination should not be undefined")
        .not.to.be.undefined;

      await devfileDestination.sendKeys("~");

      const devfileNameTextField = await devfileWebview.findWebElement(
        By.xpath("//vscode-text-field[@id='devfile-name']"),
      );

      expect(
        devfileNameTextField,
        "devfileNameTextField should not be undefined",
      ).not.to.be.undefined;

      await devfileNameTextField.sendKeys("test");

      createDevfileButton = await devfileWebview.findWebElement(
        By.xpath("//vscode-button[@id='create-button']"),
      );
      expect(createDevfileButton, "createDevfileButton should not be undefined")
        .not.to.be.undefined;

      expect(
        await createDevfileButton.isEnabled(),
        "createDevfileButton button should be enabled now",
      ).to.be.true;

      const overwriteDevfileCheckbox = await devfileWebview.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );
      await overwriteDevfileCheckbox.click();
      await createDevfileButton.click();
      await sleep(1000);

      const devfileClearLogsButton = await devfileWebview.findWebElement(
        By.xpath("//vscode-button[@id='clear-logs-button']"),
      );

      expect(
        devfileClearLogsButton,
        "devfileClearLogsButton should not be undefined",
      ).not.to.be.undefined;

      await devfileClearLogsButton.click();

      const resetButton = await devfileWebview.findWebElement(
        By.xpath("//vscode-button[@id='reset-button']"),
      );

      expect(resetButton, "resetButton should not be undefined").not.to.be
        .undefined;

      await resetButton.click();

      // Check that the devfile can't be generated if the dir doesn't exist
      await devfileDestination.sendKeys("~/test");
      await devfileNameTextField.sendKeys("test");
      await createDevfileButton.click();
      await resetButton.click();
      await sleep(1000);

      // Check that the devfile can't be generated if it already exists
      await devfileDestination.sendKeys("~");
      await devfileNameTextField.sendKeys("test");
      await createDevfileButton.click();
      await sleep(1000);

      await devfileWebview.switchBack();

      editorView = new EditorView();
      if (editorView) {
        await editorView.closeAllEditors();
      }
    });
  });
}
