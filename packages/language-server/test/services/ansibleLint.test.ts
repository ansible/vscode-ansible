import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const runToolMock = vi.hoisted(() => vi.fn());
vi.mock("@ansible/core/out/services/CommandService", () => ({
  getCommandService: () => ({ runTool: runToolMock }),
}));

vi.mock("../../src/utils/misc", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/utils/misc")>();
  return { ...orig, fileExists: vi.fn().mockResolvedValue(false) };
});

function mockConnection() {
  return {
    window: {
      createWorkDoneProgress: vi.fn().mockResolvedValue({
        begin: vi.fn(),
        done: vi.fn(),
      }),
      showErrorMessage: vi.fn(),
    },
    console: {
      error: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
}

function mockContext(
  folderUri = "file:///workspace",
  settings?: Partial<{
    validation: {
      enabled: boolean;
      lint: { arguments: string; autoFixOnSave: boolean };
    };
  }>,
) {
  const defaults = {
    validation: {
      enabled: true,
      lint: { arguments: "", autoFixOnSave: false },
    },
  };
  return {
    workspaceFolder: { uri: folderUri, name: "ws" },
    clientCapabilities: { window: {} },
    documentSettings: {
      get: vi.fn().mockResolvedValue(settings ?? defaults),
    },
  };
}

function makeDoc(
  content = "---\n- hosts: all\n  tasks: []",
  uri = "file:///workspace/playbook.yml",
) {
  return TextDocument.create(uri, "ansible", 1, content);
}

describe("AnsibleLint", () => {
  let AnsibleLint: typeof import("../../src/services/ansibleLint").AnsibleLint;

  beforeEach(async () => {
    vi.resetModules();
    runToolMock.mockReset();
    const mod = await import("../../src/services/ansibleLint");
    AnsibleLint = mod.AnsibleLint;
  });

  it("returns empty diagnostics when validation is disabled", async () => {
    const ctx = mockContext("file:///workspace", {
      validation: {
        enabled: false,
        lint: { arguments: "", autoFixOnSave: false },
      },
    });

    const svc = new AnsibleLint(mockConnection() as never, ctx as never);
    const result = await svc.doValidate(makeDoc());
    expect(result.size).toBe(0);
  });

  it("parses Code Climate JSON report into diagnostics", async () => {
    const report = [
      {
        check_name: "yaml[truthy]",
        description: "Truthy value should be one of [false, true]",
        severity: "minor",
        location: {
          path: "playbook.yml",
          positions: { begin: { line: 3, column: 5 } },
        },
        url: "https://ansible.readthedocs.io/en/latest/rules/yaml/",
      },
    ];

    runToolMock.mockResolvedValueOnce({
      stdout: JSON.stringify(report),
      stderr: "",
      exitCode: 2,
    });

    const svc = new AnsibleLint(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());

    expect(result.size).toBe(1);
    const diags = [...result.values()][0];
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diags[0].source).toBe("ansible-lint");
    expect(diags[0].range.start.line).toBe(2);
    expect(diags[0].range.start.character).toBe(4);
    expect(diags[0].code).toBe("yaml[truthy]");
    expect(diags[0].codeDescription?.href).toBe(
      "https://ansible.readthedocs.io/en/latest/rules/yaml/",
    );
  });

  it("maps non-minor severity to Error", async () => {
    const report = [
      {
        check_name: "syntax-check",
        description: "Syntax Error",
        severity: "major",
        location: {
          path: "playbook.yml",
          positions: { begin: { line: 1, column: 1 } },
        },
      },
    ];

    runToolMock.mockResolvedValueOnce({
      stdout: JSON.stringify(report),
      stderr: "",
      exitCode: 2,
    });

    const svc = new AnsibleLint(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());
    const diags = [...result.values()][0];
    expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
  });

  it("warns on empty stdout", async () => {
    runToolMock.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const conn = mockConnection();
    const svc = new AnsibleLint(conn as never, mockContext() as never);
    await svc.doValidate(makeDoc());
    expect(conn.console.warn).toHaveBeenCalledWith(
      expect.stringContaining("suspiciously empty"),
    );
  });

  it("shows error on malformed JSON stdout", async () => {
    runToolMock.mockResolvedValueOnce({
      stdout: "not json at all",
      stderr: "",
      exitCode: 2,
    });

    const conn = mockConnection();
    const svc = new AnsibleLint(conn as never, mockContext() as never);
    await svc.doValidate(makeDoc());

    expect(conn.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Could not parse ansible-lint output"),
    );
  });

  it("appends --fix when autoFixOnSave is enabled", async () => {
    const ctx = mockContext("file:///workspace", {
      validation: {
        enabled: true,
        lint: { arguments: "", autoFixOnSave: true },
      },
    });

    runToolMock.mockResolvedValueOnce({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    });

    const svc = new AnsibleLint(mockConnection() as never, ctx as never);
    await svc.doValidate(makeDoc());

    const args = runToolMock.mock.calls[0][1] as string[];
    expect(args).toContain("--fix");
  });

  it("skips config file discovery when -c is in arguments", async () => {
    const ctx = mockContext("file:///workspace", {
      validation: {
        enabled: true,
        lint: {
          arguments: "-c /custom/.ansible-lint",
          autoFixOnSave: false,
        },
      },
    });

    runToolMock.mockResolvedValueOnce({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    });

    const svc = new AnsibleLint(mockConnection() as never, ctx as never);
    await svc.doValidate(makeDoc());

    expect(svc.ansibleLintConfigFilePath).toBe("/custom/.ansible-lint");
  });

  it("handles multi-file diagnostics", async () => {
    const report = [
      {
        check_name: "rule-a",
        description: "Issue in file A",
        severity: "minor",
        location: {
          path: "roles/a/tasks/main.yml",
          positions: { begin: { line: 1, column: 1 } },
        },
      },
      {
        check_name: "rule-b",
        description: "Issue in file B",
        severity: "major",
        location: {
          path: "roles/b/tasks/main.yml",
          positions: { begin: { line: 2, column: 3 } },
        },
      },
    ];

    runToolMock.mockResolvedValueOnce({
      stdout: JSON.stringify(report),
      stderr: "",
      exitCode: 2,
    });

    const svc = new AnsibleLint(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());
    expect(result.size).toBe(2);
  });

  it("logs exception from runTool", async () => {
    runToolMock.mockRejectedValueOnce(new Error("lint crash"));

    const conn = mockConnection();
    const svc = new AnsibleLint(conn as never, mockContext() as never);
    const result = await svc.doValidate(makeDoc());

    expect(conn.console.error).toHaveBeenCalledWith(
      expect.stringContaining("lint crash"),
    );
    expect(result.size).toBe(0);
  });
});
