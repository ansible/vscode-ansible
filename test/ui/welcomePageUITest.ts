import { config, expect } from "chai";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  ViewSection,
  WebviewView,
} from "vscode-extension-tester";
import {
  getWebviewByLocator,
  workbenchExecuteCommand,
  sleep,
  waitForCondition,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify welcome page is displayed as expected", function () {
  let view: ViewControl;
  let sideBar: SideBarView;
  let webviewView: InstanceType<typeof WebviewView>;
  let adtSection: ViewSection;

  before(async function () {
    // Open Ansible Development Tools by clicking the Getting started button on the side bar
    view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
    sideBar = await view.openView();

    await workbenchExecuteCommand(
      "Ansible: Focus on Ansible Development Tools View",
    );

    // to get the content part
    adtSection = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");
    adtSection.expand();
  });

  it("check for title and get started button", async function () {
    const title = await adtSection.getTitle();

    await workbenchExecuteCommand(
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

    await getWebviewByLocator(
      By.xpath("//h1[text()='Ansible Development Tools']"),
    );

    webviewView.switchBack();
  });

  it("check for header and subtitle", async function () {
    const welcomePageWebView = await getWebviewByLocator(
      By.xpath("//h1[text()='Ansible Development Tools']"),
    );

    await waitForCondition({
      condition: async () => {
        try {
          const loadingContainer = await welcomePageWebView.findWebElement(
            By.className("playbookGenerationContainer"),
          );
          const classAttr = await loadingContainer.getAttribute("class");
          return !classAttr.includes("loading");
        } catch {
          return false;
        }
      },
      message: "Timed out waiting for welcome page to finish loading",
      timeout: 10000,
    });

    const adtHeaderTitle = await welcomePageWebView.findWebElement(
      By.xpath("//h1[text()='Ansible Development Tools']"),
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

  it("Check if start and walkthrough list section is visible", async function () {
    const welcomePageWebView = await getWebviewByLocator(
      By.className("index-list start-container"),
    );

    await waitForCondition({
      condition: async () => {
        try {
          const loadingContainer = await welcomePageWebView.findWebElement(
            By.className("playbookGenerationContainer"),
          );
          const classAttr = await loadingContainer.getAttribute("class");
          return !classAttr.includes("loading");
        } catch {
          return false;
        }
      },
      message: "Timed out waiting for welcome page to finish loading",
      timeout: 10000,
    });

    const startSection = await welcomePageWebView.findWebElement(
      By.className("index-list start-container"),
    );

    expect(startSection).not.to.be.undefined;

    const playbookWithLightspeedOption = await startSection.findElement(
      By.css("h3"),
    );

    expect(await playbookWithLightspeedOption.getText()).to.equal(
      "Playbook with Ansible Lightspeed",
    );

    // Wait for walkthroughs to load before checking them
    await waitForCondition({
      condition: async () => {
        try {
          const walkthroughItems = await welcomePageWebView.findWebElements(
            By.className("walkthrough-item"),
          );
          return walkthroughItems.length >= 2;
        } catch {
          return false;
        }
      },
      message: "Timed out waiting for walkthrough items to load",
      timeout: 10000,
    });

    const walkthroughSection = await getWebviewByLocator(
      By.className("walkthrough-item"),
    );
    const walkthroughItems = await walkthroughSection.findWebElements(
      By.className("walkthrough-item"),
    );
    expect(walkthroughItems.length).to.greaterThanOrEqual(2);

    const firstWalkthrough = await walkthroughSection.findWebElement(
      By.xpath(
        "//div[@class='category-title'][contains(text(), 'Create an Ansible environment')]",
      ),
    );
    expect(await firstWalkthrough.getText()).to.equal(
      "Create an Ansible environment",
    );
    await firstWalkthrough.click();
    await sleep(2000);
    await welcomePageWebView.switchBack();
  });
});
