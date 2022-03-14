import { updateSettings } from "../helper";
import { testDiagnosticsAnsibleWithoutEE } from "./diagnostics/testAnsibleWithoutEE.test";
import { testDiagnosticsYAMLWithoutEE } from "./diagnostics/testYamlWithoutEE.test";
import { testHoverEE } from "./hover/testWithEE.test";
import { testHoverWithoutEE } from "./hover/testWithoutEE.test";

describe("END-TO-END TEST SUITE FOR REDHAT.ANSIBLE EXTENSION", () => {
  describe("TEST EXTENSION IN LOCAL ENVIRONMENT", () => {
    before(async () => {
      await updateSettings("ansibleServer.trace.server", "verbose"); // Revert back the default settings
    });

    after(async () => {
      await updateSettings("ansibleServer.trace.server", "off");
    });

    testHoverWithoutEE();
    testDiagnosticsAnsibleWithoutEE();
    testDiagnosticsYAMLWithoutEE();
  });

  describe("TEST EXTENSION IN EXECUTION ENVIRONMENT", () => {
    before(async () => {
      await updateSettings("ansibleServer.trace.server", "verbose");
      await updateSettings("executionEnvironment.enabled", true);
      await updateSettings("executionEnvironment.containerEngine", "docker");
    });

    after(async () => {
      await updateSettings("ansibleServer.trace.server", "off"); // Revert back the default settings
      await updateSettings("executionEnvironment.enabled", false);
      await updateSettings("executionEnvironment.containerEngine", "auto");
    });

    testHoverEE();
  });
});
