import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_SCHEMA = {
  name: "ansible-creator",
  description: "Ansible Creator CLI",
  subcommands: {
    init: {
      name: "init",
      description: "Initialize Ansible content",
      subcommands: {
        playbook: {
          name: "playbook",
          description: "Initialize a playbook project",
          parameters: {
            type: "object",
            properties: {
              project: { type: "string", description: "Project name" },
              "scm-org": {
                type: "string",
                description: "SCM org",
                aliases: ["--scm-org"],
              },
              "scm-project": {
                type: "string",
                description: "SCM project",
                aliases: ["--scm-project"],
              },
              output: {
                type: "string",
                description: "Output directory",
                aliases: ["-o", "--output"],
              },
            },
            required: ["project"],
          },
        },
        collection: {
          name: "collection",
          description: "Initialize a collection",
          parameters: {
            type: "object",
            properties: {
              collection: { type: "string", description: "Collection name" },
              "init-path": {
                type: "string",
                description: "Init path",
                aliases: ["--init-path"],
              },
            },
            required: ["collection"],
          },
        },
      },
    },
  },
};

const mocks = vi.hoisted(() => {
  const mockRunTool = vi.fn();
  const mockRunAnsibleCreator = vi.fn();
  return {
    mockRunTool,
    mockRunAnsibleCreator,
    getCommandService: vi.fn(() => ({
      runTool: mockRunTool,
      runAnsibleCreator: mockRunAnsibleCreator,
    })),
  };
});

vi.mock("../../src/services/CommandService", () => ({
  getCommandService: mocks.getCommandService,
}));

import { CreatorService } from "../../src/services/CreatorService";

function resetCreatorSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (CreatorService as any)._instance = undefined;
}

describe("CreatorService", () => {
  beforeEach(() => {
    resetCreatorSingleton();
    mocks.mockRunTool.mockReset();
    mocks.mockRunAnsibleCreator.mockReset();
    mocks.getCommandService.mockClear();
    mocks.getCommandService.mockImplementation(() => ({
      runTool: mocks.mockRunTool,
      runAnsibleCreator: mocks.mockRunAnsibleCreator,
    }));
  });

  it("getInstance returns the same singleton", () => {
    const a = CreatorService.getInstance();
    const b = CreatorService.getInstance();
    expect(a).toBe(b);
  });

  it("loadSchema calls CommandService and parses JSON", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    const schema = await svc.loadSchema();
    expect(mocks.mockRunTool).toHaveBeenCalledWith("ansible-creator", ["schema"]);
    expect(schema).toEqual(MOCK_SCHEMA);
    expect(svc.getSchema()).toEqual(MOCK_SCHEMA);
    expect(svc.isLoaded()).toBe(true);
  });

  it("loadSchema handles command failure gracefully", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "schema failed",
    });
    const svc = CreatorService.getInstance();
    const schema = await svc.loadSchema();
    expect(schema).toBeNull();
    expect(svc.isLoaded()).toBe(false);
    expect(svc.getSchema()).toBeNull();
  });

  it("loadSchema handles concurrent calls without duplicate CommandService runs", async () => {
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
      return { exitCode: 0, stdout: JSON.stringify(MOCK_SCHEMA), stderr: "" };
    });
    const svc = CreatorService.getInstance();
    const p1 = svc.loadSchema();
    await enteredRunTool;
    expect(svc.isLoading()).toBe(true);
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
    const p2 = svc.loadSchema();
    const early = await p2;
    expect(early).toBeNull();
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
    release();
    await p1;
    expect(svc.getSchema()).toEqual(MOCK_SCHEMA);
    expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
  });

  it("getCommands returns subcommands at a path", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    const root = svc.getCommands([]);
    expect(root.map((c) => c.name)).toEqual(["init"]);
    const underInit = svc.getCommands(["init"]);
    expect(underInit.map((c) => c.name).sort()).toEqual(["collection", "playbook"]);
    expect(underInit.find((c) => c.name === "playbook")?.hasSubcommands).toBe(false);
  });

  it("getCommands returns empty array for missing path", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.getCommands(["init", "nope"])).toEqual([]);
  });

  it("getCommandParameters returns required and optional split", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    const params = svc.getCommandParameters(["init", "playbook"]);
    expect(params).not.toBeNull();
    expect(params!.required).toEqual(["project"]);
    expect(params!.optional.sort()).toEqual(["output", "scm-org", "scm-project"].sort());
    expect(params!.properties.project).toBeDefined();
  });

  it("getCommandParameters returns null for missing path", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.getCommandParameters([])).toBeNull();
    expect(svc.getCommandParameters(["init", "missing"])).toBeNull();
  });

  it("getCommandDescription returns description at path", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.getCommandDescription(["init", "playbook"])).toBe("Initialize a playbook project");
  });

  it("buildCommandString constructs correct CLI string with positional and flag args", () => {
    const svc = CreatorService.getInstance();
    const s = svc.buildCommandString(
      ["init", "playbook"],
      { project: "myproj", "scm-org": "acme", verbose: true },
      ["project"],
    );
    expect(s).toBe("ansible-creator init playbook myproj --scm-org acme --verbose");
  });

  it("buildCommandString handles boolean flags correctly", () => {
    const svc = CreatorService.getInstance();
    const s = svc.buildCommandString(
      ["init", "playbook"],
      { project: "myproj", force: true, skip: false },
      ["project"],
    );
    expect(s).toBe("ansible-creator init playbook myproj --force");
  });

  it("getPositionalArgs returns params without aliases", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.getPositionalArgs(["init", "playbook"])).toEqual(["project"]);
    expect(svc.getPositionalArgs(["init", "collection"])).toEqual(["collection"]);
  });

  it("refresh clears schema and reloads", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.isLoaded()).toBe(true);
    await svc.refresh();
    expect(mocks.mockRunTool.mock.calls.filter((c) => c[0] === "ansible-creator" && c[1][0] === "schema").length).toBeGreaterThanOrEqual(2);
    expect(svc.getSchema()).toEqual(MOCK_SCHEMA);
  });

  it("isInVSCode is false in test environment", () => {
    expect(CreatorService.getInstance().isInVSCode()).toBe(false);
  });

  it("setLogFunction is used for schema load failures", async () => {
    const log = vi.fn();
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "boom",
    });
    const svc = CreatorService.getInstance();
    svc.setLogFunction(log);
    await svc.loadSchema();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ansible-creator schema failed"));
  });

  it("loadSchema returns null and does not mark loaded when stdout is empty", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    const schema = await svc.loadSchema();
    expect(schema).toBeNull();
    expect(svc.isLoaded()).toBe(false);
  });

  it("loadSchema propagates JSON parse errors", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: "{not-json",
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await expect(svc.loadSchema()).rejects.toThrow();
    expect(svc.isLoading()).toBe(false);
  });

  it("getCommands returns empty when schema is not loaded", () => {
    const svc = CreatorService.getInstance();
    expect(svc.getCommands([])).toEqual([]);
  });

  it("getCommandDescription returns undefined for empty path", async () => {
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(MOCK_SCHEMA),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    expect(svc.getCommandDescription([])).toBeUndefined();
  });

  it("getPositionalArgs returns empty when schema missing", () => {
    expect(CreatorService.getInstance().getPositionalArgs(["init", "playbook"])).toEqual([]);
  });

  it("runCommand uses runAnsibleCreator and returns stdout on success", async () => {
    mocks.mockRunAnsibleCreator.mockResolvedValue({
      exitCode: 0,
      stdout: "done\n",
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    const out = await svc.runCommand(["init", "playbook"], { project: "p" }, ["project"]);
    expect(out.trim()).toBe("done");
    expect(mocks.mockRunAnsibleCreator).toHaveBeenCalled();
  });

  it("runCommand throws when ansible-creator exits non-zero", async () => {
    mocks.mockRunAnsibleCreator.mockResolvedValue({
      exitCode: 2,
      stdout: "",
      stderr: "bad",
    });
    const svc = CreatorService.getInstance();
    await expect(svc.runCommand(["init"], { x: true })).rejects.toThrow(/bad/);
  });

  it("getCommands includes hasSubcommands when nested subcommands exist", async () => {
    const schemaWithNested = {
      name: "root",
      subcommands: {
        outer: {
          name: "outer",
          subcommands: {
            inner: { name: "inner", description: "leaf" },
          },
        },
      },
    };
    mocks.mockRunTool.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(schemaWithNested),
      stderr: "",
    });
    const svc = CreatorService.getInstance();
    await svc.loadSchema();
    const cmds = svc.getCommands(["outer"]);
    expect(cmds.find((c) => c.name === "inner")?.hasSubcommands).toBe(false);
    expect(svc.getCommands([]).find((c) => c.name === "outer")?.hasSubcommands).toBe(true);
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
      return { exitCode: 0, stdout: JSON.stringify(MOCK_SCHEMA), stderr: "" };
    });
    const svc = CreatorService.getInstance();
    expect(svc.isLoading()).toBe(false);
    expect(svc.isLoaded()).toBe(false);
    const p = svc.loadSchema();
    await enteredRunTool;
    expect(svc.isLoading()).toBe(true);
    release();
    await p;
    expect(svc.isLoading()).toBe(false);
    expect(svc.isLoaded()).toBe(true);
  });
});
