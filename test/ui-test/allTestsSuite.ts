import { extensionUIAssetsTest } from "./extensionUITest";
import { wisdomUIAssetsTest } from "./wisdomUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
  wisdomUIAssetsTest();
});
