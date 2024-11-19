import { config, expect } from "chai";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  ViewSection,
  WebView,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import { sleep } from "./uiTestHelper";

config.truncateThreshold = 0;
export function welcomePageUITest(): void {
  describe("Verify welcome page is displayed as expected", async () => {
    let view: ViewControl;
    let sideBar: SideBarView;
    let webviewView: InstanceType<typeof WebviewView>;
    let workbench: Workbench;
    let adtSection: ViewSection;

    before(async () => {
      // Open Ansible Development Tools by clicking the Getting started button on the side bar
      workbench = new Workbench();
      view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
      sideBar = await view.openView();
      await sleep(2000);

      // to get the content part
      adtSection = await sideBar
        .getContent()
        .getSection("Ansible Development Tools");
      adtSection.expand();
    });

    it("check for title and get started button", async function () {
      const title = await adtSection.getTitle();

      await workbench.executeCommand(
        "Ansible: Focus on Ansible Development Tools View",
      );

      webviewView = new WebviewView();
      expect(webviewView).not.undefined;
      await webviewView.switchToFrame(1000);

      const body = await webviewView.findWebElement(By.xpath("//body"));
      const welcomeMessage = await body.getText();
      expect(welcomeMessage).to.contain("LAUNCH");

      const getStartedLink = await webviewView.findWebElement(
        By.xpath(
          "//a[contains(@title, 'Ansible Development Tools welcome page')]",
        ),
      );

      expect(title).not.to.be.undefined;
      expect(title).to.equals("Ansible Development Tools");
      expect(getStartedLink).not.to.be.undefined;

      if (getStartedLink) {
        await getStartedLink.click();
      }
      await sleep(3000);
      webviewView.switchBack();
    });

    it("check for header and subtitle", async function () {
      const welcomePageWebView = await new WebView();
      expect(welcomePageWebView, "welcomePageWebView should not be undefined")
        .not.to.be.undefined;
      await welcomePageWebView.switchToFrame(3000);
      expect(
        welcomePageWebView,
        "welcomePageWebView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

      const adtHeaderTitle = await welcomePageWebView.findWebElement(
        By.className("title caption"),
      );
      expect(adtHeaderTitle).not.to.be.undefined;
      expect(await adtHeaderTitle.getText()).to.equals(
        "Ansible Development Tools",
      );

      const adtSubheader = await welcomePageWebView.findWebElement(
        By.className("subtitle description"),
      );
      expect(adtSubheader).not.to.be.undefined;
      expect(await adtSubheader.getText()).includes(
        "Create, test and deploy Ansible content",
      );

      await welcomePageWebView.switchBack();
    });

    it("Check if start and walkthrough list section is visible", async () => {
      const welcomePageWebView = await new WebView();
      expect(welcomePageWebView, "welcomePageWebView should not be undefined")
        .not.to.be.undefined;
      await welcomePageWebView.switchToFrame(3000);
      expect(
        welcomePageWebView,
        "welcomePageWebView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

      const startSection = await welcomePageWebView.findWebElement(
        By.className("index-list start-container"),
      );

      const walkthroughSection = await welcomePageWebView.findWebElement(
        By.className("index-list getting-started"),
      );

      expect(startSection).not.to.be.undefined;
      expect(walkthroughSection).not.to.be.undefined;

      const playbookWithLightspeedOption = await startSection.findElement(
        By.css("h3"),
      );

      expect(await playbookWithLightspeedOption.getText()).to.equal(
        "Playbook with Ansible Lightspeed",
      );

      const walkthroughItems = await walkthroughSection.findElements(
        By.className("walkthrough-item"),
      );
      expect(walkthroughItems.length).to.greaterThanOrEqual(2);

      const firstWalkthrough = walkthroughItems[0].findElement(By.css("h3"));
      expect(await firstWalkthrough.getText()).to.equal(
        "Create an Ansible environment",
      );
      await firstWalkthrough.click();
      await sleep(2000);
      await welcomePageWebView.switchBack();
    });
  });
}
