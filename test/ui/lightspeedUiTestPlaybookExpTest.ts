// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  By,
  VSBrowser,
  EditorView,
  WebView,
  Workbench,
} from "vscode-extension-tester";
import {
  getFixturePath,
  getWebviewByLocator,
  workbenchExecuteCommand,
  waitForCondition,
} from "./uiTestHelper";

config.truncateThreshold = 0;

async function testThumbsButtonInteraction(buttonToClick: string) {
  const folder = "lightspeed";
  const filePath = getFixturePath(folder, "playbook_1.yml");

  // Open file in the editor
  await VSBrowser.instance.openResources(filePath);

  // This won't work on MacOS, see: https://github.com/redhat-developer/vscode-extension-tester/issues/1875
  if (process.platform !== "darwin") {
    const editorView = new EditorView();
    const editor = await editorView.openEditor("playbook_1.yml");
    const contextMenu = await editor.openContextMenu();

    const hasExplainRoleMenuItem = await contextMenu.hasItem(
      "Explain the role with Ansible Lightspeed",
    );
    expect(
      hasExplainRoleMenuItem,
      '"Explain the role with Ansible Lightspeed" should not be present in the context menu',
    ).not.to.be.true;

    const hasExplainPlaybookMenuItem = await contextMenu.hasItem(
      "Explain the playbook with Ansible Lightspeed",
    );
    expect(
      hasExplainPlaybookMenuItem,
      '"Explain the playbook with Ansible Lightspeed" should be present in the context menu',
    ).to.be.true;

    await contextMenu.close();
  }

  // Open playbook explanation webview.
  await workbenchExecuteCommand("Explain the playbook with Ansible Lightspeed");

  await new EditorView().openEditor("Explanation", 1);
  // Locate the playbook explanation webview
  const webView = await getWebviewByLocator(
    By.xpath("//div[contains(@class, 'explanation') ]"),
  );

  expect(webView, "webView should not be undefined").not.to.be.undefined;

  const thumbsUpButton = await webView.findWebElement(
    By.xpath("//vscode-button[@id='thumbsup-button']"),
  );
  expect(thumbsUpButton, "thumbsUpButton should not be undefined").not.to.be
    .undefined;

  const thumbsDownButton = await webView.findWebElement(
    By.xpath("//vscode-button[@id='thumbsdown-button']"),
  );
  expect(thumbsDownButton, "thumbsDownButton should not be undefined").not.to.be
    .undefined;

  expect(
    await thumbsUpButton.isEnabled(),
    `Thumbs up button should be enabled now`,
  ).to.be.true;

  expect(
    await thumbsDownButton.isEnabled(),
    `Thumbs down button should be enabled now`,
  ).to.be.true;

  const button =
    buttonToClick === "thumbsup" ? thumbsUpButton : thumbsDownButton;
  await button.click();

  await waitForCondition({
    condition: async () => {
      const thumbsUpDisabled = await thumbsUpButton.getAttribute("disabled");
      const thumbsDownDisabled =
        await thumbsDownButton.getAttribute("disabled");
      return thumbsUpDisabled === "true" && thumbsDownDisabled === "true";
    },
  });

  await webView.switchBack();
  await workbenchExecuteCommand("View: Close All Editor Groups");
}

describe(__filename, function () {
  describe("playbook explanation features work", function () {
    beforeEach(function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }
    });

    afterEach(async function () {
      const workbench = new Workbench();
      workbench.getNotifications().then((notifications) => {
        notifications.forEach(async (notification) => {
          await notification.dismiss();
        });
      });
    });

    it.skip("Playbook explanation webview with a playbook with no tasks https://github.com/ansible/vscode-ansible/issues/2235", async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }

      const folder = "lightspeed";
      const file = "playbook_5.yml";
      const filePath = getFixturePath(folder, file);

      // Open file in the editor
      await VSBrowser.instance.openResources(filePath);

      // Open playbook explanation webview.
      await workbenchExecuteCommand(
        "Explain the playbook with Ansible Lightspeed",
      );

      await new EditorView().openEditor("Explanation", 1);
      // Locate the playbook explanation webview
      const webView = await getWebviewByLocator(
        By.xpath("//div[contains(@class, 'explanation') ]"),
      );
      // Find the main div element of the webview and verify the expected text is found.
      const mainDiv = await webView.findWebElement(
        By.xpath("//div[contains(@class, 'explanation') ]"),
      );
      expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
      const text = await mainDiv.getText();
      expect(
        text.includes(
          "Explaining a playbook with no tasks in the playbook is not supported.",
        ),
      ).to.be.true;

      await webView.switchBack();
      await workbenchExecuteCommand("View: Close All Editor Groups");
    });

    it.skip("Playbook explanation thumbs up/down button disabled after thumbs up https://github.com/ansible/vscode-ansible/issues/2235", async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }
      await testThumbsButtonInteraction("thumbsup");
    });

    it.skip("Playbook explanation thumbs up/down button disabled after thumbs down https://github.com/ansible/vscode-ansible/issues/2235", async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }
      await testThumbsButtonInteraction("thumbsdown");
    });
  });

  describe("Feedback webview provider works", function () {
    let editorView: EditorView;

    before(async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        return;
      }
      await workbenchExecuteCommand("View: Close All Editor Groups");
      editorView = new EditorView();
      expect(editorView).not.to.be.undefined;
    });

    it("Open Feedback webview", async function () {
      // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
      await workbenchExecuteCommand("Ansible Lightspeed: Feedback");
      // Locate the playbook explanation webview
      const webView = (await editorView.openEditor(
        "Ansible Lightspeed Feedback",
      )) as WebView;
      expect(webView, "webView should not be undefined").not.to.be.undefined;
      // Issuing the Lightspeed feedback command should not open a new tab
      await workbenchExecuteCommand("Ansible Lightspeed: Feedback");

      await waitForCondition({
        condition: async () => {
          const titles = await editorView.getOpenEditorTitles();
          return titles.length === 1;
        },
        message: "Timed out waiting for editor title length to be 1",
      });

      await workbenchExecuteCommand("View: Close All Editor Groups");
    });
  });
});
