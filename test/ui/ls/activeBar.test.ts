import { expect, config } from "chai";
import {
  By,
  SideBarView,
  ViewControl,
  WebView,
  ViewSection,
} from "vscode-extension-tester";
import {
  updateSettings,
  getWebviewByLocator,
  openSettings,
  getAnsibleViewControl,
} from "../uiTestHelper";

config.truncateThreshold = 0;

describe("presence of lightspeed login button in the activity bar", function () {
  let view: ViewControl;
  let sideBar: SideBarView;
  let adtView: ViewSection;
  let webviewView: WebView;

  before(async function () {
    this.skip();
    this.timeout(30000); // Increase timeout for extension loading
    const settingsEditor = await openSettings();
    await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
    view = await getAnsibleViewControl();
    sideBar = await view.openView();

    await sideBar.getContent().getSection("Ansible Lightspeed");

    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    await adtView.collapse();

    webviewView = await getWebviewByLocator(
      By.xpath("//vscode-button[text()='Connect']"),
    );
  });

  after(async function () {
    if (webviewView) {
      await webviewView.switchBack();
    }
    const settingsEditor = await openSettings();
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
