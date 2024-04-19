import { expect } from "chai";
import path = require("path");
import {
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
  const ansibleInfo = {};
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
  const pythonInfo = {};
  pythonInfo["version"] = ".";
  pythonInfo["location"] = "/python";
  return pythonInfo;
}

function getAnsibleLintTestInfo() {
  const ansibleLintInfo = {};
  ansibleLintInfo["version"] = ".";
  ansibleLintInfo["upgrade status"] = "A new version"; // this key will be undefined (but the key will be present) because the value only gets updated based on the ansible-lint version used
  ansibleLintInfo["location"] = "/ansible-lint";
  ansibleLintInfo["config file path"] = "/.ansible-lint"; // this key will be undefined (but the key will be present) because the value only gets updated when validation in run
  return ansibleLintInfo;
}

function getExecutionEnvironmentTestInfo() {
  const eeInfo = {};
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
          expect(output.stdout).contains(result);
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
  const docSettings = context.documentSettings.get(textDoc.uri);

  let actualAnsibleMetaData = {};
  let ansibleInfoForTest = {};
  let pythonInfoForTest = {};
  let ansibleLintInfoForTest = {};
  let executionEnvironmentInfoForTest = {};

  describe("With EE disabled", () => {
    before(async () => {
      actualAnsibleMetaData = await getAnsibleMetaData(context, null);
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
    });

    describe("Verify ansible details", () => {
      it("should contain all the keys for ansible information", function () {
        expect(Object.keys(ansibleInfoForTest).length).equals(
          Object.keys(actualAnsibleMetaData["ansible information"]).length,
        );
      });

      it("should have information about ansible version used", function () {
        expect(
          actualAnsibleMetaData["ansible information"]["core version"],
        ).includes(ansibleInfoForTest["core version"]);
      });

      it("should have a valid ansible location", function () {
        expect(
          actualAnsibleMetaData["ansible information"]["location"],
        ).include(ansibleInfoForTest["location"]);
      });

      it("should have a valid config file location", function () {
        expect(
          actualAnsibleMetaData["ansible information"]["config file path"],
        ).to.include(ansibleInfoForTest["config file path"]);
      });

      it("should have a valid collections location", function () {
        expect(
          actualAnsibleMetaData["ansible information"]["collections location"],
        ).to.include.members(ansibleInfoForTest["collections location"]);
      });

      it("should have a valid inventory file path", function () {
        expect(
          actualAnsibleMetaData["ansible information"][
            "default host list path"
          ],
        ).to.include.members(ansibleInfoForTest["default host list path"]);
      });
    });

    describe("Verify python details", () => {
      it("should contain all the keys for python information", function () {
        expect(Object.keys(pythonInfoForTest).length).equals(
          Object.keys(actualAnsibleMetaData["python information"]).length,
        );
      });
      it("should have information about python version used", function () {
        expect(actualAnsibleMetaData["python information"]["version"]).includes(
          pythonInfoForTest["version"],
        );
      });

      it("should have a valid python location", function () {
        expect(actualAnsibleMetaData["python information"]["location"]).include(
          pythonInfoForTest["location"],
        );
      });
    });

    describe("Verify ansible-lint details", () => {
      it("should contain all the keys for ansible-lint information", function () {
        expect(Object.keys(ansibleLintInfoForTest).length).equals(
          Object.keys(actualAnsibleMetaData["ansible-lint information"]).length,
        );
      });
      it("should have information about ansible-lint version used", function () {
        expect(
          actualAnsibleMetaData["ansible-lint information"]["version"],
        ).includes(ansibleLintInfoForTest["version"]);
      });

      it("should have a valid ansible-lint location", function () {
        expect(
          actualAnsibleMetaData["ansible-lint information"]["location"],
        ).include(ansibleLintInfoForTest["location"]);
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
      await enableExecutionEnvironmentSettings(docSettings);

      actualAnsibleMetaData = await getAnsibleMetaData(context, null);
      ansibleInfoForTest = getAnsibleTestInfo();
      pythonInfoForTest = getPythonTestInfo();
      ansibleLintInfoForTest = getAnsibleLintTestInfo();
      executionEnvironmentInfoForTest = getExecutionEnvironmentTestInfo();
    });

    describe("Verify the presence of execution environment details", () => {
      it("should have a valid container engine", function () {
        expect(executionEnvironmentInfoForTest["container engine"]).to.include(
          actualAnsibleMetaData["execution environment information"][
            "container engine"
          ],
        );
      });

      it("should have a valid container image", function () {
        expect(
          actualAnsibleMetaData["execution environment information"][
            "container image"
          ],
        ).to.include(executionEnvironmentInfoForTest["container image"]);
      });

      after(async () => {
        await disableExecutionEnvironmentSettings(docSettings);
      });
    });

    testCommands();
  });
});
