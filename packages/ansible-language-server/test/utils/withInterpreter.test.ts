import { expect, describe, it } from "vitest";
import { withInterpreter } from "@src/utils/misc.js";

interface testType {
  scenario: string;
  executable: string;
  args: string;
  interpreterPath: string;
  activationScript: string;
  expectedCommand: string;
  expectedEnv: { [name: string]: string };
}

describe("withInterpreter", function () {
  const alwaysTrue = () => true;
  const alwaysFalse = () => false;

  const tests: testType[] = [
    {
      scenario: "when activation script is provided",
      executable: "ansible-lint",
      args: "playbook.yml",
      interpreterPath: "",
      activationScript: "/path/to/venv/bin/activate",
      expectedCommand:
        "sh -c '. /path/to/venv/bin/activate && ansible-lint playbook.yml'",
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
      it(`should provide command ${scenario}`, function () {
        const isVenv =
          expectedEnv && "VIRTUAL_ENV" in expectedEnv
            ? alwaysTrue
            : alwaysFalse;

        const actualCommand = withInterpreter(
          executable,
          args,
          interpreterPath,
          activationScript,
          isVenv,
        );
        expect(actualCommand.command).toBe(expectedCommand);

        if (expectedEnv) {
          const expectedKeys = Object.keys(expectedEnv);

          expectedKeys.forEach((key) => {
            expect(actualCommand.env).to.haveOwnProperty(key);
            expect(typeof actualCommand.env === "object");
            if (!actualCommand.env || typeof expectedEnv === "string") {
              expect(false).toBe(true);
            } else {
              expect(actualCommand.env[key]).toContain(expectedEnv[key]);
            }
          });
        }
      });
    },
  );

  describe("bare interpreter handling", function () {
    it("should not prepend '.' to PATH for bare command names", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "python3",
        "",
      );

      expect(result.env.VIRTUAL_ENV).toBeUndefined();
      expect(result.env.PATH).not.toMatch(/^\./);
      expect(result.command).toBe("ansible-lint playbook.yml");
    });
  });

  describe("virtual environment detection", function () {
    it("should detect virtual environment and set VIRTUAL_ENV", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "/home/user/.venv/bin/python3",
        "",
        alwaysTrue,
      );

      expect(result.env.VIRTUAL_ENV).toBe("/home/user/.venv");
      expect(result.env.PATH).toContain("/home/user/.venv/bin");
      expect(result.env.PYTHONHOME).toBeUndefined();
    });

    it("should handle non-venv Python and not set VIRTUAL_ENV", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "/usr/local/bin/python3.12",
        "",
        alwaysFalse,
      );

      expect(result.env.VIRTUAL_ENV).toBeUndefined();
      expect(result.env.PATH).toContain("/usr/local/bin");
      expect(result.env.PATH?.startsWith("/usr/local/bin:")).toBe(true);
    });

    it("should use interpreter directory for non-venv with tools in same dir", function () {
      const result = withInterpreter(
        "ansible",
        "--version",
        "/home/user/.local/bin/python3.12",
        "",
        alwaysFalse,
      );

      expect(result.env.PATH).toContain("/home/user/.local/bin");
      expect(result.env.VIRTUAL_ENV).toBeUndefined();
    });

    it("should use venv bin directory when activate script exists", function () {
      const result = withInterpreter(
        "ansible",
        "--version",
        "/home/user/.local/share/virtualenvs/myproject/bin/python",
        "",
        alwaysTrue,
      );

      expect(result.env.PATH).toContain(
        "/home/user/.local/share/virtualenvs/myproject/bin",
      );
      expect(result.env.VIRTUAL_ENV).toBe(
        "/home/user/.local/share/virtualenvs/myproject",
      );
    });
  });
});
