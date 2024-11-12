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

    it("Check create-ansible-project webview elements", async () => {
      await workbench.executeCommand("Ansible: Create New Playbook Project");
      await sleep(4000);

      await new EditorView().openEditor("Create Ansible project");
      const playbookProject = await getWebviewByLocator(
        By.xpath("//vscode-text-field[@id='namespace-name']"),
      );

      const namespaceTextField = await playbookProject.findWebElement(
        By.xpath("//vscode-text-field[@id='namespace-name']"),
      );
      expect(namespaceTextField, "namespaceTextField should not be undefined")
        .not.to.be.undefined;
      await namespaceTextField.sendKeys("test_namespace");

      const collectionTextField = await playbookProject.findWebElement(
        By.xpath("//vscode-text-field[@id='collection-name']"),
      );
      expect(collectionTextField, "collectionTextField should not be undefined")
        .not.to.be.undefined;
      await collectionTextField.sendKeys("test_collection");

      const forceCheckbox = await playbookProject.findWebElement(
        By.xpath("//vscode-checkbox[@id='force-checkbox']"),
      );

      expect(forceCheckbox, "forceCheckbox should not be undefined").not.to.be
        .undefined;
      await forceCheckbox.click();

      createButton = await playbookProject.findWebElement(
        By.xpath("//vscode-button[@id='create-button']"),
      );
      expect(createButton, "createButton should not be undefined").not.to.be
        .undefined;

      expect(
        await createButton.isEnabled(),
        "Create button should be enabled now",
      ).to.be.true;
      await createButton.click();
      await playbookProject.switchBack();
    });
  });
}
