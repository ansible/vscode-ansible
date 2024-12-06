import { By, EditorView } from "vscode-extension-tester";
import {
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { config, expect } from "chai";

config.truncateThreshold = 0;

describe("Test devfile generation webview (without creator)", () => {
  it("Check create-devfile webview elements", async () => {
    await workbenchExecuteCommand("Ansible: Create a Devfile");
    const editorView = new EditorView();
    await sleep(5000); // 2s is probably enough, but the CI is slower.
    await editorView.openEditor("Create Devfile");
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
    expect(devfileDestination, "devfileDestination should not be undefined").not
      .to.be.undefined;
    await devfileDestination.sendKeys("~");
    const devfileNameTextField = await devfileWebview.findWebElement(
      By.xpath("//vscode-text-field[@id='devfile-name']"),
    );
    expect(devfileNameTextField, "devfileNameTextField should not be undefined")
      .not.to.be.undefined;
    await devfileNameTextField.sendKeys("test");
    const createDevfileButton = await devfileWebview.findWebElement(
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
  });
});
