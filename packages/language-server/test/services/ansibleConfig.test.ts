import { describe, it, expect, vi, beforeEach } from "vitest";

const runToolMock = vi.hoisted(() => vi.fn());
vi.mock("@ansible/core/out/services/CommandService", () => ({
  getCommandService: () => ({ runTool: runToolMock }),
}));

function mockConnection() {
  return {
    window: { showErrorMessage: vi.fn() },
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn() },
  };
}

function mockContext(folderUri = "file:///workspace") {
  return {
    workspaceFolder: { uri: folderUri, name: "ws" },
  };
}

describe("AnsibleConfig", () => {
  let AnsibleConfig: typeof import("../../src/services/ansibleConfig").AnsibleConfig;

  beforeEach(async () => {
    vi.resetModules();
    runToolMock.mockReset();
    const mod = await import("../../src/services/ansibleConfig");
    AnsibleConfig = mod.AnsibleConfig;
  });

  it("parses ansible-config dump and ansible --version output", async () => {
    runToolMock
      .mockResolvedValueOnce({
        stdout: [
          "COLLECTIONS_PATHS(/etc/ansible/ansible.cfg) = ['/usr/share/ansible/collections']",
          "DEFAULT_HOST_LIST(/etc/ansible/ansible.cfg) = ['/etc/ansible/hosts']",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: [
          "ansible [core 2.15.0]",
          "  config file = /etc/ansible/ansible.cfg",
          "  configured module search path = ['/home/user/.ansible/plugins/modules']",
          "  ansible python module location = /usr/lib/python3/dist-packages/ansible",
          "  executable location = /usr/bin/ansible",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      });

    const conn = mockConnection();
    const ctx = mockContext();
    const config = new AnsibleConfig(conn as never, ctx as never);
    await config.initialize();

    expect(config.collectionPaths).toEqual([
      "/usr/share/ansible/collections",
    ]);
    expect(config.defaultHostList).toEqual(["/etc/ansible/hosts"]);
    expect(config.moduleLocations).toContain(
      "/home/user/.ansible/plugins/modules",
    );
    expect(config.ansibleLocation).toBe(
      "/usr/lib/python3/dist-packages/ansible",
    );
    expect(config.ansibleMetaData).toBeDefined();
  });

  it("shows error message when command throws Error", async () => {
    runToolMock.mockRejectedValueOnce(new Error("command not found"));

    const conn = mockConnection();
    const ctx = mockContext();
    const config = new AnsibleConfig(conn as never, ctx as never);
    await config.initialize();

    expect(conn.window.showErrorMessage).toHaveBeenCalledWith(
      "command not found",
    );
    expect(config.collectionPaths).toEqual([]);
  });

  it("logs non-Error exceptions via console.error", async () => {
    runToolMock.mockRejectedValueOnce("unexpected failure");

    const conn = mockConnection();
    const ctx = mockContext();
    const config = new AnsibleConfig(conn as never, ctx as never);
    await config.initialize();

    expect(conn.console.error).toHaveBeenCalledWith(
      expect.stringContaining("unexpected failure"),
    );
  });

  it("handles empty COLLECTIONS_PATHS gracefully", async () => {
    runToolMock
      .mockResolvedValueOnce({
        stdout: "SOME_OTHER_SETTING(default) = true\n",
        stderr: "",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: [
          "ansible [core 2.15.0]",
          "  configured module search path = []",
          "  ansible python module location = /usr/lib/ansible",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      });

    const conn = mockConnection();
    const config = new AnsibleConfig(conn as never, mockContext() as never);
    await config.initialize();

    expect(config.collectionPaths).toEqual([]);
  });
});
