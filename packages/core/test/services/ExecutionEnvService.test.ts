import { describe, it, expect, vi, beforeEach } from "vitest";

const EE_LIST = [
  {
    created: "2024-01-01",
    execution_environment: true,
    full_name: "quay.io/ansible/ee-supported:latest",
    image_id: "abc123",
  },
  {
    created: "2024-01-01",
    execution_environment: false,
    full_name: "python:3.11",
    image_id: "def456",
  },
  {
    created: "2024-01-01",
    execution_environment: true,
    full_name: "quay.io/ansible/ee-minimal:latest",
    image_id: "ghi789",
  },
];

const EE_DETAILS = {
  ansible_collections: {
    details: { "ansible.builtin": "2.15.0", "community.general": "7.0.0" },
  },
  ansible_version: { details: "ansible [core 2.15.0]" },
  os_release: {
    details: [
      {
        "pretty-name": "Red Hat Enterprise Linux 9.2",
        name: "RHEL",
        version: "9.2",
      },
    ],
  },
  python_packages: {
    details: [
      { name: "ansible-core", version: "2.15.0" },
      { name: "jinja2", version: "3.1.2" },
    ],
  },
  image_name: "quay.io/ansible/ee-supported:latest",
};

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

import { ExecutionEnvService } from "../../src/services/ExecutionEnvService";

function resetExecutionEnvSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ExecutionEnvService as any)._instance = undefined;
}

describe("ExecutionEnvService", () => {
  beforeEach(() => {
    resetExecutionEnvSingleton();
    mocks.mockRunTool.mockReset();
    mocks.getCommandService.mockClear();
    mocks.getCommandService.mockImplementation(() => ({
      runTool: mocks.mockRunTool,
    }));
  });

  it("getInstance returns the same singleton", () => {
    const a = ExecutionEnvService.getInstance();
    const b = ExecutionEnvService.getInstance();
    expect(a).toBe(b);
  });

  it("loadExecutionEnvironments parses navigator JSON and filters EEs", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_LIST),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const list = await svc.loadExecutionEnvironments();
    expect(mocks.mockRunTool).toHaveBeenCalledWith("ansible-navigator", [
      "images",
      "--mode",
      "stdout",
      "--pull-policy",
      "never",
      "--format",
      "json",
    ]);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.full_name).sort()).toEqual(
      ["quay.io/ansible/ee-minimal:latest", "quay.io/ansible/ee-supported:latest"].sort(),
    );
    expect(svc.isLoaded()).toBe(true);
  });

  it("loadExecutionEnvironments handles empty output", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const list = await svc.loadExecutionEnvironments();
    expect(list).toEqual([]);
    expect(svc.getExecutionEnvironments()).toEqual([]);
    expect(svc.isLoaded()).toBe(true);
  });

  it("loadExecutionEnvironments concurrent call protection", async () => {
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
      return { exitCode: 0, stdout: JSON.stringify(EE_LIST), stderr: "" };
    });
    const svc = ExecutionEnvService.getInstance();
    const p1 = svc.loadExecutionEnvironments();
    await enteredRunTool;
    const p2 = svc.loadExecutionEnvironments();
    await p2;
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
    release();
    await p1;
    expect(svc.getExecutionEnvironments()).toHaveLength(2);
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
  });

  it("loadDetails fetches and caches details", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const name = "quay.io/ansible/ee-supported:latest";
    const d = await svc.loadDetails(name);
    expect(d).toEqual(EE_DETAILS);
    expect(mocks.mockRunTool).toHaveBeenCalledWith("ansible-navigator", [
      "images",
      name,
      "--mode",
      "stdout",
      "--pull-policy",
      "never",
      "--details",
      "--format",
      "json",
    ]);
    expect(svc.getCachedDetails(name)).toEqual(EE_DETAILS);
  });

  it("loadDetails returns cached details on second call", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const name = "quay.io/ansible/ee-supported:latest";
    await svc.loadDetails(name);
    mocks.mockRunTool.mockClear();
    const again = await svc.loadDetails(name);
    expect(again).toEqual(EE_DETAILS);
    expect(mocks.mockRunTool).not.toHaveBeenCalled();
  });

  it("getCollections extracts and sorts collections from details", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const cols = await svc.getCollections("quay.io/ansible/ee-supported:latest");
    expect(cols).toEqual([
      { name: "ansible.builtin", version: "2.15.0" },
      { name: "community.general", version: "7.0.0" },
    ]);
  });

  it("getPythonPackages extracts and sorts packages from details", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const pkgs = await svc.getPythonPackages("quay.io/ansible/ee-supported:latest");
    expect(pkgs).toEqual([
      { name: "ansible-core", version: "2.15.0" },
      { name: "jinja2", version: "3.1.2" },
    ]);
  });

  it("getInfo extracts ansible version, OS, and image name", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const info = await svc.getInfo("quay.io/ansible/ee-supported:latest");
    expect(info.ansible).toBe("ansible [core 2.15.0]");
    expect(info.os).toBe("Red Hat Enterprise Linux 9.2");
    expect(info.image).toBe("quay.io/ansible/ee-supported:latest");
  });

  it("isInVSCode is false in test environment", () => {
    expect(ExecutionEnvService.getInstance().isInVSCode()).toBe(false);
  });

  it("setLogFunction receives load errors", async () => {
    const log = vi.fn();
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: "not-json-array",
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    svc.setLogFunction(log);
    await expect(svc.loadExecutionEnvironments()).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Error loading execution environments"));
  });

  it("loadExecutionEnvironments returns cached list when already loaded with data", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_LIST),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const first = await svc.loadExecutionEnvironments();
    mocks.mockRunTool.mockClear();
    const second = await svc.loadExecutionEnvironments();
    expect(second).toEqual(first);
    expect(mocks.mockRunTool).not.toHaveBeenCalled();
  });

  it("getExecutionEnvironment finds by full_name", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_LIST),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    await svc.loadExecutionEnvironments();
    const ee = svc.getExecutionEnvironment("quay.io/ansible/ee-supported:latest");
    expect(ee?.image_id).toBe("abc123");
  });

  it("loadDetails returns null when stdout is empty", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    await expect(svc.loadDetails("some:img")).resolves.toBeNull();
  });

  it("getCollections returns empty when details lack ansible_collections", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ image_name: "x" }),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const cols = await svc.getCollections("some:img");
    expect(cols).toEqual([]);
  });

  it("getPythonPackages returns empty when details lack python_packages", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ image_name: "x" }),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const pkgs = await svc.getPythonPackages("some:img");
    expect(pkgs).toEqual([]);
  });

  it("getInfo returns empty object when details are missing", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({}),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    await expect(svc.getInfo("nope:tag")).resolves.toEqual({});
  });

  it("getInfo uses os name when pretty-name is absent", async () => {
    const details = {
      ansible_version: { details: "ansible 1" },
      os_release: { details: [{ name: "Linux", version: "1" }] },
      image_name: "img",
    };
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(details),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    const info = await svc.getInfo("img");
    expect(info.os).toBe("Linux");
  });

  it("refresh clears environments and details cache", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_LIST),
      stderr: "",
    });
    const svc = ExecutionEnvService.getInstance();
    await svc.loadExecutionEnvironments();
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(EE_DETAILS),
      stderr: "",
    });
    await svc.loadDetails("quay.io/ansible/ee-supported:latest");
    expect(svc.getExecutionEnvironments().length).toBeGreaterThan(0);
    expect(svc.getCachedDetails("quay.io/ansible/ee-supported:latest")).toBeDefined();
    await svc.refresh();
    expect(svc.getExecutionEnvironments()).toEqual([]);
    expect(svc.getCachedDetails("quay.io/ansible/ee-supported:latest")).toBeUndefined();
    expect(svc.isLoaded()).toBe(false);
  });
});
