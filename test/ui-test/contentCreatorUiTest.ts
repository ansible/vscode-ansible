import {
  By,
  EditorView,
  WebElement,
  WebView,
  Workbench,
} from "vscode-extension-tester";
import { sleep } from "./uiTestHelper";
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

      const playbookProject = (await new EditorView().openEditor(
        "Create Ansible project",
      )) as WebView;

      expect(playbookProject, "webView should not be undefined").not.to.be
        .undefined;
      await playbookProject.switchToFrame(5000);
      expect(
        playbookProject,
        "webView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

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

      const overwriteCheckbox = await playbookProject.findWebElement(
        By.xpath("//vscode-checkbox[@id='overwrite-checkbox']"),
      );

      expect(overwriteCheckbox, "overwriteCheckbox should not be undefined").not
        .to.be.undefined;
      await overwriteCheckbox.click();

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
