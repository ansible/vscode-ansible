import { extensionUIAssetsTest } from "./extensionUITest";
import { lightspeedUILoginTest } from "./lightspeedAuthUiTest";
import { lightspeedOneClickTrialUITest } from "./lightspeedOneClickTrialUITest";
import { lightspeedUIAssetsTest } from "./lightspeedUiTest";
import { terminalUITests } from "./terminalUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);

  describe("UI Test Suite 1/3", () => {
    extensionUIAssetsTest();
    lightspeedUIAssetsTest();
  });
  describe("UI Test Suite 2/3", () => {
    terminalUITests();
  });
  describe("UI Test Suite 3/3", () => {
    // Skip this on MacOS due to the functional limitation on menu support
    if (process.platform === "darwin") {
      lightspeedUILoginTest();
    } else {
      lightspeedOneClickTrialUITest();
      // lightspeedUILoginTest();
      // lightspeedUISignOutTest();
    }
  });
});
