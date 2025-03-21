// BEFORE: ansible.lightspeed.enabled: false

import { expect, config } from "chai";
import {
  By,
  StatusBar,
  VSBrowser,
  EditorView,
  ViewControl,
  ActivityBar,
  SideBarView,
  ViewSection,
} from "vscode-extension-tester";
import { getFixturePath } from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify the presence of lightspeed element in the status bar and the explorer view", () => {
  let statusBar: StatusBar;
  let editorView: EditorView;
  let viewControl: ViewControl;
  let sideBar: SideBarView;
  let adtView: ViewSection;
  const folder = "lightspeed";
  const file = "playbook_1.yml";
  const filePath = getFixturePath(folder, file);

  before(async function () {
    statusBar = new StatusBar();
    editorView = new EditorView();

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

  it("Lightspeed webviews not present when settings not enabled", async function () {
    viewControl = (await new ActivityBar().getViewControl(
      "Ansible",
    )) as ViewControl;
    sideBar = await viewControl.openView();

    adtView = await sideBar
      .getContent()
      .getSection("Ansible Development Tools");

    expect(adtView).not.to.be.undefined;

    const sections = await sideBar.getContent().getSections();

    expect(sections.length).equals(1);
  });
});
