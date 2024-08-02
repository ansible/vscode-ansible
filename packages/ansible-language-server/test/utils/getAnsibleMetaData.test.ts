import { expect } from "chai";
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
} from "../helper";

function getAnsibleTestInfo() {
  const ansibleInfo: ansibleMetaDataEntryType = {};
  ansibleInfo["core version"] = ".";
  ansibleInfo["location"] = "/ansible";
  (ansibleInfo["config file path"] = path.resolve(
    __dirname,
    "..",
    "fixtures",
    "utils",
    "getAnsibleMetaData",
    "ansible.cfg",
  )),
    (ansibleInfo["collections location"] = [
      path.resolve(__dirname, "..", "fixtures", "common", "collections"),
    ]);
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
  describe("Verify the working of command executions", () => {
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
          expect(output).to.be.undefined;
        } else {
          expect(output?.stdout).contains(result);
        }
      });
    });
  });
}

describe("getAnsibleMetaData()", () => {
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

  describe("With EE disabled", () => {
    before(async () => {
      if (context !== undefined) {
        actualAnsibleMetaData = await getAnsibleMetaData(context, undefined);
      }
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
    });

    describe("Verify ansible details", () => {
      it("should contain all the keys for ansible information", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(Object.keys(ansibleInfoForTest).length).equals(
            Object.keys(actualAnsibleMetaData["ansible information"]).length,
          );
        } else {
          expect(false);
        }
      });

      it("should have information about ansible version used", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["core version"],
          ).includes(ansibleInfoForTest["core version"]);
        } else {
          expect(false);
        }
      });

      it("should have a valid ansible location", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["location"],
          ).include(ansibleInfoForTest["location"]);
        } else {
          expect(false);
        }
      });

      it("should have a valid config file location", function () {
        if (actualAnsibleMetaData["ansible information"]) {
          expect(
            actualAnsibleMetaData["ansible information"]["config file path"],
          ).to.include(ansibleInfoForTest["config file path"]);
        } else {
          expect(false);
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
            expect(false);
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
          expect(false);
        }
      });
    });

    describe("Verify python details", () => {
      it("should contain all the keys for python information", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(Object.keys(pythonInfoForTest).length).equals(
            Object.keys(actualAnsibleMetaData["python information"]).length,
          );
        } else {
          expect(false);
        }
      });
      it("should have information about python version used", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(
            actualAnsibleMetaData["python information"]["version"],
          ).includes(pythonInfoForTest["version"]);
        } else {
          expect(false);
        }
      });

      it("should have a valid python location", function () {
        if (actualAnsibleMetaData["python information"]) {
          expect(
            actualAnsibleMetaData["python information"]["location"],
          ).include(pythonInfoForTest["location"]);
        } else {
          expect(false);
        }
      });
    });

    describe("Verify ansible-lint details", () => {
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

          expect(missingKeys).to.deep.equal(
            [],
            `Missing keys: ${missingKeys.join(", ")}`,
          );
          expect(extraKeys).to.deep.equal(
            [],
            `Extra keys: ${extraKeys.join(", ")}`,
          );
        }
      });
      it("should have information about ansible-lint version used", function () {
        if (actualAnsibleMetaData["ansible-lint information"]) {
          expect(
            actualAnsibleMetaData["ansible-lint information"]["version"],
          ).includes(ansibleLintInfoForTest["version"]);
        } else {
          expect(false);
        }
      });

      it("should have a valid ansible-lint location", function () {
        if (actualAnsibleMetaData["ansible-lint information"]) {
          expect(
            actualAnsibleMetaData["ansible-lint information"]["location"],
          ).include(ansibleLintInfoForTest["location"]);
        } else {
          expect(false);
        }
      });
    });

    describe("Verify the absence of execution environment details", () => {
      it("should not contain execution environment details", function () {
        expect(actualAnsibleMetaData["execution environment information"]).to.be
          .undefined;
      });
    });

    testCommands();
  });

  describe("With EE enabled @ee", () => {
    before(async () => {
      if (docSettings) {
        await enableExecutionEnvironmentSettings(docSettings);
      }

      if (context) {
        actualAnsibleMetaData = await getAnsibleMetaData(context, undefined);
      }
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
      executionEnvironmentInfoForTest = getExecutionEnvironmentTestInfo();
    });

    describe("Verify the presence of execution environment details", () => {
      it("should have a valid container engine", function () {
        if (actualAnsibleMetaData["execution environment information"]) {
          expect(
            executionEnvironmentInfoForTest["container engine"],
          ).to.include(
            actualAnsibleMetaData["execution environment information"][
              "container engine"
            ],
          );
        } else {
          expect(false);
        }
      });

      it("should have a valid container image", function () {
        if (actualAnsibleMetaData["execution environment information"]) {
          expect(
            actualAnsibleMetaData["execution environment information"][
              "container image"
            ],
          ).to.include(executionEnvironmentInfoForTest["container image"]);
        } else {
          expect(false);
        }
      });

      after(async () => {
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    testCommands();
  });
});
