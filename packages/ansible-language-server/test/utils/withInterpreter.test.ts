import { expect } from "chai";
import { withInterpreter } from "../../src/utils/misc";

describe("withInterpreter", () => {
  const tests = [
    {
      scenario: "when activation script is provided",
      executable: "ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "/path/to/venv/bin/activate",
      expectedCommand:
        "bash -c 'source /path/to/venv/bin/activate && ansible-lint playbook.yml'",
      expectedEnv: undefined,
    },
    {
      scenario: "when no activation script is provided",
      executable: "ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "",
      expectedCommand: "ansible-lint playbook.yml",
    },
    {
      scenario: "when absolute path of executable is provided",
      executable: "/absolute/path/to/ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "",
      expectedCommand: "/absolute/path/to/ansible-lint playbook.yml",
    },
    {
      scenario: "when absolute path of interpreter is provided",
      executable: "/absolute/path/to/ansible-lint",
      args: "playbook.yml",
      interpreterPath: "/path/to/venv/bin/python",
      activationScript: "",
      expectedCommand: "/absolute/path/to/ansible-lint playbook.yml",
      expectedEnv: {
        VIRTUAL_ENV: "/path/to/venv",
        PATH: "/path/to/venv/bin",
      },
    },
  ];

  tests.forEach(
    ({
      scenario,
      executable,
      args,
      interpreterPath,
      activationScript,
      expectedCommand,
      expectedEnv,
    }) => {
      it(`should provide command ${scenario}`, () => {
        const actualCommand = withInterpreter(
          executable,
          args,
          interpreterPath,
          activationScript,
        );
        expect(actualCommand[0]).to.equal(expectedCommand);

        if (expectedEnv) {
          const expectedKeys = Object.keys(expectedEnv);

          expectedKeys.forEach((key) => {
            expect(actualCommand[1]).to.haveOwnProperty(key);
            expect(typeof actualCommand[1] === "object");
            expect(actualCommand[1][key]).to.include(expectedEnv[key]);
          });
        }
      });
    },
  );
});
