import { expect, config } from "chai";
import {
  ActivityBar,
  By,
  SideBarView,
  ViewControl,
  ExtensionsViewSection,
  Workbench,
  StatusBar,
  VSBrowser,
  EditorView,
  SettingsEditor,
} from "vscode-extension-tester";
import { getFilePath, updateSettings } from "./uiTestHelper";

config.truncateThreshold = 0;
export function lightspeedUIAssetsTest(): void {
  describe("Verify the presence of lightspeed login button in the activity bar", () => {
    let view: ViewControl;
    let sideBar: SideBarView;
    let lightspeedServiceSection: ExtensionsViewSection;

    before(async function () {
      // this.timeout(10000);
      view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
      sideBar = await view.openView();

      lightspeedServiceSection = (await sideBar
        .getContent()
        .getSection("Ansible Lightspeed Login")) as ExtensionsViewSection;
    });

    it("Ansible Lightspeed welcome message is present", async function () {
      // this.retries(3);
      // this.timeout(20000); // even 18s failed

      const welcomeMessage = await lightspeedServiceSection
        .findWelcomeContent()
        .then(async (val) => {
          return val?.getText();
        });

      expect(welcomeMessage).to.contain(
        "Welcome to Ansible Lightspeed for Visual Studio Code."
      );
    });

    it("Ansible Lightspeed login button is present", async function () {
      // this.retries(3);
      // this.timeout(20000); // even 18s failed

      const welcomeContent = await lightspeedServiceSection.findWelcomeContent();
      expect(welcomeContent).not.undefined;
      const loginButton = await welcomeContent?.findElement(By.xpath("//a[.//span/text()='Connect']"));
      expect(loginButton).not.undefined;

      // **** ORIGINAL CODE ****
      // const loginButton = lightspeedServiceSection
      //   .findWelcomeContent()
      //   .then(async (val) => {
      //// *** Following getButtons() call does not seem to get buttons...
      //     return (await val?.getButtons()) as WelcomeContentButton[];
      //   });

      // const loginButtonTitle = await (await loginButton)[0].getTitle();

      // expect(loginButtonTitle).to.equal("Connect");      
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
      // this.timeout(100000);

      statusBar = new StatusBar();
      editorView = new EditorView();
      workbench = new Workbench();

      // open file in the editor
      await VSBrowser.instance.openResources(filePath);
    });

    it("Ansible Lightspeed status bar item absent when settings not enabled", async function () {
      await editorView.openEditor(file);
      const items = await statusBar.findElements(By.xpath((
        "//div[contains(@class, 'statusbar-item') and " 
        + ".//a/text()='Lightspeed (unlicensed)']")));
      expect(items.length).equals(0);

      // **** ORIGINAL CODE ****
      //   *** statusBar.getItem() does not seem to get items correctly.
      // const lightspeedStatusBarItem = await statusBar.getItem("Lightspeed");
      // expect(lightspeedStatusBarItem).to.be.undefined;
    });

    it("Ansible Lightspeed status bar item present when only lightspeed is enabled (with warning color)", async () => {
      settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
      await editorView.openEditor(file);
      const lightspeedStatusBarItem = await statusBar.findElement(By.xpath((
        "//div[contains(@class, 'statusbar-item') and " 
        + "contains(@class, 'has-background-color') and "
        + "contains(@class, 'warning-kind') and "
        + ".//a/text()='Lightspeed (unlicensed)']")));
      expect(lightspeedStatusBarItem).not.to.be.undefined;

      // **** ORIGINAL CODE ****
      //   *** statusBar.getItem() does not seem to get items correctly.
      // const lightspeedStatusBarItem = await statusBar.getItem("Lightspeed");
      // expect(lightspeedStatusBarItem).not.to.be.undefined;

      //  // getAttribute('style') returns a string with "background-color" in case of different color, else returns nothing
      // expect(await lightspeedStatusBarItem?.getAttribute("style")).to.include(
      //   "background-color"
      // );
    });

    it("Ansible Lightspeed status bar item present when lightspeed and lightspeed suggestions are enabled (with normal color)", async () => {
      settingsEditor = await workbench.openSettings();
      // await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
      await updateSettings(
        settingsEditor,
        "ansible.lightspeed.suggestions.enabled",
        true
      );
      await editorView.openEditor(file);
      const lightspeedStatusBarItem = await statusBar.findElement(By.xpath((
        "//div[contains(@class, 'statusbar-item') and " 
        + "not (contains(@class, 'has-background-color')) and "
        + ".//a/text()='Lightspeed (unlicensed)']")));
      expect(lightspeedStatusBarItem).not.to.be.undefined;
      
      // **** ORIGINAL CODE ****
      //   *** statusBar.getItem() does not seem to get items correctly.
      // const lightspeedStatusBarItem = await statusBar.getItem("Lightspeed");
      // expect(lightspeedStatusBarItem).not.to.be.undefined;

      // // getAttribute('style') returns a string with "background-color" in case of different color, else returns nothing
      // expect(await lightspeedStatusBarItem?.getAttribute("style")).to.be.empty;
    });
  });
}
