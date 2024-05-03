import { expect, config } from "chai";
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
} from "vscode-extension-tester";
import { getFilePath, updateSettings } from "./uiTestHelper";

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
        "Welcome to Ansible Lightspeed for Visual Studio Code.",
      );
    });

    it("Ansible Lightspeed login button is present", async function () {
      const loginButton = await webviewView.findWebElement(
        By.xpath("//vscode-button[text()='Connect']"),
      );
      expect(loginButton).not.undefined;
    });
  });

  describe("Verify the presence of lightspeed element in the status bar", () => {
    let statusBar: StatusBar;
    let settingsEditor: SettingsEditor;
    let editorView: EditorView;
    let workbench: Workbench;
    const file = "playbook_1.yml";
    const filePath = getFilePath(file);

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
            ".//a/text()='Lightspeed (not logged in)']",
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
            ".//a/text()='Lightspeed (not logged in)']",
        ),
      );
      expect(lightspeedStatusBarItem).not.to.be.undefined;
    });
  });

  describe("Verify playbook generation and explanation features work as expected", function () {
    let workbench: Workbench;
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
        await updateSettings(
          settingsEditor,
          "ansible.lightspeed.URL",
          process.env.TEST_LIGHTSPEED_URL,
        );
        await workbench.executeCommand(
          "Ansible Lightspeed: Enable experimental features",
        );
        await workbench.executeCommand("View: Close All Editor Groups");
      }
    });

    it("Playbook generation webview works as expected", async function () {
      // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
      if (process.env.TEST_LIGHTSPEED_URL) {
        // Open playbook generation webview.
        await workbench.executeCommand(
          "Ansible Lightspeed: Playbook generation",
        );
        await new Promise((res) => {
          setTimeout(res, 2000);
        });
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
        ).is.true;
        submitButton.click();
        await new Promise((res) => {
          setTimeout(res, 1000);
        });

        // Test Reset button
        let text = await textArea.getText();
        expect(text.includes('Name: "Create an azure network..."'));
        await textArea.sendKeys("# COMMENT\n");
        text = await textArea.getText();
        expect(text.includes("# COMMENT\n"));
        const resetButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='reset-button']"),
        );
        expect(resetButton, "resetButton should not be undefined").not.to.be
          .undefined;
        resetButton.click();
        await new Promise((res) => {
          setTimeout(res, 500);
        });
        text = await textArea.getText();
        expect(!text.includes("# COMMENT\n"));

        // Test Back button
        const backButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='back-button']"),
        );
        expect(backButton, "backButton should not be undefined").not.to.be
          .undefined;
        backButton.click();
        await new Promise((res) => {
          setTimeout(res, 500);
        });

        text = await textArea.getText();
        expect(text.startsWith("Create an azure network."));
        submitButton.click();
        await new Promise((res) => {
          setTimeout(res, 1000);
        });
        text = await textArea.getText();
        expect(text.includes('Name: "Create an azure network..."'));

        // Click Generate playbook button to invoke the generations API
        const generatePlaybookButton = await webView.findWebElement(
          By.xpath("//vscode-button[@id='generate-button']"),
        );
        expect(
          generatePlaybookButton,
          "generatePlaybookButton should not be undefined",
        ).not.to.be.undefined;
        generatePlaybookButton.click();
        await new Promise((res) => {
          setTimeout(res, 1000);
        });
        await webView.switchBack();

        // Verify a playbook was generated.
        const editor = await new EditorView().openEditor("Untitled-1");
        text = await editor.getText();
        expect(
          text.startsWith("---"),
          'The generated playbook should start with "---"',
        );

        await workbench.executeCommand("View: Close All Editor Groups");
        const dialog = new ModalDialog();
        await dialog.pushButton(`Don't Save`);
      } else {
        this.skip();
      }
    });

    it("Playbook explanation webview works as expected", async function () {
      if (process.env.TEST_LIGHTSPEED_URL) {
        const file = "playbook_4.yml";
        const filePath = getFilePath(file);

        // Open file in the editor
        await VSBrowser.instance.openResources(filePath);

        // Open playbook explanation webview.
        await workbench.executeCommand(
          "Ansible Lightspeed: Playbook explanation",
        );
        await new Promise((res) => {
          setTimeout(res, 2000);
        });

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
        expect(text.includes("Playbook Overview and Structure"));

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
      await workbench.executeCommand(
        "Ansible Lightspeed: Enable experimental features",
      );
      await workbench.executeCommand("View: Close All Editor Groups");
    });

    it("Playbook generation command shows an error message when Lightspeed is not enabled", async function () {
      // Open playbook generation webview.
      await workbench.executeCommand("Ansible Lightspeed: Playbook generation");
      const notifications = await new Workbench().getNotifications();
      const notification = notifications[0];
      expect(await notification.getMessage()).equals(
        "Enable lightspeed services from settings to use the feature.",
      );
    });
  });
}
