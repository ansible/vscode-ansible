import { describe, it, expect, vi, beforeEach } from "vitest";

const ADT_OUTPUT = `ansible-builder 24.2.0
ansible-core 2.16.1
ansible-creator 24.2.0
ansible-dev-tools 24.2.0
ansible-lint 24.2.0
ansible-navigator 24.2.0
`;

const mocks = vi.hoisted(() => {
  const mockRunTool = vi.fn();
  return {
    mockRunTool,
    getCommandService: vi.fn(() => ({
      runTool: mockRunTool,
    })),
  };
});

vi.mock("../../src/services/CommandService", () => ({
  getCommandService: mocks.getCommandService,
}));

import { DevToolsService } from "../../src/services/DevToolsService";

function resetDevToolsSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (DevToolsService as any)._instance = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (DevToolsService as any).terminalServiceFactory = undefined;
}

describe("DevToolsService", () => {
  beforeEach(() => {
    resetDevToolsSingleton();
    mocks.mockRunTool.mockReset();
    mocks.getCommandService.mockClear();
    mocks.getCommandService.mockImplementation(() => ({
      runTool: mocks.mockRunTool,
    }));
  });

  it("getInstance returns the same singleton", () => {
    const a = DevToolsService.getInstance();
    const b = DevToolsService.getInstance();
    expect(a).toBe(b);
  });

  it("refresh loads and parses adt --version output", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: ADT_OUTPUT,
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(mocks.mockRunTool).toHaveBeenCalledWith("adt", ["--version"]);
    expect(svc.getPackages().map((p) => p.name)).toEqual([
      "ansible-builder",
      "ansible-core",
      "ansible-creator",
      "ansible-dev-tools",
      "ansible-lint",
      "ansible-navigator",
    ]);
    expect(svc.getPackage("ansible-core")?.version).toBe("2.16.1");
    expect(svc.isLoaded()).toBe(true);
  });

  it("refresh handles adt not found (exit code != 0)", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "not found",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()).toEqual([]);
    expect(svc.hasPackages()).toBe(false);
    expect(svc.isLoaded()).toBe(true);
  });

  it("refresh concurrent call protection (isLoading guard)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let notifyEntered!: () => void;
    const enteredRunTool = new Promise<void>((r) => {
      notifyEntered = r;
    });
    mocks.mockRunTool.mockImplementation(async () => {
      notifyEntered();
      await gate;
      return { exitCode: 0, stdout: ADT_OUTPUT, stderr: "" };
    });
    const svc = DevToolsService.getInstance();
    const p1 = svc.refresh();
    await enteredRunTool;
    const p2 = svc.refresh();
    await p2;
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
    release();
    await p1;
    expect(svc.getPackages().length).toBe(6);
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
  });

  it("getPackages returns loaded packages", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: ADT_OUTPUT,
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()[0]).toEqual({ name: "ansible-builder", version: "24.2.0" });
  });

  it("hasPackages returns true or false correctly", async () => {
    const svc = DevToolsService.getInstance();
    expect(svc.hasPackages()).toBe(false);
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: ADT_OUTPUT,
      stderr: "",
    });
    await svc.refresh();
    expect(svc.hasPackages()).toBe(true);
  });

  it("getPackage finds by name", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: ADT_OUTPUT,
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackage("ansible-lint")).toEqual({ name: "ansible-lint", version: "24.2.0" });
  });

  it("getPackage returns undefined for unknown name", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: ADT_OUTPUT,
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackage("not-a-package")).toBeUndefined();
  });

  it("setTerminalServiceFactory stores the factory", () => {
    const factory = vi.fn(() => ({}));
    DevToolsService.setTerminalServiceFactory(factory);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((DevToolsService as any).terminalServiceFactory).toBe(factory);
  });

  it("install throws when not in vscode", async () => {
    const svc = DevToolsService.getInstance();
    await expect(svc.install()).rejects.toThrow("install is only available in VS Code");
  });

  it("isInVSCode is false in test environment", () => {
    expect(DevToolsService.getInstance().isInVSCode()).toBe(false);
  });

  it("upgrade throws when not in VS Code", async () => {
    const svc = DevToolsService.getInstance();
    await expect(svc.upgrade()).rejects.toThrow("upgrade is only available in VS Code");
  });

  it("refresh clears packages when runTool throws", async () => {
    mocks.mockRunTool.mockRejectedValue(new Error("spawn failed"));
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()).toEqual([]);
    expect(svc.isLoaded()).toBe(true);
  });

  it("isLoading and isLoaded state transitions", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let notifyEntered!: () => void;
    const enteredRunTool = new Promise<void>((r) => {
      notifyEntered = r;
    });
    mocks.mockRunTool.mockImplementation(async () => {
      notifyEntered();
      await gate;
      return { exitCode: 0, stdout: ADT_OUTPUT, stderr: "" };
    });
    const svc = DevToolsService.getInstance();
    expect(svc.isLoading()).toBe(false);
    expect(svc.isLoaded()).toBe(false);
    const p = svc.refresh();
    await enteredRunTool;
    expect(svc.isLoading()).toBe(true);
    release();
    await p;
    expect(svc.isLoading()).toBe(false);
    expect(svc.isLoaded()).toBe(true);
  });

  it("hasPackages returns false when no packages loaded", () => {
    const svc = DevToolsService.getInstance();
    expect(svc.hasPackages()).toBe(false);
  });

  it("getPackage returns undefined when package not found", () => {
    const svc = DevToolsService.getInstance();
    expect(svc.getPackage("nonexistent")).toBeUndefined();
  });

  it("getPackage returns the package when found", async () => {
    mocks.mockRunTool.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ansible-lint 6.0.0\nansible-navigator 3.0.0\n",
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackage("ansible-lint")).toEqual({ name: "ansible-lint", version: "6.0.0" });
  });

  it("refresh handles adt failure with non-zero exit code", async () => {
    mocks.mockRunTool.mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "not found" });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()).toEqual([]);
    expect(svc.isLoaded()).toBe(true);
  });

  it("refresh handles thrown errors gracefully", async () => {
    mocks.mockRunTool.mockRejectedValueOnce(new Error("spawn failed"));
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()).toEqual([]);
  });

  it("refresh skips lines that don't match expected format", async () => {
    mocks.mockRunTool.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ansible-lint 6.0.0\n  some extra info\nansible-navigator 3.0.0\n",
      stderr: "",
    });
    const svc = DevToolsService.getInstance();
    await svc.refresh();
    expect(svc.getPackages()).toHaveLength(2);
  });

  it("isInVSCode returns false in test environment", () => {
    const svc = DevToolsService.getInstance();
    expect(svc.isInVSCode()).toBe(false);
  });

  it("install throws when not in VS Code", async () => {
    const svc = DevToolsService.getInstance();
    await expect(svc.install()).rejects.toThrow("install is only available in VS Code");
  });

  it("upgrade throws when not in VS Code", async () => {
    const svc = DevToolsService.getInstance();
    await expect(svc.upgrade()).rejects.toThrow("upgrade is only available in VS Code");
  });
});
