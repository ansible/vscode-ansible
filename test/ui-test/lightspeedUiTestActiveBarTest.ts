import { expect, config } from "chai";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  WebView,
  ViewSection,
} from "vscode-extension-tester";
import { sleep, getWebviewByLocator, openSettings } from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify the presence of lightspeed login button in the activity bar", () => {
  let view: ViewControl;
  let sideBar: SideBarView;
  let adtView: ViewSection;
  let webviewView: WebView;

  before(async function () {
    await openSettings();
    view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
    sideBar = await view.openView();

    await sideBar.getContent().getSection("Ansible Lightspeed");

    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtView.collapse();

    await sleep(2000);

    webviewView = await getWebviewByLocator(
      By.xpath("//vscode-button[text()='Connect']"),
    );
  });

  after(async function () {
    if (webviewView) {
      await webviewView.switchBack();
    }
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
