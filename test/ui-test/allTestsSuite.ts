import { extensionUIAssetsTest } from "./extensionUITest";

describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
});
