import { extensionUIAssetsTest } from "./extensionUITest";
import { wisdomUIAssetsTest } from "./wisdomUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();

  // The test for wisdom UI can be enabled once we merge the wisdom settings in the package.json
  // wisdomUIAssetsTest();
});
