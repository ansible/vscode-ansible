import { expect, beforeAll, afterAll } from "vitest";
import path = require("path");
import {
  ansibleMetaDataEntryType,
  ansibleMetaDataType,
  getAnsibleMetaData,
  getResultsThroughCommandRunner,
} from "../../src/utils/getAnsibleMetaData";
import {
  createTestWorkspaceManager,
  disableExecutionEnvironmentSettings,
  enableExecutionEnvironmentSettings,
  getDoc,
  resolveDocUri,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper";

function getAnsibleTestInfo() {
  const ansibleInfo: ansibleMetaDataEntryType = {};
  ansibleInfo["core version"] = ".";
  ansibleInfo["location"] = "/ansible";
  // eslint-disable-next-line chai-friendly/no-unused-expressions
  ((ansibleInfo["config file path"] = path.resolve(
    __dirname,
    "..",
    "fixtures",
    "utils",
    "getAnsibleMetaData",
    "ansible.cfg",
  )),
    (ansibleInfo["collections location"] = [
      path.resolve(__dirname, "..", "fixtures", "common", "collections"),
    ]));
  ansibleInfo["module location"] = ["/modules"];
  ansibleInfo["default host list path"] = [
    path.resolve(
      __dirname,
      "..",
      "fixtures",
      "utils",
      "getAnsibleMetaData",
      "inventory",
    ),
  ];
  return ansibleInfo;
}

function getPythonTestInfo() {
  const pythonInfo: ansibleMetaDataEntryType = {};
  pythonInfo["version"] = ".";
  pythonInfo["location"] = "/python3";
  return pythonInfo;
}

function getAnsibleLintTestInfo() {
  const ansibleLintInfo: ansibleMetaDataEntryType = {};
  ansibleLintInfo["version"] = ".";
  ansibleLintInfo["upgrade status"] = "A new version"; // this key will be undefined (but the key will be present) because the value only gets updated based on the ansible-lint version used
  ansibleLintInfo["location"] = "/ansible-lint";
  ansibleLintInfo["config file path"] = "/.ansible-lint"; // this key will be undefined (but the key will be present) because the value only gets updated when validation in run
  return ansibleLintInfo;
}

function getExecutionEnvironmentTestInfo() {
  const eeInfo: ansibleMetaDataEntryType = {};
  eeInfo["container engine"] = ["docker", "podman"];
  eeInfo["container image"] = "ghcr.io/";
  eeInfo["container volume mounts"] = [
    {
      src: "/fixtures/common/collections",
      dest: "/fixtures/common/collections",
    },
  ];
  return eeInfo;
}

function testCommands() {
  describe("command executions", function () {
    const tests = [
      {
        args: ["ansible", "--version"],
        result: "configured module search path",
      },
      {
        args: ["python3", "--version"],
        result: "Python",
      },
      {
        args: ["ansible-lint", "--version"],
        result: "using ansible",
      },
      {
        args: ["ansible-playbook", "missing-file"],
        result: undefined,
      },
    ];

    tests.forEach(({ args, result }) => {
      it(`should return result for '${args.join(" ")}'`, async function () {
        const output = await getResultsThroughCommandRunner(args[0], args[1]);
        if (result === undefined) {
          expect(output).toBeUndefined();
        } else {
          expect(output?.stdout).toContain(result);
        }
      });
    });
  });
}

describe("getAnsibleMetaData()", function () {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "utils/getAnsibleMetaData/plays.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);

  const textDoc = getDoc(fixtureFilePath);
  const docSettings = context?.documentSettings.get(textDoc.uri);

  let actualAnsibleMetaData: ansibleMetaDataType = {};
  let ansibleInfoForTest: ansibleMetaDataEntryType = {};
  let pythonInfoForTest: ansibleMetaDataEntryType = {};
  let ansibleLintInfoForTest: ansibleMetaDataEntryType = {};
  let executionEnvironmentInfoForTest: ansibleMetaDataEntryType = {};

  describe("@noee", function () {
    beforeAll(async () => {
      setFixtureAnsibleCollectionPathEnv();
      if (context !== undefined) {
        actualAnsibleMetaData = await getAnsibleMetaData(context, undefined);
      }
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
    });

    describe("Verify ansible details", function () {
      it("should contain all the keys for ansible information", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(Object.keys(ansibleInfoForTest).length).toBe(
            Object.keys(actualAnsibleMetaData["ansible information"]).length,
          );
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have information about ansible version used", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["core version"],
          ).toContain(ansibleInfoForTest["core version"]);
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid ansible location", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["location"],
          ).toContain(ansibleInfoForTest["location"]);
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid config file location", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["config file path"],
          ).toContain(ansibleInfoForTest["config file path"]);
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid collections location", function () {
        const x = ansibleInfoForTest["collections location"];
        if (Array.isArray(x)) {
          if (actualAnsibleMetaData["ansible information"]) {
            expect(
              actualAnsibleMetaData["ansible information"][
                "collections location"
              ],
            ).to.include.members(x);
          } else {
            expect(false).toBe(true);
          }
        }
      });

      it("should have a valid inventory file path", function () {
        const x = ansibleInfoForTest["default host list path"];
        if (Array.isArray(x) && actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"][
              "default host list path"
            ],
          ).to.include.members(x);
        } else {
          expect(false).toBe(true);
        }
      });
    });

    describe("Verify python details", function () {
      it("should contain all the keys for python information", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(Object.keys(pythonInfoForTest).length).toBe(
            Object.keys(actualAnsibleMetaData["python information"]).length,
          );
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have information about python version used", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(
            actualAnsibleMetaData["python information"]["version"],
          ).toContain(pythonInfoForTest["version"]);
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid python location", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(
            actualAnsibleMetaData["python information"]["location"],
          ).toContain(pythonInfoForTest["location"]);
        } else {
          expect(false).toBe(true);
        }
      });
    });

    describe("Verify ansible-lint details", function () {
      it("should contain all the keys for ansible-lint information", function () {
        expect(actualAnsibleMetaData["ansible-lint information"]);
        if (actualAnsibleMetaData["ansible-lint information"]) {
          const expectedKeys = Object.keys(ansibleLintInfoForTest);
          const actualKeys = Object.keys(
            actualAnsibleMetaData["ansible-lint information"],
          );

          const missingKeys = expectedKeys.filter(
            (key) => !actualKeys.includes(key),
          );

          const extraKeys = actualKeys.filter(
            (key) => !expectedKeys.includes(key),
          );

          expect(missingKeys).toEqual([]);
          if (missingKeys.length > 0) {
            throw new Error(`Missing keys: ${missingKeys.join(", ")}`);
          }
          expect(extraKeys).toEqual([]);
          if (extraKeys.length > 0) {
            throw new Error(`Extra keys: ${extraKeys.join(", ")}`);
          }
        }
      });

      it("should have information about ansible-lint version used", function () {
        if (actualAnsibleMetaData["ansible-lint information"]) {
          expect(
            actualAnsibleMetaData["ansible-lint information"]["version"],
          ).toContain(ansibleLintInfoForTest["version"]);
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid ansible-lint location", function () {
        if (actualAnsibleMetaData["ansible-lint information"]) {
          expect(
            actualAnsibleMetaData["ansible-lint information"]["location"],
          ).toContain(ansibleLintInfoForTest["location"]);
        } else {
          expect(false).toBe(true);
        }
      });
    });

    describe("absence of execution environment details", function () {
      it("should not contain execution environment details", function () {
        expect(actualAnsibleMetaData["execution environment information"]).to.be
          .undefined;
      });
    });

    testCommands();
  });

  describe("@ee", function () {
    beforeAll(async () => {
      if (docSettings) {
        await enableExecutionEnvironmentSettings(docSettings, context);
      }

      if (context) {
        actualAnsibleMetaData = await getAnsibleMetaData(context, undefined);
      }
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
      executionEnvironmentInfoForTest = getExecutionEnvironmentTestInfo();
    }, 60000); // EE operations (container pull/start) can be slow on CI

    describe("presence of execution environment details", function () {
      it("should have a valid container engine", function () {
        if (actualAnsibleMetaData["execution environment information"]) {
          expect(executionEnvironmentInfoForTest["container engine"]).toContain(
            actualAnsibleMetaData["execution environment information"][
              "container engine"
            ],
          );
        } else {
          expect(false).toBe(true);
        }
      });

      it("should have a valid container image", function () {
        if (actualAnsibleMetaData["execution environment information"]) {
          expect(
            actualAnsibleMetaData["execution environment information"][
              "container image"
            ],
          ).toContain(executionEnvironmentInfoForTest["container image"]);
        } else {
          expect(false).toBe(true);
        }
      });

      afterAll(async function () {
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
    });

    testCommands();
  });
});
