import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const runToolMock = vi.hoisted(() => vi.fn());
vi.mock("@ansible/core/out/services/CommandService", () => ({
  getCommandService: () => ({ runTool: runToolMock }),
}));

function mockConnection(_progressSupport = false) {
  return {
    window: {
      createWorkDoneProgress: vi.fn().mockResolvedValue({
        begin: vi.fn(),
        done: vi.fn(),
      }),
      showErrorMessage: vi.fn(),
    },
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn() },
  };
}

function mockContext(folderUri = "file:///workspace", progressSupport = false) {
  return {
    workspaceFolder: { uri: folderUri, name: "ws" },
    clientCapabilities: {
      window: progressSupport ? { workDoneProgress: true } : {},
    },
  };
}

function makeDoc(
  content = "---\n- hosts: all\n  tasks: []",
  uri = "file:///workspace/playbook.yml",
) {
  return TextDocument.create(uri, "ansible", 1, content);
}

describe("AnsiblePlaybook", () => {
  let AnsiblePlaybook: typeof import("../../src/services/ansiblePlaybook").AnsiblePlaybook;

  beforeEach(async () => {
    vi.resetModules();
    runToolMock.mockReset();
    const mod = await import("../../src/services/ansiblePlaybook");
    AnsiblePlaybook = mod.AnsiblePlaybook;
  });

  it("returns empty diagnostics on successful syntax check", async () => {
    runToolMock.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const svc = new AnsiblePlaybook(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());
    expect(result.size).toBe(0);
  });

  it("parses stderr with file/line/column regex", async () => {
    const stderr =
      "ERROR! ...\nThe error appears to be in '/workspace/playbook.yml': line 5, column 3\n...";
    runToolMock.mockResolvedValueOnce({
      stdout: "",
      stderr,
      exitCode: 4,
    });

    const svc = new AnsiblePlaybook(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());

    expect(result.size).toBe(1);
    const uri = result.keys().next().value!;
    const diags = result.get(uri)!;
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diags[0].source).toBe("Ansible");
    expect(diags[0].range.start.line).toBe(4);
    expect(diags[0].range.start.character).toBe(2);
  });

  it("falls back to line 1 column 1 when regex does not match", async () => {
    const stderr = "ERROR! Some generic error\n";
    runToolMock.mockResolvedValueOnce({
      stdout: "",
      stderr,
      exitCode: 4,
    });

    const svc = new AnsiblePlaybook(
      mockConnection() as never,
      mockContext() as never,
    );
    const result = await svc.doValidate(makeDoc());

    expect(result.size).toBe(1);
    const diags = [...result.values()][0];
    expect(diags[0].range.start.line).toBe(0);
    expect(diags[0].range.start.character).toBe(0);
  });

  it("logs exception and returns empty diagnostics on command failure", async () => {
    runToolMock.mockRejectedValueOnce(new Error("exec failed"));

    const conn = mockConnection();
    const svc = new AnsiblePlaybook(conn as never, mockContext() as never);
    const result = await svc.doValidate(makeDoc());

    expect(conn.console.error).toHaveBeenCalledWith(
      expect.stringContaining("exec failed"),
    );
    expect(result.size).toBe(0);
  });

  it("uses work-done progress when client supports it", async () => {
    runToolMock.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const conn = mockConnection(true);
    const ctx = mockContext("file:///workspace", true);
    const svc = new AnsiblePlaybook(conn as never, ctx as never);
    await svc.doValidate(makeDoc());

    expect(conn.window.createWorkDoneProgress).toHaveBeenCalled();
  });
});
