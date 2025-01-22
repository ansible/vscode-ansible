// BEFORE: ansible.lightspeed.enabled: true

import {
  ActionsControl,
  ActivityBar,
  By,
  ContextMenu,
  EditorView,
  InputBox,
  ModalDialog,
  SideBarView,
  VSBrowser,
  ViewControl,
  ViewSection,
  WebView,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import {
  getFixturePath,
  getModalDialogAndMessage,
  getWebviewByLocator,
  sleep,
  workbenchExecuteCommand,
} from "./uiTestHelper";
import { WizardGenerationActionType } from "../../src/definitions/lightspeed";
import { PlaybookGenerationActionEvent } from "../../src/interfaces/lightspeed";
import { expect } from "chai";

before(function () {
  if (process.platform !== "darwin") {
    this.skip();
  }
});

describe("Test Lightspeed Explorer features", () => {
  let workbench: Workbench;
  let explorerView: WebviewView;
  let modalDialog: ModalDialog;
  let dialogMessage: string;
  let sideBar: SideBarView;
  let view: ViewControl;
  let adtView: ViewSection;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async () => {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }

    // Enable Lightspeed and open Ansible Light view on sidebar
    workbench = new Workbench();
    // Close settings and other open editors (if any)
    await new EditorView().closeAllEditors();

    // Set "UI Test" and "One Click" options for mock server
    try {
      await fetch(`${process.env.TEST_LIGHTSPEED_URL}/__debug__/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["--ui-test"]),
      });
    } catch (error) {
      console.error(
        "Failed to set ui-test and one-click options for lightspeed mock server",
        error,
      );
      expect.fail(
        "Failed to set ui-test and one-click options for lightspeed mock server",
      );
    }
  });

  it("Focus on Ansible Lightspeed View", async () => {
    view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
    sideBar = await view.openView();

    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtView.collapse();

    await sleep(3000);
    explorerView = new WebviewView();
    expect(explorerView, "contentCreatorWebView should not be undefined").not.to
      .be.undefined;
  });

  it("Click Connect button Ansible Lightspeed webview", async () => {
    await explorerView.switchToFrame(5000);

    const connectButton = await explorerView.findWebElement(
      By.id("lightspeed-explorer-connect"),
    );
    expect(connectButton).not.to.be.undefined;
    if (connectButton) {
      await connectButton.click();
    }
    await explorerView.switchBack();
  });

  it("Click Allow to use Lightspeed", async () => {
    // Click Allow to use Lightspeed
    const { dialog, message } = await getModalDialogAndMessage(true);
    expect(message).equals(
      "The extension 'Ansible' wants to sign in using Ansible Lightspeed.",
    );
    await dialog.pushButton("Allow");
  });

  it("Verify a modal dialog pops up", async () => {
    const { dialog, message } = await getModalDialogAndMessage();
    expect(dialog).not.to.be.undefined;
    expect(message).not.to.be.undefined;
    modalDialog = dialog;
    dialogMessage = message;
  });

  it("Click Open if a dialog shows up for opening the external website", async () => {
    // If the dialog to open the external website is not suppressed, click Open
    if (dialogMessage === "Do you want Code to open the external website?") {
      await modalDialog.pushButton("Configure Trusted Domains");
      const input = await InputBox.create();
      input.confirm();

      const d = await getModalDialogAndMessage();
      modalDialog = d.dialog;
      dialogMessage = d.message;
    }
  });

  it("Click Open to open the callback URI", async () => {
    // Click Open to allow Ansible extension to open the callback URI
    expect(dialogMessage).equals("Allow 'Ansible' extension to open this URI?");
    await modalDialog.pushButton("Open");
    await sleep(2000);
  });

  it("Verify Ansible Lightspeed Generate Playbook button", async () => {
    await explorerView.switchToFrame(2000);

    const generatePlaybookButton = await explorerView.findWebElement(
      By.id("lightspeed-explorer-playbook-generation-submit"),
    );
    expect(generatePlaybookButton).not.to.be.undefined;

    // Open playbook generation webview.
    await generatePlaybookButton.click();
    await sleep(2000);

    // Locate the playbook explanation webview
    await explorerView.switchBack();
    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );
    expect(webView, "webView should not be undefined").not.to.be.undefined;

    await webView.switchBack();
    await workbenchExecuteCommand("View: Close All Editor Groups");

    /* verify generated events */
    const expected = [
      [WizardGenerationActionType.OPEN, undefined, 1],
      [WizardGenerationActionType.CLOSE_CANCEL, 1, undefined],
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

  it("Verify Ansible Lightspeed Explain Playbook button", async () => {
    const folder = "lightspeed";
    const file = "playbook_4.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    await explorerView.switchToFrame(2000);

    const explainPlaybookButton = await explorerView.findWebElement(
      By.id("lightspeed-explorer-playbook-explanation-submit"),
    );
    expect(explainPlaybookButton).not.to.be.undefined;

    // Open playbook explanation webview.
    await explainPlaybookButton.click();
    await sleep(2000);

    // Locate the playbook explanation webview
    await explorerView.switchBack();
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

    /* verify generated events */
    try {
      const response: Response = await fetch(
        `${process.env.TEST_LIGHTSPEED_URL}/__debug__/feedbacks`,
        {
          method: "GET",
        },
      );

      if (response.ok) {
        const data = await response.json();
        expect(data.feedbacks.length).equals(1);
      } else {
        expect.fail(
          `Failed to verify generated events, request returned status: ${response.status} and text: ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(
        "Failed to verify generated events with unknown error",
        error,
      );
      expect.fail("Failed to verify generated events with unknown error");
    }
  });

  it("Sign out using Accounts global action", async () => {
    workbench = new Workbench();
    const activityBar = new ActivityBar();
    const actions = (await activityBar.getGlobalAction(
      "Accounts",
    )) as ActionsControl;
    expect(actions).not.to.be.undefined;
    await actions.click();
    const menus = await workbench.findElements(By.className("context-view"));
    expect(menus.length).greaterThan(0);
    const menu = new ContextMenu(workbench);
    expect(menu).not.to.be.undefined;
    if (menu) {
      await menu.select(
        "EXTERNAL_USERNAME (licensed) (Ansible Lightspeed)",
        "Sign Out",
      );
    }
  });
});
