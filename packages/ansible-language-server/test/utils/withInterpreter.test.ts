import { expect, vi, beforeEach, afterEach, describe, it } from "vitest";
import { withInterpreter } from "@src/utils/misc.js";

// Mock fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import * as fs from "fs";

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
        const actualCommand = withInterpreter(
          executable,
          args,
          interpreterPath,
          activationScript,
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

  describe("virtual environment detection", function () {
    let existsSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      existsSyncSpy = vi.spyOn(fs, "existsSync");
    });

    afterEach(() => {
      existsSyncSpy.mockRestore();
    });

    it("should detect virtual environment and set VIRTUAL_ENV", function () {
      // Mock activate script exists (is a venv)
      existsSyncSpy.mockReturnValue(true);

      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "/home/user/.venv/bin/python3",
        "",
      );

      expect(result.env.VIRTUAL_ENV).toBe("/home/user/.venv");
      expect(result.env.PATH).toContain("/home/user/.venv/bin");
      expect(result.env.PYTHONHOME).toBeUndefined();
    });

    it("should handle non-venv Python and not set VIRTUAL_ENV", function () {
      // Mock activate script doesn't exist (not a venv)
      existsSyncSpy.mockReturnValue(false);

      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "/usr/local/bin/python3.12",
        "",
      );

      expect(result.env.VIRTUAL_ENV).toBeUndefined();
      expect(result.env.PATH).toContain("/usr/local/bin");
      expect(result.env.PATH).not.toContain("/usr/local");
    });

    it("should use interpreter directory for non-venv with tools in same dir", function () {
      // Mock activate script doesn't exist
      existsSyncSpy.mockReturnValue(false);

      const result = withInterpreter(
        "ansible",
        "--version",
        "/home/user/.local/bin/python3.12",
        "",
      );

      // Should use /home/user/.local/bin (interpreter's directory)
      expect(result.env.PATH).toContain("/home/user/.local/bin");
      // Should NOT set VIRTUAL_ENV for non-venv
      expect(result.env.VIRTUAL_ENV).toBeUndefined();
    });

    it("should use venv bin directory when activate script exists", function () {
      // Mock activate script exists
      existsSyncSpy.mockReturnValue(true);

      const result = withInterpreter(
        "ansible",
        "--version",
        "/home/user/.local/share/virtualenvs/myproject/bin/python",
        "",
      );

      // Should use venv/bin directory
      expect(result.env.PATH).toContain(
        "/home/user/.local/share/virtualenvs/myproject/bin",
      );
      expect(result.env.VIRTUAL_ENV).toBe(
        "/home/user/.local/share/virtualenvs/myproject",
      );
    });
  });
});
