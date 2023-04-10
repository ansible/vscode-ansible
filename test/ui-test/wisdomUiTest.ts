import { expect, config } from "chai";
import {
  ActivityBar,
  SideBarView,
  ViewControl,
  ExtensionsViewSection,
  Workbench,
  WelcomeContentButton,
  StatusBar,
  VSBrowser,
  EditorView,
  SettingsEditor,
} from "vscode-extension-tester";
import { getFilePath, updateSettings } from "./uiTestHelper";

config.truncateThreshold = 0;
export function wisdomUIAssetsTest(): void {
  describe("Verify the presence of wisdom login button in the activity bar", () => {
    let view: ViewControl;
    let sideBar: SideBarView;
    let wisdomServiceSection: ExtensionsViewSection;

    before(async function () {
      // this.timeout(10000);
      view = (await new ActivityBar().getViewControl("Ansible")) as ViewControl;
      sideBar = await view.openView();

      wisdomServiceSection = (await sideBar
        .getContent()
        .getSection("Project Wisdom Service")) as ExtensionsViewSection;
    });

    it("Project Wisdom welcome message is present", async function () {
      // this.retries(3);
      // this.timeout(20000); // even 18s failed

      const welcomeMessage = await wisdomServiceSection
        .findWelcomeContent()
        .then(async (val) => {
          return val?.getText();
        });

      expect(welcomeMessage).to.contain(
        "Welcome to Project Wisdom service for Visual Studio Code."
      );
    });

    it("Project Wisdom login button is present", async function () {
      // this.retries(3);
      // this.timeout(20000); // even 18s failed

      const loginButton = wisdomServiceSection
        .findWelcomeContent()
        .then(async (val) => {
          return (await val?.getButtons()) as WelcomeContentButton[];
        });

      const loginButtonTitle = await (await loginButton)[0].getTitle();

      expect(loginButtonTitle).to.equal("Connect");
    });
  });

  describe("Verify the presence of wisdom element in the status bar", () => {
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

    it("Project wisdom status bar item absent when settings not enabled", async function () {
      await editorView.openEditor(file);
      const wisdomStatusBarItem = await statusBar.getItem("Wisdom");
      expect(wisdomStatusBarItem).to.be.undefined;
    });

    it("Project wisdom status bar item present when only wisdom is enabled (with warning color)", async () => {
      settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.wisdom.enabled", true);
      await editorView.openEditor(file);
      const wisdomStatusBarItem = await statusBar.getItem("Wisdom");
      expect(wisdomStatusBarItem).not.to.be.undefined;

      // getAttribute('style') returns a string with "background-color" in case of different color, else returns nothing
      expect(await wisdomStatusBarItem?.getAttribute("style")).to.include(
        "background-color"
      );
    });

    it("Project wisdom status bar item present when wisdom and wisdom suggestions are enabled (with normal color)", async () => {
      settingsEditor = await workbench.openSettings();
      // await updateSettings(settingsEditor, "ansible.wisdom.enabled", true);
      await updateSettings(
        settingsEditor,
        "ansible.wisdom.suggestions.enabled",
        true
      );
      await editorView.openEditor(file);
      const wisdomStatusBarItem = await statusBar.getItem("Wisdom");
      expect(wisdomStatusBarItem).not.to.be.undefined;

      // getAttribute('style') returns a string with "background-color" in case of different color, else returns nothing
      expect(await wisdomStatusBarItem?.getAttribute("style")).to.be.empty;
    });
  });
}
