import { extensionUIAssetsTest } from "./extensionUITest";
import { lightspeedUIAuthTest } from "./lightspeedAuthUiTest";
import { lightspeedUIAssetsTest } from "./lightspeedUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
  lightspeedUIAuthTest();
  lightspeedUIAssetsTest();
});
