// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  By,
  VSBrowser,
  EditorView,
  WebView,
  Key,
} from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
  waitForCondition,
} from "./uiTestHelper";
import { WizardGenerationActionType } from "../../src/definitions/lightspeed";
import { PlaybookGenerationActionEvent } from "../../src/interfaces/lightspeed";

config.truncateThreshold = 0;

before(function () {
  if (process.platform === "darwin") {
    this.skip();
  }
});

describe("Verify playbook generation features work as expected", function () {
  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
  });

  it("Playbook generation webview works as expected (full path) - part 2", async function () {
    // just to cleanup any previous feedbacks that might pollute the test
    await fetch(`${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`, {
      method: "GET",
    });

    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");

    // Start operations on Playbook Generation UI
    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    const promptTextField = await webView.findWebElement(
      By.xpath('//*[@id="PromptTextField"]/input'),
    );
    await promptTextField.sendKeys("Create an azure network.");
    await promptTextField.sendKeys(Key.ESCAPE);
    await promptTextField.click();

    const analyzeButton = await webView.findWebElement(
      By.xpath("//vscode-button[contains(text(), 'Analyze')]"),
    );
    await analyzeButton.click();

    const generateButton = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath("//vscode-button[contains(text(), 'Continue')]"),
        );
      },
      message: "Timed out waiting for Continue button",
    });
    await generateButton.click();

    // Click Open editor button to open the generated playbook in the editor
    const openEditorButton = await waitForCondition({
      condition: async () => {
        return await webView.findWebElement(
          By.xpath("//vscode-button[contains(text(), 'Open editor')]"),
        );
      },
      message: "Timed out waiting for Open editor button",
    });
    expect(openEditorButton, "openEditorButton should not be undefined").not.to
      .be.undefined;
    await openEditorButton.click();
    // This is a bit of a tricky sleep to remove.  What we're really waiting for here is
    // for all the feedback events to be present on the mock server response.  We could
    // wrap the fetch call below in a waitForCondition but it feels a bit hacky.
    await sleep(2000);
    await webView.switchBack();

    /* verify generated events */
    const expected = [
      [WizardGenerationActionType.OPEN, undefined, 1],
      [WizardGenerationActionType.TRANSITION, 1, 2],
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

  it("Playbook explanation webview works as expected", async function () {
    this.timeout(60000); // Set timeout to 60 seconds for this test

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

    // Locate the playbook explanation webview
    let webView = (await new EditorView().openEditor(
      "Explanation",
      1,
    )) as WebView;
    expect(webView, "webView should not be undefined").not.to.be.undefined;
    webView = await getWebviewByLocator(
      By.xpath("//div[@class='explanation']"),
    );
    await webView.findWebElement(
      By.xpath("//h2[contains(text(), 'Playbook Overview and Structure')]"),
    );

    await webView.switchBack();
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});
