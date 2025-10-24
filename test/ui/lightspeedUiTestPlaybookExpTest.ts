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
  sleep,
} from "./uiTestHelper";

config.truncateThreshold = 0;

async function testThumbsButtonInteraction(buttonToClick: string) {
  const folder = "lightspeed";
  const filePath = getFixturePath(folder, "playbook_1.yml");

  // Open file in the editor
  await VSBrowser.instance.openResources(filePath);

  // Wait a moment for the file to be fully loaded
  await sleep(1000);

  // This won't work on MacOS, see: https://github.com/redhat-developer/vscode-extension-tester/issues/1875
  if (process.platform !== "darwin") {
    const editorView = new EditorView();

    // Wait for editor to be available and get the active editor
    await waitForCondition({
      condition: async () => {
        try {
          const openTitles = await editorView.getOpenEditorTitles();
          return openTitles.includes("playbook_1.yml");
        } catch {
          return false;
        }
      },
      message: "Timed out waiting for playbook_1.yml editor to be available",
      timeout: 10000,
    });

    // Get the editor group and find the editor
    const editorGroup = await editorView.getEditorGroup(0);

    // Wait for the editor to be available in the group
    await waitForCondition({
      condition: async () => {
        try {
          const editor = await editorGroup.getTabByTitle("playbook_1.yml");
          return editor !== undefined;
        } catch {
          return false;
        }
      },
      message:
        "Timed out waiting for playbook_1.yml editor tab to be available",
      timeout: 10000,
    });

    const editor = await editorGroup.getTabByTitle("playbook_1.yml");

    if (editor) {
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
  }

  // Open playbook explanation webview.
  await workbenchExecuteCommand("Explain the playbook with Ansible Lightspeed");

  // Wait for the Explanation webview to be available
  await waitForCondition({
    condition: async () => {
      try {
        const editorView = new EditorView();
        const openTitles = await editorView.getOpenEditorTitles();
        return openTitles.includes("Explanation");
      } catch {
        return false;
      }
    },
    message: "Timed out waiting for Explanation webview to be available",
    timeout: 10000,
  });

  // Get the editor group and find the Explanation editor
  const editorView = new EditorView();
  const editorGroup = await editorView.getEditorGroup(0);

  // Wait for the Explanation editor to be available in the group
  await waitForCondition({
    condition: async () => {
      try {
        const explanationEditor =
          await editorGroup.getTabByTitle("Explanation");
        return explanationEditor !== undefined;
      } catch {
        return false;
      }
    },
    message: "Timed out waiting for Explanation editor tab to be available",
    timeout: 10000,
  });

  const explanationEditor = await editorGroup.getTabByTitle("Explanation");

  if (!explanationEditor) {
    throw new Error("Could not find Explanation editor tab");
  }
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

    it("Playbook explanation webview with a playbook with no tasks", async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }

      const folder = "lightspeed";
      const file = "playbook_5.yml";
      const filePath = getFixturePath(folder, file);

      // Open file in the editor
      await VSBrowser.instance.openResources(filePath);

      // Wait a moment for the file to be fully loaded
      await sleep(1000);

      // Open playbook explanation webview.
      await workbenchExecuteCommand(
        "Explain the playbook with Ansible Lightspeed",
      );

      // Wait for the Explanation webview to be available
      await waitForCondition({
        condition: async () => {
          try {
            const editorView = new EditorView();
            const openTitles = await editorView.getOpenEditorTitles();
            return openTitles.includes("Explanation");
          } catch {
            return false;
          }
        },
        message: "Timed out waiting for Explanation webview to be available",
        timeout: 10000,
      });

      // Get the editor group and find the Explanation editor
      const editorView = new EditorView();
      const editorGroup = await editorView.getEditorGroup(0);

      // Wait for the Explanation editor to be available in the group
      await waitForCondition({
        condition: async () => {
          try {
            const explanationEditor =
              await editorGroup.getTabByTitle("Explanation");
            return explanationEditor !== undefined;
          } catch {
            return false;
          }
        },
        message: "Timed out waiting for Explanation editor tab to be available",
        timeout: 10000,
      });

      const explanationEditor = await editorGroup.getTabByTitle("Explanation");

      if (!explanationEditor) {
        throw new Error("Could not find Explanation editor tab");
      }
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

    it("Playbook explanation thumbs up/down button disabled after thumbs up", async function () {
      if (!process.env.TEST_LIGHTSPEED_URL) {
        this.skip();
      }
      await testThumbsButtonInteraction("thumbsup");
    });

    it("Playbook explanation thumbs up/down button disabled after thumbs down", async function () {
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

      // Wait for the Feedback webview to be available
      await waitForCondition({
        condition: async () => {
          const openTitles = await editorView.getOpenEditorTitles();
          return openTitles.includes("Ansible Lightspeed Feedback");
        },
        message:
          "Timed out waiting for Ansible Lightspeed Feedback webview to be available",
        timeout: 10000,
      });

      // Get the editor group and find the Feedback editor
      const editorGroup = await editorView.getEditorGroup(0);
      const feedbackEditor = await editorGroup.getTabByTitle(
        "Ansible Lightspeed Feedback",
      );

      if (!feedbackEditor) {
        throw new Error(
          "Could not find Ansible Lightspeed Feedback editor tab",
        );
      }

      // Locate the playbook explanation webview
      const webView = feedbackEditor as unknown as WebView;
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
