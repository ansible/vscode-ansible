import { updateSettings } from "../helper";
import { testDiagnosticsAnsibleWithoutEE } from "./diagnostics/testAnsibleWithoutEE.test";
import { testDiagnosticsYAMLWithoutEE } from "./diagnostics/testYamlWithoutEE.test";
import { testHoverEE } from "./hover/testWithEE.test";
import { testHoverWithoutEE } from "./hover/testWithoutEE.test";

describe("END-TO-END TEST SUITE FOR REDHAT.ANSIBLE EXTENSION", () => {
  // describe("TEST EXTENSION IN LOCAL ENVIRONMENT", () => {
  //   before(async () => {
  //     await updateSettings("trace.server", "verbose", "ansibleServer");
  //   });

  //   after(async () => {
  //     await updateSettings("trace.server", "off", "ansibleServer"); // Revert back the default settings
  //   });

  //   testHoverWithoutEE();
  //   testDiagnosticsAnsibleWithoutEE();
  //   testDiagnosticsYAMLWithoutEE();
  // });

  describe("TEST EXTENSION IN EXECUTION ENVIRONMENT", () => {
    before(async () => {
      await updateSettings("trace.server", "verbose", "ansibleServer");
      await updateSettings("executionEnvironment.enabled", true);
      await updateSettings("executionEnvironment.containerEngine", "docker");
      await updateSettings("executionEnvironment.image", "quay.io/ansible/network-ee:stable-2.12");
    });

    after(async () => {
      await updateSettings("trace.server", "off", "ansibleServer"); // Revert back the default settings
      await updateSettings("executionEnvironment.enabled", false);
      await updateSettings("executionEnvironment.containerEngine", "auto");
    });

    testHoverEE();
  });
});
