import { expect, config } from "chai";
import axios from "axios";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  Workbench,
  StatusBar,
  VSBrowser,
  EditorView,
  SettingsEditor,
  WebView,
  ModalDialog,
  WebviewView,
  WebElement,
} from "vscode-extension-tester";
import {
  expectNotification,
  getFixturePath,
  sleep,
  updateSettings,
} from "./uiTestHelper";
import { PlaybookGenerationActionType } from "../../src/definitions/lightspeed";
import { PlaybookGenerationActionEvent } from "../../src/interfaces/lightspeed";

config.truncateThreshold = 0;
export function lightspeedUIAssetsTest(): void {
  describe("Verify the presence of lightspeed login button in the activity bar", () => {
    let workbench: Workbench;
    let view: ViewControl;
    let sideBar: SideBarView;
    let webviewView: InstanceType<typeof WebviewView>;

    before(async function () {
      workbench = new Workbench();
      const settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);

      view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
      sideBar = await view.openView();

      await sideBar.getContent().getSection("Ansible Lightspeed");

      await workbench.executeCommand(
        "Ansible: Focus on Ansible Lightspeed View",
      );
      webviewView = new WebviewView();
      expect(webviewView).not.undefined;
      await webviewView.switchToFrame(1000);
    });

    after(async function () {
      if (webviewView) {
        await webviewView.switchBack();
      }
      const settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", false);
    });

    it("Ansible Lightspeed welcome message is present", async function () {
      const body = await webviewView.findWebElement(By.xpath("//body"));
      const welcomeMessage = await body.getText();
      expect(welcomeMessage).to.contain(
        "Experience smarter automation using Ansible Lightspeed",
      );
    });

    it("Ansible Lightspeed login button is present", async function () {
      const loginButton = await webviewView.findWebElement(
        By.xpath("//vscode-button[text()='Connect']"),
      );
      expect(loginButton).not.undefined;
    });
  });

  describe("Verify the presence of lightspeed element in the status bar and the explorer view", () => {
    let statusBar: StatusBar;
    let settingsEditor: SettingsEditor;
    let editorView: EditorView;
    let workbench: Workbench;
    const folder = "lightspeed";
    const file = "playbook_1.yml";
    const filePath = getFixturePath(folder, file);

    before(async function () {
      statusBar = new StatusBar();
      editorView = new EditorView();
      workbench = new Workbench();

      // open file in the editor
      await VSBrowser.instance.openResources(filePath);
    });

    it("Ansible Lightspeed status bar item absent when settings not enabled", async function () {
      await editorView.openEditor(file);

      // The following lines replaced the original code that was using StatusBar.getItem() API.
      const items = await statusBar.findElements(
        By.xpath(
          "//div[contains(@class, 'statusbar-item') and " +
            ".//a/text()='Lightspeed (not logged in))']",
        ),
      );
      expect(items.length).equals(0);
    });

    it("Connect button exists in Lightspeed explorer view when settings not enabled", async function () {
      await new Workbench().executeCommand(
        "Ansible: Focus on Ansible Lightspeed View",
      );
      await sleep(3000);
      const explorerView = new WebviewView();
      expect(explorerView, "contentCreatorWebView should not be undefined").not
        .to.be.undefined;
      await explorerView.switchToFrame(5000);
      const connectButton = await explorerView.findWebElement(
        By.id("lightspeed-explorer-connect"),
      );
      expect(connectButton).not.to.be.undefined;
      await explorerView.switchBack();
    });

    it("Ansible Lightspeed status bar item present when only lightspeed is enabled (with warning color)", async () => {
      settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
      await editorView.openEditor(file);

      // The following lines replaced the original code that was using StatusBar.getItem() API.
      const lightspeedStatusBarItem = await statusBar.findElement(
        By.xpath(
          "//div[contains(@class, 'statusbar-item') and " +
            "contains(@class, 'has-background-color') and " +
            "contains(@class, 'warning-kind') and " +
            ".//a/text()='Lightspeed (Not logged in)']",
        ),
      );
      expect(lightspeedStatusBarItem).not.to.be.undefined;
    });

    it("Ansible Lightspeed status bar item present when lightspeed and lightspeed suggestions are enabled (with normal color)", async () => {
      settingsEditor = await workbench.openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.lightspeed.suggestions.enabled",
        true,
      );
      await editorView.openEditor(file);

      // The following lines replaced the original code that was using StatusBar.getItem() API.
      const lightspeedStatusBarItem = await statusBar.findElement(
        By.xpath(
          "//div[contains(@class, 'statusbar-item') and " +
            "not (contains(@class, 'has-background-color')) and " +
            ".//a/text()='Lightspeed (Not logged in)']",
        ),
      );
      expect(lightspeedStatusBarItem).not.to.be.undefined;
    });
  });

  describe("Verify playbook generation and explanation features work as expected", function () {
    let workbench: Workbench;
    let settingsEditor: SettingsEditor;
    let webView: WebView;
    let outlineList: WebElement;
    let resetButton: WebElement;

    before(async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        workbench = new Workbench();
        settingsEditor = await workbench.openSettings();
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.enabled",
          true,
        );
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.URL",
          process.env.TEST_LIGHTSPEED_URL,
        );
        // await workbench.executeCommand(
        //   "Ansible Lightspeed: Enable experimental features",
        // );
        await workbench.executeCommand("View: Close All Editor Groups");

        const notifications = await workbench.getNotifications();
        for (let i = 0; i < notifications.length; i++) {
          const n = notifications[i];
          await n.dismiss();
        }
      }
    });

    it("Playbook generation webview works as expected (full path) - part 1", async function () {
      // Open Ansible Content Creator by clicking the Getting started button on the side bar
      const view = (await new ActivityBar().getViewControl(
        "Ansible",
      )) as ViewControl;
      const sideBar = await view.openView();

      const getStartedButton = await sideBar.findElement(
        By.xpath(
          "//a[contains(@class, 'monaco-button') and " +
            ".//span/text()='Get started']",
        ),
      );
      expect(getStartedButton).not.to.be.undefined;
      if (getStartedButton) {
        await getStartedButton.click();
      }
      await sleep(5000);

      // Open Playbook Generation UI by clicking the create content button on Ansible Content Creator
      const contentCreatorWebView = await new WebView();
      expect(
        contentCreatorWebView,
        "contentCreatorWebView should not be undefined",
      ).not.to.be.undefined;
      await contentCreatorWebView.switchToFrame(5000);
      expect(
        contentCreatorWebView,
        "contentCreatorWebView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

      const createContentButton = await contentCreatorWebView.findWebElement(
        By.xpath(
          "//a[contains(@href,'command:ansible.lightspeed.playbookGeneration')]",
        ),
      );
      expect(createContentButton).not.to.be.undefined;
      if (createContentButton) {
        await createContentButton.click();
      }
      await contentCreatorWebView.switchBack();
      await new EditorView().closeEditor("Ansible content creator");
      await sleep(2000);

      // Start operations on Playbook Generation UI
      webView = await new WebView();
      expect(webView, "webView should not be undefined").not.to.be.undefined;
      await webView.switchToFrame(5000);
      expect(
        webView,
        "webView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

      // Set input text and invoke summaries API
      const textArea = await webView.findWebElement(
        By.xpath("//vscode-text-area"),
      );
      expect(textArea, "textArea should not be undefined").not.to.be.undefined;
      const submitButton = await webView.findWebElement(
        By.xpath("//vscode-button[@id='submit-button']"),
      );
      expect(submitButton, "submitButton should not be undefined").not.to.be
        .undefined;
      //
      // Note: Following line should succeed, but fails for some unknown reasons.
      //
      // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
      await textArea.sendKeys("Create an azure network.");
      expect(
        await submitButton.isEnabled(),
        "submit button should be enabled now",
      ).to.be.true;
      await submitButton.click();
      await sleep(2000);

      // Verify outline output and text edit
      outlineList = await webView.findWebElement(
        By.xpath("//ol[@id='outline-list']"),
      );
      expect(outlineList, "An ordered list should exist.");
      let text = await outlineList.getText();
      expect(
        text.includes("Create virtual network peering"),
        "Text should include the expected outline",
      );
      await outlineList.sendKeys("# COMMENT\n");
      text = await outlineList.getText();
      expect(text.includes("# COMMENT\n"));

      // Verify the prompt is displayed as a static text
      const prompt = await webView.findWebElement(
        By.xpath("//span[@id='prompt']"),
      );
      text = await prompt.getText();
      expect(text.includes("Create an azure network."));

      // Test Reset button
      resetButton = await webView.findWebElement(
        By.xpath("//vscode-button[@id='reset-button']"),
      );
      expect(resetButton, "resetButton should not be undefined").not.to.be
        .undefined;
      await resetButton.click();
      await sleep(500);
      text = await outlineList.getText();
      expect(!text.includes("# COMMENT\n"));

      // Test Back button
      const backButton = await webView.findWebElement(
        By.xpath("//vscode-button[@id='back-button']"),
      );
      expect(backButton, "backButton should not be undefined").not.to.be
        .undefined;
      await backButton.click();
      await sleep(500);

      text = await textArea.getText();
      expect(text.startsWith("Create an azure network."));
      await submitButton.click();
      await sleep(1000);
      text = await outlineList.getText();
      expect(text.includes("Create virtual network peering"));

      // Test Edit link next to the prompt text
      const backAnchor = await webView.findWebElement(
        By.xpath("//a[@id='back-anchor']"),
      );
      expect(backAnchor, "backAnchor should not be undefined").not.to.be
        .undefined;
      await backAnchor.click();
      await sleep(500);

      text = await textArea.getText();
      expect(text.startsWith("Create an azure network."));
      await submitButton.click();
      await sleep(1000);
      text = await outlineList.getText();
      expect(text.includes("Create virtual network peering"));
    });

    it("Playbook generation webview works as expected (full path) - part 2", async function () {
      // Click Generate playbook button to invoke the generations API
      const generatePlaybookButton = await webView.findWebElement(
        By.xpath("//vscode-button[@id='generate-button']"),
      );
      expect(
        generatePlaybookButton,
        "generatePlaybookButton should not be undefined",
      ).not.to.be.undefined;

      // Input "(status=400)" to simulate an API error
      await outlineList.sendKeys("(status=400)");
      let text = await outlineList.getText();
      expect(text.includes("(status=400)"));
      await generatePlaybookButton.click(); // Click Generate Playbook button

      await webView.switchBack();
      await sleep(2000);
      await expectNotification("Bad Request response. Please try again.");
      await webView.switchToFrame(5000);

      // Click reset button and make sure the string "(status=400)" is removed
      await resetButton.click();
      await sleep(500);
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
      expect(openEditorButton, "openEditorButton should not be undefined").not
        .to.be.undefined;
      await openEditorButton.click();
      await sleep(2000);
      await webView.switchBack();

      // Verify a playbook was generated.
      const editor = await new EditorView().openEditor("Untitled-1");
      text = await editor.getText();
      expect(
        text.startsWith("---"),
        'The generated playbook should start with "---"',
      ).to.be.true;

      await workbench.executeCommand("View: Close All Editor Groups");
      const dialog = new ModalDialog();
      await dialog.pushButton(`Don't Save`);

      /* verify generated events */
      const expected = [
        [PlaybookGenerationActionType.OPEN, undefined, 1],
        [PlaybookGenerationActionType.TRANSITION, 1, 2],
        [PlaybookGenerationActionType.TRANSITION, 2, 1],
        [PlaybookGenerationActionType.TRANSITION, 1, 2],
        [PlaybookGenerationActionType.TRANSITION, 2, 1],
        [PlaybookGenerationActionType.TRANSITION, 1, 2],
        [PlaybookGenerationActionType.TRANSITION, 2, 3],
        [PlaybookGenerationActionType.TRANSITION, 3, 2],
        [PlaybookGenerationActionType.TRANSITION, 2, 3],
        [PlaybookGenerationActionType.TRANSITION, 3, 2],
        [PlaybookGenerationActionType.TRANSITION, 2, 3],
        [PlaybookGenerationActionType.CLOSE_ACCEPT, 3, undefined],
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

    it("Playbook generation webview works as expected (fast path)", async function () {
      // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
      if (process.env.TEST_LIGHTSPEED_URL) {
        // Open playbook generation webview.
        await workbench.executeCommand(
          "Ansible Lightspeed: Playbook generation",
        );
        await sleep(2000);
        const webView = await new WebView();
        expect(webView, "webView should not be undefined").not.to.be.undefined;
        await webView.switchToFrame(5000);
        expect(
          webView,
          "webView should not be undefined after switching to its frame",
        ).not.to.be.undefined;

        // Set input text and invoke summaries API
        const textArea = await webView.findWebElement(
          By.xpath("//vscode-text-area"),
        );
        expect(textArea, "textArea should not be undefined").not.to.be
          .undefined;
        const submitButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='submit-button']"),
        );
        expect(submitButton, "submitButton should not be undefined").not.to.be
          .undefined;
        //
        // Note: Following line should succeed, but fails for some unknown reasons.
        //
        // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
        await textArea.sendKeys("Create an azure network.");
        expect(
          await submitButton.isEnabled(),
          "submit button should be enabled now",
        ).to.be.true;
        await submitButton.click();
        await sleep(1000);

        // Verify outline output and text edit
        const outlineList = await webView.findWebElement(
          By.xpath("//ol[@id='outline-list']"),
        );
        expect(outlineList, "An ordered list should exist.").to.be.not
          .undefined;
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

        // Make sure the playbook was generated within 500 msecs, which is the fake latency
        // used in the mock server. It means that the playbook returned in the outline generation
        // was used and the generations API was not called this time.
        const elapsedTime = new Date().getTime() - start;
        expect(elapsedTime < 500).to.be.true;

        // Click Open editor button to open the generated playbook in the editor
        const openEditorButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='open-editor-button']"),
        );
        expect(openEditorButton, "openEditorButton should not be undefined").not
          .to.be.undefined;
        await openEditorButton.click();
        await sleep(500);
        await webView.switchBack();

        const editor = await new EditorView().openEditor("Untitled-1");
        text = await editor.getText();
        expect(
          text.startsWith("---"),
          'The generated playbook should start with "---"',
        ).to.be.true;

        await workbench.executeCommand("View: Close All Editor Groups");
        const dialog = new ModalDialog();
        await dialog.pushButton(`Don't Save`);

        /* verify generated events */
        const expected = [
          [PlaybookGenerationActionType.OPEN, undefined, 1],
          [PlaybookGenerationActionType.TRANSITION, 1, 2],
          [PlaybookGenerationActionType.TRANSITION, 2, 3],
          [PlaybookGenerationActionType.CLOSE_ACCEPT, 3, undefined],
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
      } else {
        this.skip();
      }
    });

    it("Playbook generation webview works as expected (feature unavailable)", async function () {
      // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
      if (process.env.TEST_LIGHTSPEED_URL) {
        // Open playbook generation webview.
        await workbench.executeCommand(
          "Ansible Lightspeed: Playbook generation",
        );
        await sleep(2000);
        const webView = await new WebView();
        expect(webView, "webView should not be undefined").not.to.be.undefined;
        await webView.switchToFrame(5000);
        expect(
          webView,
          "webView should not be undefined after switching to its frame",
        ).not.to.be.undefined;

        // Set input text and invoke summaries API
        const textArea = await webView.findWebElement(
          By.xpath("//vscode-text-area"),
        );
        expect(textArea, "textArea should not be undefined").not.to.be
          .undefined;
        const submitButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='submit-button']"),
        );
        expect(submitButton, "submitButton should not be undefined").not.to.be
          .undefined;
        //
        // Note: Following line should succeed, but fails for some unknown reasons.
        //
        // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
        await textArea.sendKeys("Feature not available");
        expect(
          await submitButton.isEnabled(),
          "submit button should be enabled now",
        ).to.be.true;
        await submitButton.click();
        await sleep(2000);

        await webView.switchBack();

        const notifications = await workbench.getNotifications();
        const notification = notifications[0];
        expect(await notification.getMessage()).equals(
          "The requested action is not available in your environment.",
        );
      } else {
        this.skip();
      }
    });

    it("Playbook explanation webview works as expected", async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        const folder = "lightspeed";
        const file = "playbook_4.yml";
        const filePath = getFixturePath(folder, file);

        // Open file in the editor
        await VSBrowser.instance.openResources(filePath);

        // Open playbook explanation webview.
        await workbench.executeCommand(
          "Explain the playbook with Ansible Lightspeed",
        );
        await sleep(2000);

        // Locate the playbook explanation webview
        const webView = (await new EditorView().openEditor(
          "Explanation",
          1,
        )) as WebView;
        expect(webView, "webView should not be undefined").not.to.be.undefined;
        await webView.switchToFrame(5000);
        expect(
          webView,
          "webView should not be undefined after switching to its frame",
        ).not.to.be.undefined;

        // Find the main div element of the webview and verify the expected text is found.
        const mainDiv = await webView.findWebElement(
          By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
        );
        expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
        const text = await mainDiv.getText();
        expect(text.includes("Playbook Overview and Structure")).to.be.true;

        await webView.switchBack();
        await workbench.executeCommand("View: Close All Editor Groups");
      } else {
        this.skip();
      }
    });

    it("Playbook explanation webview works as expected (feature unavailable)", async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        const folder = "lightspeed";
        const file = "playbook_explanation_feature_unavailable.yml";
        const filePath = getFixturePath(folder, file);

        // Open file in the editor
        await VSBrowser.instance.openResources(filePath);

        // Open playbook explanation webview.
        await workbench.executeCommand(
          "Explain the playbook with Ansible Lightspeed",
        );
        await sleep(2000);

        // Locate the group 1 of editor view. Since the file does not contain the "hosts" property,
        // the explanation view is not opened in the group 1. Therefore, the group 1 should be
        // undefined.
        const group = await new EditorView().getEditorGroup(1);
        expect(group, "Group 1 of the editor view should be undefined").to.be
          .undefined;

        await workbench.executeCommand("View: Close All Editor Groups");
      } else {
        this.skip();
      }
    });

    it("Playbook explanation webview with a playbook with no tasks", async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        const folder = "lightspeed";
        const file = "playbook_5.yml";
        const filePath = getFixturePath(folder, file);

        // Open file in the editor
        await VSBrowser.instance.openResources(filePath);

        // Open playbook explanation webview.
        await workbench.executeCommand(
          "Explain the playbook with Ansible Lightspeed",
        );
        await sleep(2000);

        // Locate the playbook explanation webview
        const webView = (await new EditorView().openEditor(
          "Explanation",
          1,
        )) as WebView;
        expect(webView, "webView should not be undefined").not.to.be.undefined;
        await webView.switchToFrame(5000);
        expect(
          webView,
          "webView should not be undefined after switching to its frame",
        ).not.to.be.undefined;

        // Find the main div element of the webview and verify the expected text is found.
        const mainDiv = await webView.findWebElement(
          By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
        );
        expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
        const text = await mainDiv.getText();
        expect(
          text.includes(
            "Explaining a playbook with no tasks in the playbook is not supported.",
          ),
        ).to.be.true;

        await webView.switchBack();
        await workbench.executeCommand("View: Close All Editor Groups");
      } else {
        this.skip();
      }
    });

    after(async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        settingsEditor = await workbench.openSettings();
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.enabled",
          false,
        );
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.URL",
          "https://c.ai.ansible.redhat.com",
        );
      }
    });
  });

  describe("Verify playbook generation page is not opened when Lightspeed is not enabled", function () {
    let workbench: Workbench;

    before(async function () {
      workbench = new Workbench();
      // await workbench.executeCommand(
      //   "Ansible Lightspeed: Enable experimental features",
      // );
      await workbench.executeCommand("View: Close All Editor Groups");
    });

    it("Playbook generation command shows an error message when Lightspeed is not enabled", async function () {
      // Open playbook generation webview.
      await workbench.executeCommand("Ansible Lightspeed: Playbook generation");
      await sleep(2000);
      const notifications = await new Workbench().getNotifications();
      const notification = notifications[0];
      expect(await notification.getMessage()).equals(
        "Enable lightspeed services from settings to use the feature.",
      );
    });
  });

  describe("Feedback webview provider works as expected", function () {
    let workbench: Workbench;
    let editorView: EditorView;
    let settingsEditor: SettingsEditor;

    before(async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        workbench = new Workbench();
        settingsEditor = await workbench.openSettings();
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.enabled",
          true,
        );
        await workbench.executeCommand("View: Close All Editor Groups");
        editorView = new EditorView();
        expect(editorView).not.to.be.undefined;
      }
    });

    it("Open Feedback webview", async function () {
      // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
      if (process.env.TEST_LIGHTSPEED_URL) {
        await workbench.executeCommand("Ansible Lightspeed: Feedback");
        await sleep(2000);
        // Locate the playbook explanation webview
        const webView = (await editorView.openEditor(
          "Ansible Lightspeed Feedback",
        )) as WebView;
        expect(webView, "webView should not be undefined").not.to.be.undefined;
        // Issuing the Lightspeed feedback command should not open a new tab
        await workbench.executeCommand("Ansible Lightspeed: Feedback");
        await sleep(2000);
        const titles = await editorView.getOpenEditorTitles();
        expect(titles.length).equals(1);
        await workbench.executeCommand("View: Close All Editor Groups");
      }
    });
  });
}
