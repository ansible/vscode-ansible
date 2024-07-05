import { extensionUIAssetsTest } from "./extensionUITest";
import {
  lightspeedUILoginTest,
  lightspeedUISignOutTest,
} from "./lightspeedAuthUiTest";
import { lightspeedUIAssetsTest } from "./lightspeedUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
  lightspeedUIAssetsTest();
  lightspeedUILoginTest();
  // Skip this on MacOS due to the functional limitation on menu support
  if (process.platform !== "darwin") {
    lightspeedUISignOutTest();
  }
});
