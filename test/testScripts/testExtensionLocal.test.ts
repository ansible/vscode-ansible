import { updateSettings } from "../helper";
import { testDiagnosticsAnsibleLocal } from "./diagnostics/testDiagnosticsAnsibleLocal.test";
import { testDiagnosticsYAMLLocal } from "./diagnostics/testDiagnosticsYAMLLocal.test";
import { testHoverLocal } from "./hover/testHoverLocal.test";

describe("TEST EXTENSION IN LOCAL ENVIRONMENT", () => {
  before(async () => {
    await updateSettings("trace.server", "verbose", "ansibleServer");
  });

  after(async () => {
    await updateSettings("trace.server", "off", "ansibleServer"); // Revert back the default settings
  });

  testHoverLocal();
  testDiagnosticsAnsibleLocal();
  testDiagnosticsYAMLLocal();
});
