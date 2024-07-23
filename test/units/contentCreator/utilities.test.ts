import { homedir } from "os";
import { assert } from "chai";
import {
  expandPath,
  getBinDetail,
  runCommand,
} from "../../../src/features/contentCreator/utils";

const homeDir = homedir();

const getBinDetailTests = [
  {
    name: "valid binary (python)",
    command: "python3",
    arg: "--version",
    expected: "Python 3.",
  },
  {
    name: "valid binary (ansible-lint)",
    command: "ansible-lint",
    arg: "--version",
    expected: "ansible-lint",
  },
  {
    name: "invalid binary (ansible-invalid)",
    command: "ansible-invalid",
    arg: "--version",
    expected: "failed",
  },
];

const runCommandTests = [
  {
    name: "successful command execution details",
    command: "echo 'Hello, world'",
    expected: {
      output: "Hello, world",
      status: "passed",
    },
  },
  {
    name: "unsuccessful command execution details",
    command: "echos 'Hello, world'",
    expected: {
      output: "echos",
      status: "failed",
    },
  },
];

const expandPathTests = [
  {
    name: "expand path for '~' operator",
    pathUrl: "~/path/to/file",
    expected: `${homeDir}/path/to/file`,
  },
  {
    name: "expand path for '$HOME' env var",
    pathUrl: "~/path/to/file2",
    expected: `${homeDir}/path/to/file2`,
  },
  {
    name: "not expand path for any other symbols/vars",
    pathUrl: "*/path/to/file3",
    expected: `*/path/to/file3`,
  },
];

describe("'getBinDetail()' utility functions for the content creator", () => {
  getBinDetailTests.forEach(({ name, command, arg, expected }) => {
    it(`should provide details for ${name}`, async function () {
      const result = (await getBinDetail(command, arg)).toString();
      assert.include(result, expected);
    });
  });
});

describe("'runCommand()' utility functions for the content creator", () => {
  runCommandTests.forEach(({ name, command, expected }) => {
    it(`should provide details for ${name}`, async function () {
      const result = await runCommand(command, process.env);
      assert.include(result.output, expected.output);
      assert.equal(result.status, expected.status);
    });
  });
});

describe("'expandPath()' utility functions for the content creator", () => {
  expandPathTests.forEach(({ name, pathUrl, expected }) => {
    it(`should provide details for ${name}`, function () {
      const result = expandPath(pathUrl);
      assert.equal(result, expected);
    });
  });
});
