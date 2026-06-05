import { expect, describe, it } from "vitest";
import { withInterpreter, validatePlaybookPath } from "@src/utils/misc.js";
import * as os from "os";
import * as path from "path";
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
  const alwaysTrue = () => true;
  const alwaysFalse = () => false;

  const tests: testType[] = [
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

  describe("activation script validation", function () {
    it("should reject activation script with shell metacharacters", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "",
        "/tmp/activate; rm -rf /",
      );

      expect(result.command).toBe("ansible-lint playbook.yml");
    });

    it("should reject activation script that does not exist", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "",
        "/nonexistent/path/to/activate",
      );

      expect(result.command).toBe("ansible-lint playbook.yml");
    });

    it("should fall through to interpreter path when activation script is invalid", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "/home/user/.venv/bin/python3",
        "/tmp/activate$(whoami)",
        alwaysTrue,
      );

      expect(result.command).toBe("ansible-lint playbook.yml");
      expect(result.env.VIRTUAL_ENV).toBe("/home/user/.venv");
    });

    it("should accept a valid activation script that exists", function () {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "als-test-"));
      const scriptPath = path.join(tmpDir, "activate");
      fs.writeFileSync(scriptPath, "# activation script");

      try {
        const result = withInterpreter(
          "ansible-lint",
          "playbook.yml",
          "",
          scriptPath,
        );

        expect(result.command).toBe(
          `sh -c '. ${scriptPath} && ansible-lint playbook.yml'`,
        );
      } finally {
        fs.unlinkSync(scriptPath);
        fs.rmdirSync(tmpDir);
      }
    });

    it("should accept activation script with tilde home directory shorthand", function () {
      // Create a test file in user's home directory
      const homeDir = os.homedir();
      const tmpDir = fs.mkdtempSync(path.join(homeDir, ".als-test-"));
      const scriptPath = path.join(tmpDir, "activate");
      fs.writeFileSync(scriptPath, "# activation script");

      // Get the relative path from home with tilde
      const relativePath = `~${scriptPath.slice(homeDir.length)}`;

      try {
        const result = withInterpreter(
          "ansible-lint",
          "playbook.yml",
          "",
          relativePath,
        );

        expect(result.command).toBe(
          `sh -c '. ${relativePath} && ansible-lint playbook.yml'`,
        );
      } finally {
        fs.unlinkSync(scriptPath);
        fs.rmdirSync(tmpDir);
      }
    });

    it("should accept activation script with ~/ prefix", function () {
      // Create a test file in user's home directory
      const homeDir = os.homedir();
      const tmpDir = fs.mkdtempSync(path.join(homeDir, ".als-test-"));
      const scriptPath = path.join(tmpDir, "activate");
      fs.writeFileSync(scriptPath, "# activation script");

      // Get the relative path from home with ~/
      const relativePath = `~/${path.relative(homeDir, scriptPath)}`;

      try {
        const result = withInterpreter(
          "ansible-lint",
          "playbook.yml",
          "",
          relativePath,
        );

        expect(result.command).toBe(
          `sh -c '. ${relativePath} && ansible-lint playbook.yml'`,
        );
      } finally {
        fs.unlinkSync(scriptPath);
        fs.rmdirSync(tmpDir);
      }
    });

    it("should reject tilde path with shell metacharacters", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "",
        "~/activate; rm -rf /",
      );

      expect(result.command).toBe("ansible-lint playbook.yml");
    });

    it("should reject tilde path that does not exist after expansion", function () {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "",
        "~/nonexistent/venv/bin/activate",
      );

      expect(result.command).toBe("ansible-lint playbook.yml");
    });
  });
});

describe("validatePlaybookPath", function () {
  it("should accept a valid file path", function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "als-test-"));
    const filePath = path.join(tmpDir, "playbook.yml");
    fs.writeFileSync(filePath, "---\n- hosts: all\n");

    try {
      expect(validatePlaybookPath(filePath)).toBeUndefined();
    } finally {
      fs.unlinkSync(filePath);
      fs.rmdirSync(tmpDir);
    }
  });

  it("should reject paths with shell metacharacters", function () {
    expect(validatePlaybookPath("/tmp/play; rm -rf /")).toContain(
      "unsafe characters",
    );
  });

  it("should reject a directory path", function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "als-test-"));

    try {
      expect(validatePlaybookPath(tmpDir)).toContain("is not a file");
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  it("should reject a nonexistent path", function () {
    expect(validatePlaybookPath("/nonexistent/playbook.yml")).toContain(
      "does not exist",
    );
  });

  it("should accept a valid playbook path with tilde", function () {
    const homeDir = os.homedir();
    const tmpDir = fs.mkdtempSync(path.join(homeDir, ".als-test-"));
    const filePath = path.join(tmpDir, "playbook.yml");
    fs.writeFileSync(filePath, "---\n- hosts: all\n");

    // Get the relative path from home with ~/
    const relativePath = `~/${path.relative(homeDir, filePath)}`;

    try {
      expect(validatePlaybookPath(relativePath)).toBeUndefined();
    } finally {
      fs.unlinkSync(filePath);
      fs.rmdirSync(tmpDir);
    }
  });

  it("should reject tilde playbook path with shell metacharacters", function () {
    expect(validatePlaybookPath("~/playbook.yml; rm -rf /")).toContain(
      "unsafe characters",
    );
  });

  it("should reject tilde playbook path that does not exist", function () {
    expect(validatePlaybookPath("~/nonexistent/playbook.yml")).toContain(
      "does not exist",
    );
  });
});

describe("activation script validation via withInterpreter", function () {
  it("should reject all shell metacharacter injection attempts", function () {
    const malicious = [
      "/tmp/activate; rm -rf /",
      "/tmp/activate$(whoami)",
      "/tmp/activate`id`",
      "/tmp/activate & echo pwned",
      "/tmp/activate | cat /etc/passwd",
      "/tmp/activate\nmalicious",
      "/tmp/activate$HOME",
      "/tmp/'; rm -rf / #",
    ];

    for (const p of malicious) {
      const result = withInterpreter("ansible-lint", "playbook.yml", "", p);
      expect(result.command).toBe("ansible-lint playbook.yml");
    }
  });

  it("should reject a directory path as activation script", function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "als-test-"));

    try {
      const result = withInterpreter(
        "ansible-lint",
        "playbook.yml",
        "",
        tmpDir,
      );
      expect(result.command).toBe("ansible-lint playbook.yml");
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });
});
