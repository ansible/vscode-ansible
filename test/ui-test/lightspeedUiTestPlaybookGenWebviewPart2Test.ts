// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  By,
  Workbench,
  VSBrowser,
  EditorView,
  until,
  WebView,
  ModalDialog,
} from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
} from "./uiTestHelper";
import { WizardGenerationActionType } from "../../src/definitions/lightspeed";
import { PlaybookGenerationActionEvent } from "../../src/interfaces/lightspeed";

config.truncateThreshold = 0;

describe("Verify playbook generation features work as expected", function () {
  let workbench: Workbench;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    await sleep(3000);

    workbench = new Workbench();

    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);
  });

  it("Playbook generation webview works as expected (full path) - part 2", async function () {
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(3000);

    let webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );

    await textArea.sendKeys("Create an azure network.");
    // Click Generate playbook button to invoke the generations API
    const generatePlaybookButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='generate-button']"),
    );
    expect(
      generatePlaybookButton,
      "generatePlaybookButton should not be undefined",
    ).not.to.be.undefined;

    const submitButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='submit-button']"),
    );
    await submitButton.click();
    await sleep(2000);

    // 2nd page
    let outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    // Input "(status=400)" to simulate an API error
    await outlineList.sendKeys("(status=400)");
    let text = await outlineList.getText();
    expect(text.includes("(status=400)"));
    await generatePlaybookButton.click(); // Click Generate Playbook button
    await sleep(2000);

    const resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );
    // Click reset button and make sure the string "(status=400)" is removed
    await resetButton.click();
    await sleep(500);

    // Confirm reset of Outline
    await webView.switchBack();
    const resetOutlineDialog = new ModalDialog();
    await resetOutlineDialog.pushButton("Ok");
    await sleep(250);
    // Sadly we need to switch context and so we must reload the WebView elements
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );
    outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );

    text = await outlineList.getText();
    expect(!text.includes("(status=400)"));

    // Click Generate Playbook button again
    await generatePlaybookButton.click();
    await sleep(2000);

    // Make sure the generated playbook is displayed
    const formattedCode = await webView.findWebElement(
      By.xpath("//span[@id='formatted-code']"),
    );
    expect(formattedCode, "formattedCode should not be undefined").not.to.be
      .undefined;
    await sleep(500);
    text = await formattedCode.getText();
    expect(text.startsWith("---")).to.be.true;

    // Test Back (to Page 2) button
    const backToPage2Button = await webView.findWebElement(
      By.xpath("//vscode-button[@id='back-to-page2-button']"),
    );
    expect(backToPage2Button, "backToPage2Button should not be undefined").not
      .to.be.undefined;
    await backToPage2Button.click();
    await sleep(500);

    // Type in something extra
    await outlineList.sendKeys("\nSomething extra");
    const savedOutline = await outlineList.getText();

    // Click generate playbook button again
    generatePlaybookButton.click();
    await sleep(2000);

    // Click Back page again
    await backToPage2Button.click();
    await sleep(500);

    // Make sure outline is not updated.
    expect(savedOutline).equal(await outlineList.getText());

    // Click generate playbook button again
    generatePlaybookButton.click();
    await sleep(500);

    // Click Open editor button to open the generated playbook in the editor
    const openEditorButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='open-editor-button']"),
    );
    expect(openEditorButton, "openEditorButton should not be undefined").not.to
      .be.undefined;
    await openEditorButton.click();
    await sleep(2000);
    await webView.switchBack();

    // Verify a playbook was generated.
    const editor = await new EditorView().openEditor("Untitled-1");
    await sleep(2000);

    text = await editor.getText();
    expect(
      text.startsWith("---"),
      'The generated playbook should start with "---"',
    ).to.be.true;

    await workbenchExecuteCommand("View: Close All Editor Groups");
    const dialog = new ModalDialog();
    await dialog.pushButton(`Don't Save`);
    await dialog.getDriver().wait(until.stalenessOf(dialog), 2000);

    /* verify generated events */
    const expected = [
      [WizardGenerationActionType.OPEN, undefined, 1],
      [WizardGenerationActionType.TRANSITION, 1, 2],
      [WizardGenerationActionType.TRANSITION, 2, 3],
      [WizardGenerationActionType.TRANSITION, 3, 2],
      [WizardGenerationActionType.TRANSITION, 2, 3],
      [WizardGenerationActionType.TRANSITION, 3, 2],
      [WizardGenerationActionType.TRANSITION, 2, 3],
      [WizardGenerationActionType.CLOSE_ACCEPT, 3, undefined],
    ];

    try {
      const response: Response = await fetch(
        `${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`,
        {
          method: "GET",
        },
      );

      if (response.ok) {
        const data = await response.json();
        expect(data.feedbacks.length).equals(expected.length);
        for (let i = 0; i < expected.length; i++) {
          const evt: PlaybookGenerationActionEvent =
            data.feedbacks[i].playbookGenerationAction;
          expect(evt.action).equals(expected[i][0]);
          expect(evt.fromPage).equals(expected[i][1]);
          expect(evt.toPage).equals(expected[i][2]);
        }
      } else {
        expect.fail(
          `Failed to get feedback events, request returned status: ${response.status} and text: ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error("Failed to get feedback events with unknown error", error);
      expect.fail("Failed to get feedback events with unknown error");
    }
  });

  it("Playbook generation webview (multiple instances)", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    // Ensure all previous instances are closed
    await workbenchExecuteCommand("View: Close All Editor Groups");
    await sleep(1000);

    // Open playbook generation webview.
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(1000);

    // Open another playbook generation webview.
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(1000);

    const editorView = new EditorView();
    const titles = await editorView.getOpenEditorTitles();
    expect(
      titles.filter((value) => value === "Ansible Lightspeed").length,
    ).to.equal(2);

    await workbenchExecuteCommand("View: Close All Editor Groups");
  });

  it("Playbook explanation webview works as expected", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    const folder = "lightspeed";
    const file = "playbook_4.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    // Open playbook explanation webview.
    await workbenchExecuteCommand(
      "Explain the playbook with Ansible Lightspeed",
    );
    await sleep(2000);

    // Locate the playbook explanation webview
    let webView = (await new EditorView().openEditor(
      "Explanation",
      1,
    )) as WebView;
    expect(webView, "webView should not be undefined").not.to.be.undefined;
    webView = await getWebviewByLocator(
      By.xpath("//div[@class='playbookGeneration']"),
    );
    await webView.findWebElement(
      By.xpath("//h2[contains(text(), 'Playbook Overview and Structure')]"),
    );

    await webView.switchBack();
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});
