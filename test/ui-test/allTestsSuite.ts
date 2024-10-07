import { extensionUIAssetsTest } from "./extensionUITest";
import { lightspeedUILoginTest } from "./lightspeedAuthUiTest";
import { lightspeedOneClickTrialUITest } from "./lightspeedOneClickTrialUITest";
import { lightspeedUIAssetsTest } from "./lightspeedUiTest";
import { terminalUITests } from "./terminalUiTest";
import { walkthroughUiTest } from "./walkthroughUiTest";
import { welcomePageUITest } from "./welcomePageUITest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
  lightspeedUIAssetsTest();
  terminalUITests();
  welcomePageUITest();

  // Skip this on MacOS due to the functional limitation on menu support
  if (process.platform === "darwin") {
    lightspeedUILoginTest();
  } else {
    lightspeedOneClickTrialUITest();
    // lightspeedUILoginTest();
    // lightspeedUISignOutTest();
  }
  walkthroughUiTest();
});
