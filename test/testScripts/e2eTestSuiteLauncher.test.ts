import { testDiagnosticsAnsibleWithoutEE } from "./diagnostics/testAnsibleWithoutEE.test";
import { testDiagnosticsYAMLWithoutEE } from "./diagnostics/testYamlWithoutEE.test";
import { testHoverEE } from "./hover/testWithEE.test";
import { testHoverWithoutEE } from "./hover/testWithoutEE.test";
import {
  updateSettings,
  setFixtureAnsibleCollectionPathEnv,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
} from "../helper";

describe("END-TO-END TEST SUITE FOR REDHAT.ANSIBLE EXTENSION", () => {
  describe("TEST EXTENSION IN LOCAL ENVIRONMENT", () => {
    before(async () => {
      setFixtureAnsibleCollectionPathEnv(
        "/home/runner/.ansible/collections:/usr/share/ansible/collections"
      );
      await updateSettings("trace.server", "verbose", "ansibleServer");
    });

    after(async () => {
      await updateSettings("trace.server", "off", "ansibleServer"); // Revert back the default settings
    });

    testHoverWithoutEE();
    testDiagnosticsAnsibleWithoutEE();
    testDiagnosticsYAMLWithoutEE();
  });

  describe("TEST EXTENSION IN EXECUTION ENVIRONMENT", () => {
    before(async () => {
      setFixtureAnsibleCollectionPathEnv(
        "/home/runner/.ansible/collections:/usr/share/ansible/collections"
      );
      await enableExecutionEnvironmentSettings();
    });

    after(async () => {
      await disableExecutionEnvironmentSettings(); // Revert back the default settings
    });

    testHoverEE();
  });
});
