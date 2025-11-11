import { expect, config } from "chai";
import {
  ActivityBar,
  SideBarView,
  ViewControl,
  Workbench,
} from "vscode-extension-tester";
import { waitForCondition } from "./uiTestHelper";

const WAIT_TIME = 20000;

config.truncateThreshold = 0;

describe("base assets are available after installation", function () {
  let view: ViewControl;
  let sideBar: SideBarView;

  before(async function () {
    this.timeout(WAIT_TIME);

    // Wait for Extensions view to be available
    view = await waitForCondition({
      condition: async () => {
        try {
          const activityBar = new ActivityBar();
          const extensionsView = await activityBar.getViewControl("Extensions");
          if (extensionsView) {
            return extensionsView;
          }
          return false;
        } catch (error) {
          console.log(`Waiting for Extensions view: ${error}`);
          return false;
        }
      },
      message: "Timed out waiting for Extensions view to be available",
      timeout: 15000,
      pollTimeout: 500,
    });

    sideBar = await view.openView();
  });

  it("VSCode Ansible extension is installed", async function () {
    // Execute only when code coverage is not enabled.
    // When code coverage is enabled, the extension is not installed.
    if (!process.env.COVERAGE) {
      this.retries(3);
      this.timeout(20000); // even 18s failed
      const section = await sideBar.getContent().getSection("Installed");
      const item = await section.findItem("@installed Ansible");
      expect(item, "Failed to find Ansible extension").not.undefined;
      expect(await item?.getText()).to.contain("Ansible language support");
    } else {
      this.skip();
    }
  });

  after(async function () {
    this.timeout(8000);
    await new Workbench().executeCommand("Clear Extensions Search Results");
  });
});
