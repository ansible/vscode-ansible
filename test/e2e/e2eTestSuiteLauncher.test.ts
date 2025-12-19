// This file is loaded by `vscode-test` cli tool.
import { testDiagnosticsAnsibleWithoutEE } from "./diagnostics/ansibleWithoutEE.test";
import { testDiagnosticsYAMLWithoutEE } from "./diagnostics/yamlWithoutEE.test";
import { testHoverEE } from "./hover/withEE.test";
import { testHoverWithoutEE } from "./hover/withoutEE.test";
import {
  updateSettings,
  setFixtureAnsibleCollectionPathEnv,
  unSetFixtureAnsibleCollectionPathEnv,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  deleteAlsCache,
} from "../helper";
import { testLightspeed } from "./lightspeed/lightspeed.test";
import { testExtensionForFilesOutsideWorkspace } from "./outsideWorkspace/extensionForFilesOutsideWorkspace.test";

describe("e2e", function () {
  const run_lightspeed_tests_only =
    process.env.RUN_LIGHTSPEED_TESTS_ONLY || "0";

  describe("local-env", function () {
    before(async function () {
      setFixtureAnsibleCollectionPathEnv(
        "/home/runner/.ansible/collections:/usr/share/ansible/collections",
      );
      await updateSettings("trace.server", "verbose", "ansibleServer");
    });

    after(async function () {
      await updateSettings("trace.server", "off", "ansibleServer"); // Revert back the default settings
    });

    if (run_lightspeed_tests_only !== "1") {
      testHoverWithoutEE();
      testDiagnosticsAnsibleWithoutEE();
      testDiagnosticsYAMLWithoutEE();
    }
    testLightspeed();
  });

  const skip_ee = process.env.SKIP_PODMAN || process.env.SKIP_DOCKER || "0";
  if (skip_ee !== "1" && run_lightspeed_tests_only !== "1") {
    describe("ee", function () {
      before(async function () {
        deleteAlsCache();
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        await enableExecutionEnvironmentSettings();
      });

      after(async function () {
        await disableExecutionEnvironmentSettings(); // Revert back the default settings
        unSetFixtureAnsibleCollectionPathEnv();
        deleteAlsCache();
      });

      testHoverEE();
    });
  }

  if (run_lightspeed_tests_only !== "1") {
    describe("files-outside-workspace", function () {
      testExtensionForFilesOutsideWorkspace();
    });
  }
});
