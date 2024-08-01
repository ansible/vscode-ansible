import { expect } from "chai";
import { withInterpreter } from "../../src/utils/misc";

interface testType {
  scenario: string;
  executable: string;
  args: string;
  interpreterPath: string;
  activationScript: string;
  expectedCommand: string;
  expectedEnv: { [name: string]: string };
}
describe("withInterpreter", () => {
  const tests: testType[] = [
    {
      scenario: "when activation script is provided",
      executable: "ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "/path/to/venv/bin/activate",
      expectedCommand:
        "bash -c 'source /path/to/venv/bin/activate && ansible-lint playbook.yml'",
      expectedEnv: {},
    },
    {
      scenario: "when no activation script is provided",
      executable: "ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "",
      expectedCommand: "ansible-lint playbook.yml",
      expectedEnv: {},
    },
    {
      scenario: "when absolute path of executable is provided",
      executable: "/absolute/path/to/ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "",
      expectedCommand: "/absolute/path/to/ansible-lint playbook.yml",
      expectedEnv: {},
    },
    {
      scenario: "when absolute path of interpreter is provided",
      executable: "/absolute/path/to/ansible-lint",
      args: "playbook.yml",
      interpreterPath: "/path/to/venv/bin/python3",
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
            if (!actualCommand[1] || typeof expectedEnv === "string") {
              expect(false);
            } else {
              expect(actualCommand[1][key]).to.include(
                expectedEnv[key] as string,
              );
            }
          });
        }
      });
    },
  );
});
