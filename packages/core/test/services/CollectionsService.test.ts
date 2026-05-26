import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const runToolMock = vi.hoisted(() => vi.fn());
const getBinDirMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/CommandService", () => ({
  getCommandService: vi.fn(() => ({
    runTool: runToolMock,
    getBinDir: getBinDirMock,
  })),
}));

import { CollectionsService } from "../../src/services/CollectionsService";

function resetCollectionsSingleton(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (CollectionsService as any)._instance = undefined;
}

describe("CollectionsService", () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  const adeInspectStdout = JSON.stringify({
    "ansible.builtin": {
      path: "/collections/ansible/builtin",
      collection_info: {
        version: "1.0.0",
        authors: ["Ansible"],
        description: "Built-in collection",
      },
    },
  });

  const ansibleDocMetadata = JSON.stringify({
    all: {
      module: {
        "ansible.builtin.copy": {
          doc: {
            collection: "ansible.builtin",
            plugin_name: "ansible.builtin.copy",
            short_description: "Copy files to remote locations",
          },
        },
      },
    },
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-coll-svc-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    getBinDirMock.mockResolvedValue(null);
    runToolMock.mockImplementation(async (toolName: string, _args?: string[]) => {
      if (toolName === "ade") {
        return { exitCode: 0, stdout: adeInspectStdout, stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: ansibleDocMetadata, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unknown tool" };
    });
    resetCollectionsSingleton();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetCollectionsSingleton();
    runToolMock.mockReset();
    getBinDirMock.mockReset();
  });

  it("getInstance returns the same singleton", () => {
    const a = CollectionsService.getInstance();
    const b = CollectionsService.getInstance();
    expect(a).toBe(b);
  });

  it("forceRefresh loads collection and plugin metadata from mocked ansible-doc output", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();

    expect(svc.isLoaded()).toBe(true);
    const coll = svc.getCollection("ansible.builtin");
    expect(coll).toBeDefined();
    expect(coll!.info).toMatchObject({
      name: "ansible.builtin",
      version: "1.0.0",
      authors: ["Ansible"],
      description: "Built-in collection",
      path: "/collections/ansible/builtin",
    });

    const plugins = svc.getPlugins("ansible.builtin", "module");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "copy",
      fullName: "ansible.builtin.copy",
      shortDescription: "Copy files to remote locations",
    });
  });

  it("searchPlugins matches name, fullName, and shortDescription", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();

    const byName = svc.searchPlugins("copy");
    expect(byName.some((r) => r.plugin.name === "copy")).toBe(true);

    const byFqcn = svc.searchPlugins("ansible.builtin.copy");
    expect(byFqcn.length).toBeGreaterThan(0);

    const byDesc = svc.searchPlugins("remote");
    expect(byDesc.length).toBeGreaterThan(0);
  });

  it("listCollectionNames and listPluginTypes expose loaded structure", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();

    expect(svc.listCollectionNames()).toContain("ansible.builtin");
    expect(svc.listPluginTypes("ansible.builtin")).toContain("module");
  });

  it("getCollections returns the live map of loaded collections", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    const m = svc.getCollections();
    expect(m).toBeInstanceOf(Map);
    expect(m).toBe(svc.getCollections());
    expect(m.has("ansible.builtin")).toBe(true);
  });

  it("getCollection returns undefined for unknown collection", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    expect(svc.getCollection("no.such.collection")).toBeUndefined();
  });

  it("getPlugins returns empty array for unknown collection or type", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    expect(svc.getPlugins("missing", "module")).toEqual([]);
    expect(svc.getPlugins("ansible.builtin", "lookup")).toEqual([]);
  });

  it("collects all plugin FQCNs from getCollections", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    const fqdns: string[] = [];
    for (const [, data] of svc.getCollections()) {
      for (const plugins of data.pluginTypes.values()) {
        for (const p of plugins) {
          fqdns.push(p.fullName);
        }
      }
    }
    expect(fqdns).toContain("ansible.builtin.copy");
  });

  it("installCollection calls ade and forceRefreshes on success", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    runToolMock.mockImplementation(async (toolName: string, args: string[]) => {
      if (toolName === "ade" && args[0] === "install") {
        return { exitCode: 0, stdout: "installed", stderr: "" };
      }
      if (toolName === "ade") {
        return { exitCode: 0, stdout: adeInspectStdout, stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: ansibleDocMetadata, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "err" };
    });
    const out = await svc.installCollection("community.docker", "3.0.0", true);
    expect(out).toMatch(/community\.docker|installed/);
    expect(runToolMock).toHaveBeenCalledWith(
      "ade",
      expect.arrayContaining(["install", "community.docker:3.0.0", "--force"]),
    );
  });

  it("installCollection throws when ade fails", async () => {
    const svc = CollectionsService.getInstance();
    runToolMock.mockImplementation(async (toolName: string) => {
      if (toolName === "ade") {
        return { exitCode: 1, stdout: "", stderr: "pip exploded" };
      }
      return { exitCode: 0, stdout: "{}", stderr: "" };
    });
    await expect(svc.installCollection("x.y")).rejects.toThrow(/pip exploded/);
  });

  it("listInstalledCollections parses ansible-galaxy JSON with path keys", async () => {
    const galaxyJson = {
      "/some/path": {
        "community.general": { version: "1.0.0" },
        "ansible.builtin": { version: "2.0.0" },
        "ansible._something": { version: "0.0.1" },
      },
    };
    runToolMock.mockImplementation(async (toolName: string, args: string[]) => {
      if (toolName === "ansible-galaxy" && args.includes("list")) {
        return {
          exitCode: 0,
          stdout: `DEPRECATION WARNING\n${JSON.stringify(galaxyJson)}`,
          stderr: "",
        };
      }
      if (toolName === "ade") {
        return { exitCode: 0, stdout: "{}", stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: '{"all":{}}', stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const svc = CollectionsService.getInstance();
    const list = await svc.listInstalledCollections();
    const names = list.map((c) => c.name).sort();
    expect(names).toContain("community.general");
    expect(names).toContain("ansible.builtin");
    expect(names.some((n) => n.startsWith("ansible._"))).toBe(false);
  });

  it("listInstalledCollections falls back to line parsing when JSON parse fails", async () => {
    runToolMock.mockImplementation(async (toolName: string) => {
      if (toolName === "ansible-galaxy") {
        return {
          exitCode: 0,
          stdout: 'noise\n{"broken": true,}\ncommunity.docker 3.4.5\n',
          stderr: "",
        };
      }
      if (toolName === "ade") {
        return { exitCode: 0, stdout: "{}", stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: '{"all":{}}', stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const svc = CollectionsService.getInstance();
    const list = await svc.listInstalledCollections();
    expect(list.some((c) => c.name === "community.docker" && c.version === "3.4.5")).toBe(true);
  });

  it("forceRefresh catches failure when ansible-doc JSON is invalid", async () => {
    runToolMock.mockImplementation(async (toolName: string) => {
      if (toolName === "ade") {
        return { exitCode: 0, stdout: adeInspectStdout, stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: "{ not valid json", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    expect(svc.isLoaded()).toBe(false);
    expect(svc.listCollectionNames()).toEqual([]);
  });

  it("persists collections-metadata.json cache after forceRefresh", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    const cacheFile = path.join(tmpDir, ".cache", "ansible-environments", "collections-metadata.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    expect(Array.isArray(raw.collections)).toBe(true);
    expect(raw.collections.some((c: { name: string }) => c.name === "ansible.builtin")).toBe(true);
  });

  it("refresh loads from disk cache immediately when file exists", async () => {
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    resetCollectionsSingleton();
    const svc2 = CollectionsService.getInstance();
    const callsBefore = runToolMock.mock.calls.length;
    await svc2.refresh();
    expect(svc2.isLoaded()).toBe(true);
    expect(svc2.listCollectionNames()).toContain("ansible.builtin");
    // Background refresh uses CommandService after refresh() returns; wait so afterEach does not reset the mock mid-flight.
    await vi.waitUntil(() => runToolMock.mock.calls.length >= callsBefore + 2, { timeout: 3000 });
  });

  it("getPluginDocumentation returns null when stdout has no JSON object", async () => {
    runToolMock.mockImplementation(async (toolName: string, args: string[]) => {
      if (toolName === "ansible-doc" && args.join(" ").includes("--metadata-dump")) {
        return { exitCode: 0, stdout: ansibleDocMetadata, stderr: "" };
      }
      if (toolName === "ansible-doc") {
        return { exitCode: 0, stdout: "no json here", stderr: "" };
      }
      if (toolName === "ade") {
        return { exitCode: 0, stdout: adeInspectStdout, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });
    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();
    const doc = await svc.getPluginDocumentation("ansible.builtin.copy", "module");
    expect(doc).toBeNull();
  });

  it("isInVSCode is false in test (standalone) environment", () => {
    expect(CollectionsService.getInstance().isInVSCode()).toBe(false);
  });

  it("getPluginDocumentation parses ansible-doc JSON from stdout", async () => {
    const docPayload = {
      doc: { short_description: "Test module" },
      examples: "- name: ex",
    };
    runToolMock.mockImplementation(async (toolName: string, args: string[]) => {
      if (toolName === "ansible-doc") {
        const joined = args.join(" ");
        if (joined.includes("--metadata-dump")) {
          return { exitCode: 0, stdout: ansibleDocMetadata, stderr: "" };
        }
        return {
          exitCode: 0,
          stdout: `warning: something\n${JSON.stringify({
            "ansible.builtin.copy": docPayload,
          })}`,
          stderr: "",
        };
      }
      if (toolName === "ade") {
        return { exitCode: 0, stdout: adeInspectStdout, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    const svc = CollectionsService.getInstance();
    await svc.forceRefresh();

    const doc = await svc.getPluginDocumentation("ansible.builtin.copy", "module");
    expect(doc).not.toBeNull();
    expect(doc!.doc?.short_description).toBe("Test module");
    expect(doc!.examples).toBe("- name: ex");
  });
});
