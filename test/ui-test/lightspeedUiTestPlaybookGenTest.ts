// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import axios from "axios";
import {
  By,
  Workbench,
  VSBrowser,
  EditorView,
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
  let webView: WebView;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    await sleep(5000);
    workbench = new Workbench();
    // await workbenchExecuteCommand(
    //   "Ansible Lightspeed: Enable experimental features",
    // );
    await sleep(3000);

    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);
  });

  async function setupPage1() {
    // Open playbook generation webview.
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(4000);
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    // Set input text and invoke summaries API
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );
    expect(textArea, "textArea should not be undefined").not.to.be.undefined;
    await textArea.sendKeys("Create an azure network.");
  }

  async function gotoPage2() {
    const submitButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='submit-button']"),
    );
    await submitButton.click();
    await sleep(1000);
  }

  it("Playbook generation webview works as expected (fast path)", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    await setupPage1();
    await gotoPage2();

    // Verify outline output and text edit
    const outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    expect(outlineList, "An ordered list should exist.").to.be.not.undefined;
    let text = await outlineList.getText();
    expect(text.includes("Create virtual network peering")).to.be.true;

    // Verify the prompt is displayed as a static text
    const prompt = await webView.findWebElement(
      By.xpath("//span[@id='prompt']"),
    );
    text = await prompt.getText();
    expect(text.includes("Create an azure network.")).to.be.true;

    // Click Generate playbook button to invoke the generations API
    const generatePlaybookButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='generate-button']"),
    );
    expect(
      generatePlaybookButton,
      "generatePlaybookButton should not be undefined",
    ).not.to.be.undefined;

    const start = new Date().getTime();
    await generatePlaybookButton.click();
    await sleep(300);

    // Verify a playbook was generated.
    const formattedCode = await webView.findWebElement(
      By.xpath("//span[@id='formatted-code']"),
    );
    expect(formattedCode, "formattedCode should not be undefined").not.to.be
      .undefined;
    text = await formattedCode.getText();
    expect(text.startsWith("---")).to.be.true;

    // Make sure the playbook was generated within 1000 msecs, which is the fake latency
    // used in the mock server. It means that the playbook returned in the outline generation
    // was used and the generations API was not called this time.
    const elapsedTime = new Date().getTime() - start;
    expect(elapsedTime < 1000).to.be.true;

    // Click Open editor button to open the generated playbook in the editor
    const openEditorButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='open-editor-button']"),
    );
    expect(openEditorButton, "openEditorButton should not be undefined").not.to
      .be.undefined;
    await openEditorButton.click();
    await sleep(500);
    await webView.switchBack();

    const editor = await new EditorView().openEditor("Untitled-1");
    text = await editor.getText();
    expect(
      text.startsWith("---"),
      'The generated playbook should start with "---"',
    ).to.be.true;

    await workbenchExecuteCommand("View: Close All Editor Groups");
    const dialog = new ModalDialog();
    await dialog.pushButton(`Don't Save`);

    /* verify generated events */
    const expected = [
      [WizardGenerationActionType.OPEN, undefined, 1],
      [WizardGenerationActionType.TRANSITION, 1, 2],
      [WizardGenerationActionType.TRANSITION, 2, 3],
      [WizardGenerationActionType.CLOSE_ACCEPT, 3, undefined],
    ];
    const res = await axios.get(
      `${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`,
    );
    expect(res.data.feedbacks.length).equals(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const evt: PlaybookGenerationActionEvent =
        res.data.feedbacks[i].playbookGenerationAction;
      expect(evt.action).equals(expected[i][0]);
      expect(evt.fromPage).equals(expected[i][1]);
      expect(evt.toPage).equals(expected[i][2]);
    }
  });

  it("Playbook generation (outline reset, cancel)", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    await setupPage1();
    await gotoPage2();

    // Verify outline output and text edit
    let outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    expect(outlineList, "An ordered list should exist.").to.be.not.undefined;
    let text = await outlineList.getText();
    expect(text.includes("Create virtual network peering")).to.be.true;

    // Test Reset button
    await outlineList.sendKeys("# COMMENT\n");
    text = await outlineList.getText();
    expect(text.includes("# COMMENT\n"));

    let resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );
    expect(resetButton, "resetButton should not be undefined").not.to.be
      .undefined;
    expect(await resetButton.isEnabled(), "reset button should be enabled now")
      .to.be.true;

    await resetButton.click();
    await sleep(500);

    // Cancel reset of Outline
    await webView.switchBack();
    const resetOutlineDialog = new ModalDialog();
    await resetOutlineDialog.pushButton("Cancel");
    await sleep(250);
    // Sadly we need to switch context and so we must reload the WebView elements
    webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );
    outlineList = await webView.findWebElement(
      By.xpath("//ol[@id='outline-list']"),
    );
    resetButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='reset-button']"),
    );

    text = await outlineList.getText();
    expect(text.includes("# COMMENT\n"));
    expect(await resetButton.isEnabled(), "reset button should be enabled now")
      .to.be.true;

    await workbenchExecuteCommand("View: Close All Editor Groups");
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
