import { config, expect } from "chai";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  ViewSection,
  WebView,
} from "vscode-extension-tester";
import { sleep } from "./uiTestHelper";

config.truncateThreshold = 0;
export function welcomePageUITest(): void {
  describe("ADT sidebar and welcome page is displayed as expected", async () => {
    let view: ViewControl;
    let sideBar: SideBarView;
    let adtSection: ViewSection;
    let welcomePageWebView: WebView;

    before(async () => {
      // Open Ansible Development Tools by clicking the Getting started button on the side bar
      view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
      sideBar = await view.openView();
      // to get the content part
      adtSection = await sideBar
        .getContent()
        .getSection("Ansible Development Tools");

      const title = await adtSection.getTitle();
      expect(title).not.to.be.undefined;
      expect(title).to.equals("Ansible Development Tools");

      const getStartedButton = await adtSection.findElement(
        By.xpath(
          "//a[contains(@class, 'monaco-button') and " +
            ".//span/text()='Get started']",
        ),
      );

      expect(getStartedButton).not.to.be.undefined;

      if (getStartedButton) {
        await getStartedButton.click();
      }
      await sleep(3000);

      welcomePageWebView = await new WebView();
      expect(welcomePageWebView, "welcomePageWebView should not be undefined")
        .not.to.be.undefined;
      await welcomePageWebView.switchToFrame(3000);
      expect(
        welcomePageWebView,
        "welcomePageWebView should not be undefined after switching to its frame",
      ).not.to.be.undefined;
    });

    after(async function () {
      if (view) {
        await view.closeView();
      }
    });

    it("check for header and subtitle", async function () {
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

      // await welcomePageWebView.switchBack();
    });

    it("Check if start and walkthrough list section is visible", async () => {
      const startSection = await welcomePageWebView.findWebElement(
        By.className("index-list start-container"),
      );

      const walkthroughSection = await welcomePageWebView.findWebElement(
        By.className("index-list getting-started"),
      );

      expect(startSection).not.to.be.undefined;
      expect(walkthroughSection).not.to.be.undefined;

      const newPlaybookProjectOption = await startSection.findElement(
        By.css("h3"),
      );

      expect(await newPlaybookProjectOption.getText()).to.equal(
        "New playbook project",
      );

      await welcomePageWebView.switchBack();
    });
  });
}
