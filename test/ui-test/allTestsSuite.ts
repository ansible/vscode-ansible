import { extensionUIAssetsTest } from "./extensionUITest";
// import { lightspeedUIAssetsTest } from "./lightspeedUiTest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
  // lightspeedUIAssetsTest();
});
