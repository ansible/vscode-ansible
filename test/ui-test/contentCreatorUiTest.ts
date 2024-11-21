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

      await new EditorView().openEditor("Create Ansible project");
      const playbookProject = await getWebviewByLocator(
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
}
