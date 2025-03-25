import {
  ActionsControl,
  ActivityBar,
  By,
  ContextMenu,
  InputBox,
  ModalDialog,
  SideBarView,
  ViewControl,
  ViewSection,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import {
  getModalDialogAndMessage,
  sleep,
  updateSettings,
} from "./uiTestHelper";
import { expect } from "chai";

before(function () {
  if (process.platform !== "darwin") {
    this.skip();
  }
});

describe("Login to Lightspeed", () => {
  let workbench: Workbench;
  let explorerView: WebviewView;
  let modalDialog: ModalDialog;
  let dialogMessage: string;
  let sideBar: SideBarView;
  let viewControl: ViewControl;
  let adtView: ViewSection;

  before(async () => {
    // Enable Lightspeed and open Ansible Light view on sidebar
    workbench = new Workbench();
    const settingsEditor = await workbench.openSettings();
    await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.URL",
      process.env.TEST_LIGHTSPEED_URL,
    );

    viewControl = (await new ActivityBar().getViewControl(
      "Ansible",
    )) as ViewControl;
    sideBar = await viewControl.openView();

    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtView.collapse();
    await sleep(3000);
  });

  it("Focus on Ansible Lightspeed View", async () => {
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

  it("Verify Ansible Lightspeed webview now contains user's information", async () => {
    await explorerView.switchToFrame(5000);
    const div = await explorerView.findWebElement(
      By.id("lightspeedExplorerView"),
    );
    const text = await div.getText();
    expect(text).contains("Logged in as:");
    await explorerView.switchBack();
  });
});

describe("Sign out from Lightspeed", () => {
  let workbench: Workbench;

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
