import { updateSettings } from "../helper";
import { testDiagnosticsAnsibleWithoutEE } from "./diagnostics/testAnsibleWithoutEE.test";
import { testDiagnosticsYAMLWithoutEE } from "./diagnostics/testYamlWithoutEE.test";
import { testHoverEE } from "./hover/testWithEE.test";
import { testHoverWithoutEE } from "./hover/testWithoutEE.test";

describe("END-TO-END TEST SUITE FOR REDHAT.ANSIBLE EXTENSION", () => {
  describe("TEST EXTENSION IN LOCAL ENVIRONMENT", () => {
    testHoverWithoutEE();
    testDiagnosticsAnsibleWithoutEE();
    testDiagnosticsYAMLWithoutEE();
  });

  describe("TEST EXTENSION IN EXECUTION ENVIRONMENT", () => {
    before(async () => {
      await updateSettings("executionEnvironment.enabled", true);
      await updateSettings("executionEnvironment.containerEngine", "docker");
    });

    after(async () => {
      await updateSettings("executionEnvironment.enabled", false); // Revert back the default setting
      await updateSettings("executionEnvironment.containerEngine", "auto");
    });

    testHoverEE();
  });
});
