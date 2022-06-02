import { extensionUIAssetsTest } from "./extensionUITest";

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
describe("VSCode Ansible - UI tests", function () {
  this.timeout(30000);
  extensionUIAssetsTest();
});
