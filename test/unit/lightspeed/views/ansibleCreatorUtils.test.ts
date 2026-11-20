import * as fs from "node:fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as semver from "semver";
import type { Webview } from "vscode";

// Use an elaborate vscode mock so Uri.parse/joinPath behave like the real API
// (the shared mocks/vscode.ts returns undefined from Uri.parse which breaks the
// collection path logic in runInitCommand).
vi.mock("vscode", () => {
  const Uri = {
    parse: (s: string) => ({ path: s, fsPath: s, toString: () => s }),
    joinPath: (base: { path?: string; fsPath?: string }, ...segs: string[]) => {
      const joined = [base.path ?? base.fsPath ?? "", ...segs].join("/");
      return { path: joined, fsPath: joined, toString: () => joined };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class Webview {}
  return { Uri, Webview };
});

// Real semver for everything; just make the named exports overridable so we can
// force gte() to throw for the catch-arm test.
vi.mock("semver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("semver")>();
  return {
    ...actual,
    default: actual,
    valid: vi.fn(actual.valid),
    coerce: vi.fn(actual.coerce),
    gte: vi.fn(actual.gte),
  };
});

vi.mock("@src/features/contentCreator/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@src/features/contentCreator/utils")>();
  return {
    ...actual,
    getADEVersion: vi.fn(),
    getCreatorVersion: vi.fn(),
    getBinDetail: vi.fn(),
    runCommandArgv: vi.fn(),
  };
});

vi.mock("@src/features/utils/commandRunner", () => ({
  withInterpreterArgv: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => "namespace: ns\nname: col\nauthors:\n  - me\n"),
  realpathSync: vi.fn((targetPath: string) => targetPath),
}));

vi.mock("@src/settings", () => ({
  SettingsManager: class {
    settings = {};
    async initialize() {
      /* no-op */
    }
  },
}));

// Import after mocks
import { AnsibleCreatorOperations } from "@src/features/lightspeed/vue/views/ansibleCreatorUtils";
import {
  checkAnsibleCreatorVersion,
  checkToolVersionWithError,
} from "@src/features/contentCreator/ansibleCreatorVersion";
import { ANSIBLE_CREATOR_VERSION_MIN } from "@src/definitions/constants";
import {
  getADEVersion,
  getCreatorVersion,
  getBinDetail,
  runCommandArgv,
} from "@src/features/contentCreator/utils";
import { withInterpreterArgv } from "@src/features/utils/commandRunner";
import type {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
} from "@src/features/contentCreator/types";

// Intersect with Webview so the fake is assignable to the SUT's
// vscode.Webview parameters, while keeping postMessage typed as a vi mock.
type Web = Webview & { postMessage: ReturnType<typeof vi.fn> };

function makeWeb(): Web {
  return { postMessage: vi.fn() } as unknown as Web;
}

// Returns the commandOutput of the last execution-log postMessage.
function lastOutput(web: Web): string {
  const calls = web.postMessage.mock.calls;
  return calls[calls.length - 1][0].arguments.commandOutput as string;
}

function lastArgs(web: Web): Record<string, unknown> {
  const calls = web.postMessage.mock.calls;
  return calls[calls.length - 1][0].arguments as Record<string, unknown>;
}

function isVersionProbeArgs(args: string[]): boolean {
  return args.length === 1 && args[0] === "--version";
}

function creatorRunArgs(callIndex = 0): string[] {
  const call = creatorRunCommandArgvCalls()[callIndex];
  return call ? (call[1] as string[]) : [];
}

function creatorRunCmd(callIndex = 0): string {
  const call = creatorRunCommandArgvCalls()[callIndex];
  if (!call) {
    return "";
  }
  return [call[0] as string, ...(call[1] as string[])].join(" ");
}

function adeInstallRunArgv(): string[] | undefined {
  const adeRun = creatorRunCommandArgvCalls().find(
    ([exe, args]) => exe === "ade" && args[0] === "install",
  );
  return adeRun?.[1];
}

function creatorRunCommandArgvCalls(): ReturnType<
  typeof vi.mocked<typeof runCommandArgv>
>["mock"]["calls"] {
  return vi
    .mocked(runCommandArgv)
    .mock.calls.filter(([, args]) => !isVersionProbeArgs(args));
}

function expectCreatorRunSkipped(): void {
  expect(creatorRunCommandArgvCalls()).toHaveLength(0);
}

function expectCreatorVerbosityFlag(flag: string, callIndex = 0): void {
  const args = creatorRunArgs(callIndex);
  expect(args).toContain(flag);
  const verbosityFlags = args.filter((arg) => /^-v+$/.test(arg));
  expect(verbosityFlags).toEqual([flag]);
}

let probedCreatorVersion = "26.2.0";
let probedAdeVersion = "25.4.0";

function setProbedCreatorVersion(version: string): void {
  probedCreatorVersion = version;
}

function setProbedAdeVersion(version: string): void {
  probedAdeVersion = version;
}

function fixturePath(inputPath: string): string {
  return path.normalize(inputPath);
}

function rolePayload(o: Partial<RoleFormInterface> = {}): RoleFormInterface {
  return {
    roleName: "myrole",
    collectionPath: "",
    verbosity: "off",
    isOverwritten: false,
    ...o,
  };
}

function pluginPayload(
  o: Partial<PluginFormInterface> = {},
): PluginFormInterface {
  return {
    pluginName: "myplugin",
    pluginType: "module",
    collectionPath: "",
    verbosity: "off",
    isOverwritten: false,
    ...o,
  };
}

function collectionPayload(
  o: Partial<AnsibleCollectionFormInterface> = {},
): AnsibleCollectionFormInterface {
  return {
    namespaceName: "ns",
    collectionName: "col",
    initPath: fixturePath("/tmp/init"),
    verbosity: "off",
    logToFile: false,
    logFilePath: "",
    logFileAppend: false,
    logLevel: "debug",
    isOverwritten: false,
    isEditableModeInstall: false,
    ...o,
  };
}

function projectPayload(
  o: Partial<AnsibleProjectFormInterface> = {},
): AnsibleProjectFormInterface {
  return {
    destinationPath: fixturePath("/tmp/proj"),
    namespaceName: "ns",
    collectionName: "col",
    verbosity: "off",
    logToFile: false,
    logFilePath: "",
    logFileAppend: false,
    logLevel: "debug",
    isOverwritten: false,
    ...o,
  };
}

describe("AnsibleCreatorOperations", () => {
  let ops: AnsibleCreatorOperations;

  beforeEach(() => {
    // clearAllMocks wipes call history but keeps the base vi.fn(actual.*)
    // implementations, so real semver behavior is restored after a per-test
    // mockImplementationOnce override is consumed.
    vi.clearAllMocks();
    probedCreatorVersion = "26.2.0";
    probedAdeVersion = "25.4.0";
    vi.mocked(fs.existsSync).mockImplementation((target) => {
      const targetPath = String(target);
      if (targetPath.endsWith("devfile.yaml")) {
        return false;
      }
      return true;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      "namespace: ns\nname: col\nauthors:\n  - me\n",
    );
    vi.mocked(fs.realpathSync).mockImplementation((targetPath) =>
      String(targetPath),
    );
    vi.mocked(getCreatorVersion).mockResolvedValue("26.2.0");
    vi.mocked(getADEVersion).mockResolvedValue("25.4.0");
    vi.mocked(getBinDetail).mockResolvedValue("ade 25.4.0" as never);
    vi.mocked(runCommandArgv).mockImplementation((executable, args) => {
      if (args.length === 1 && args[0] === "--version") {
        const version =
          executable === "ade" ? probedAdeVersion : probedCreatorVersion;
        if (!version || version === "failed") {
          return { output: "", status: "failed" };
        }
        return { output: `${version}\n`, status: "passed" };
      }
      return { output: "creator-output\n", status: "passed" };
    });
    vi.mocked(withInterpreterArgv).mockImplementation(
      async (_settings: unknown, executable: string, args: string[]) =>
        ({ executable, args, env: { TEST: "1" } }) as never,
    );
    ops = new AnsibleCreatorOperations();
  });

  describe("checkAnsibleCreatorVersion", () => {
    it("returns isGte false when current version is below required", () => {
      expect(checkAnsibleCreatorVersion("24.0.0", "25.0.0")).toEqual({
        isGte: false,
      });
    });

    it("returns isGte true for an exact match", () => {
      expect(checkAnsibleCreatorVersion("26.2.0", "26.2.0")).toEqual({
        isGte: true,
      });
    });

    it("rejects PEP 440 prereleases below the required final release", () => {
      expect(
        checkAnsibleCreatorVersion("26.2.0.dev0", ANSIBLE_CREATOR_VERSION_MIN),
      ).toEqual({ isGte: false });
      expect(
        checkAnsibleCreatorVersion("26.2.0rc1", ANSIBLE_CREATOR_VERSION_MIN),
      ).toEqual({ isGte: false });
    });

    it("does not semver-coerce unknown suffixes into a passing release", () => {
      expect(
        checkAnsibleCreatorVersion("26.2.0.foo1", ANSIBLE_CREATOR_VERSION_MIN),
      ).toEqual({
        isGte: false,
        userMessage: "Invalid version format: 26.2.0.foo1.\n",
      });
    });
  });

  describe("checkToolVersionWithError", () => {
    it("returns isGte true for a valid semver that satisfies the requirement", () => {
      expect(checkToolVersionWithError("25.5.0", "25.4.0")).toEqual({
        isGte: true,
      });
    });

    it("coerces a non-strict version like 'v25.4'", () => {
      expect(checkToolVersionWithError("v25.4", "25.0.0")).toEqual({
        isGte: true,
      });
    });

    it("returns userMessage for an un-parseable version", () => {
      expect(checkToolVersionWithError("garbage", "1.0.0")).toEqual({
        isGte: false,
        userMessage: "Invalid version format: garbage.\n",
      });
    });

    it("hits the catch arm when semver.gte throws", () => {
      vi.mocked(semver.gte).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      expect(checkToolVersionWithError("1.2.3", "1.0.0")).toEqual({
        isGte: false,
        userMessage: "Invalid version format: 1.2.3.\n",
      });
    });

    it("reports an invalid creator version when semver.gte throws", () => {
      vi.mocked(semver.gte).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      expect(checkAnsibleCreatorVersion("1.2.3", "1.0.0")).toEqual({
        isGte: false,
        userMessage: "Invalid version format: 1.2.3.\n",
      });
    });
  });

  describe("checkCreatorVersionGate", () => {
    // Access private method for direct testing
    const callGate = (
      instance: AnsibleCreatorOperations,
      webView: Web,
      subject: string,
      urlPayload: Record<string, string | undefined>,
    ) =>
      (
        instance as unknown as {
          checkCreatorVersionGate: (
            w: Web,
            s: string,
            u: Record<string, string | undefined>,
          ) => Promise<{ passed: boolean }>;
        }
      ).checkCreatorVersionGate(webView, subject, urlPayload);

    it("returns passed true when creator version meets minimum", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("26.2.0");
      const web = makeWeb();
      const result = await callGate(ops, web, "", {
        projectUrl: "/tmp",
      });
      expect(result).toEqual({ passed: true });
      expect(web.postMessage).not.toHaveBeenCalled();
    });

    it("returns passed false and posts missing message when creator is not installed", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("failed");
      const web = makeWeb();
      const result = await callGate(ops, web, "", {
        projectUrl: "/tmp",
      });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain(
        "ansible-creator is not installed or not found in PATH",
      );
      expect(lastArgs(web).status).toBe("failed");
      expect(lastArgs(web).projectUrl).toBe("/tmp");
    });

    it("returns passed false when creator returns undefined", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue(undefined as never);
      const web = makeWeb();
      const result = await callGate(ops, web, " to add role", {
        projectUrl: "/tmp/role",
      });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain("ansible-creator is not installed");
    });

    it("returns passed false with version message when below minimum", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("26.1.0");
      const web = makeWeb();
      const result = await callGate(ops, web, " to add the role resource", {
        projectUrl: "/tmp",
      });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed to add the role resource is 26.2.0",
      );
      expect(lastOutput(web)).toContain("26.1.0");
      expect(lastArgs(web).status).toBe("failed");
    });

    it("returns passed false when version discovery rejects", async () => {
      vi.mocked(getCreatorVersion).mockRejectedValue(
        new Error("interpreter resolution failed"),
      );
      const web = makeWeb();
      const result = await callGate(ops, web, "", { projectUrl: "/tmp" });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain(
        "Failed to resolve the Python environment for ansible-creator",
      );
      expect(lastOutput(web)).not.toContain("interpreter resolution failed");
      expect(lastArgs(web).status).toBe("failed");
    });

    it("reports version discovery failure when the rejection is not an Error", async () => {
      vi.mocked(getCreatorVersion).mockRejectedValue("env down");
      const web = makeWeb();
      const result = await callGate(ops, web, "", { projectUrl: "/tmp" });
      expect(result).toEqual({ passed: false });
      expect(lastArgs(web).status).toBe("failed");
    });

    it("uses userMessage when version is un-parseable", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("garbage");
      const web = makeWeb();
      const result = await callGate(ops, web, "", {
        collectionUrl: "/tmp/col",
      });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
      expect(lastOutput(web)).not.toContain(
        "Minimum ansible-creator version needed",
      );
      expect(lastArgs(web).collectionUrl).toBe("/tmp/col");
    });

    it("spreads urlPayload correctly with both collectionUrl and projectUrl", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("failed");
      const web = makeWeb();
      await callGate(ops, web, "", {
        collectionUrl: "/col",
        projectUrl: undefined,
      });
      expect(lastArgs(web).collectionUrl).toBe("/col");
      expect(lastArgs(web).projectUrl).toBeUndefined();
    });
  });

  describe("runRoleAddCommand", () => {
    it("reports failure and skips runCommandArgv when ansible-creator is missing", async () => {
      setProbedCreatorVersion("failed");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("ansible-creator is not installed");
    });

    it("adds --overwrite and the correct verbosity flag, defaulting the collection path", async () => {
      const web = makeWeb();
      await ops.runRoleAddCommand(
        rolePayload({ isOverwritten: true, verbosity: "high" }),
        web,
      );
      expect(creatorRunCmd()).toContain("--overwrite");
      expect(creatorRunCmd()).toContain("-vvv");
      // default destination path used
      expect(lastArgs(web).projectUrl).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it.each([
      ["off", ""],
      ["low", "-v"],
      ["medium", "-vv"],
      ["high", "-vvv"],
      ["bogus", ""],
    ])(
      "maps verbosity %s -> %s and uses --no-overwrite",
      async (verbosity, flag) => {
        const web = makeWeb();
        await ops.runRoleAddCommand(
          rolePayload({ verbosity, isOverwritten: false }),
          web,
        );
        expect(creatorRunArgs().some((a) => a === "--no-overwrite")).toBe(true);
        if (flag) {
          expectCreatorVerbosityFlag(flag);
        }
      },
    );

    it("runs the command when the version gate passes", async () => {
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(1);
      expect(lastArgs(web).status).toBe("passed");
      expect(lastOutput(web)).toContain("creator-output");
    });

    it("posts failed execution-log when withInterpreterArgv rejects after the gate", async () => {
      vi.mocked(withInterpreterArgv).mockRejectedValueOnce(
        new Error("interpreter resolution failed"),
      );
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Failed to resolve the Python environment for ansible-creator",
      );
    });

    it("reports creator command failure in the execution log", async () => {
      vi.mocked(runCommandArgv).mockImplementation((executable, args) => {
        if (isVersionProbeArgs(args)) {
          return { output: `${probedCreatorVersion}\n`, status: "passed" };
        }
        return { output: "creator failed\n", status: "failed" };
      });
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("creator failed");
    });

    it("emits the minimum-version message when the gate fails without a userMessage", async () => {
      setProbedCreatorVersion("25.3.0");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expectCreatorRunSkipped();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed to add the role resource is 26.2.0",
      );
    });

    it("appends the userMessage when the version is un-parseable", async () => {
      setProbedCreatorVersion("garbage");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expectCreatorRunSkipped();
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
      expect(lastOutput(web)).not.toContain("Minimum ansible-creator version");
    });

    it("uses a custom collectionPath when provided", async () => {
      const customPath = path.normalize("/custom/path");
      const web = makeWeb();
      await ops.runRoleAddCommand(
        rolePayload({ collectionPath: customPath }),
        web,
      );
      expect(creatorRunCmd()).toContain(customPath);
      expect(lastArgs(web).projectUrl).toBe(customPath);
    });

    it("expands a tilde collection path before the galaxy.yml check", async () => {
      const web = makeWeb();
      const expected = path.join(os.homedir(), "ns.col");
      await ops.runRoleAddCommand(
        rolePayload({ collectionPath: "~/ns.col" }),
        web,
      );
      expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith(
        path.join(expected, "galaxy.yml"),
      );
      expect(creatorRunCmd()).toContain(expected);
      expect(lastArgs(web).projectUrl).toBe(expected);
    });
  });

  describe("runPluginAddCommand", () => {
    it("reports failure and skips runCommandArgv when ansible-creator is missing", async () => {
      setProbedCreatorVersion("failed");
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("ansible-creator is not installed");
    });

    it.each(["lookup", "filter", "action", "module", "test"])(
      "passes the version gate for plugin type %s",
      async (pluginType) => {
        const web = makeWeb();
        await ops.runPluginAddCommand(
          pluginPayload({ pluginType, isOverwritten: true, verbosity: "low" }),
          web,
        );
        expect(creatorRunCommandArgvCalls()).toHaveLength(1);
        const cmd = creatorRunCmd();
        expect(cmd).toContain(`add plugin ${pluginType}`);
        expect(cmd).toContain("--overwrite");
        expectCreatorVerbosityFlag("-v");
        expect(lastArgs(web).status).toBe("passed");
      },
    );

    it("emits the minimum-version message for a plugin when the gate fails", async () => {
      setProbedCreatorVersion("24.0.0");
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload({ pluginType: "test" }), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expectCreatorRunSkipped();
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed to add the test plugin is 26.2.0",
      );
    });

    it("uses a custom collectionPath when provided", async () => {
      const web = makeWeb();
      await ops.runPluginAddCommand(
        pluginPayload({ collectionPath: "/my/plugins" }),
        web,
      );
      expect(creatorRunCmd()).toContain("/my/plugins");
      expect(lastArgs(web).projectUrl).toBe("/my/plugins");
    });

    it("defaults the collection path when collectionPath is empty", async () => {
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload({ collectionPath: "" }), web);
      expect(lastArgs(web).projectUrl).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it("rejects add when the destination has no galaxy.yml", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload({ collectionPath: "" }), web);
      expectCreatorRunSkipped();
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("galaxy.yml");
      expect(lastArgs(web).projectUrl).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it("applies --no-overwrite and medium verbosity", async () => {
      const web = makeWeb();
      await ops.runPluginAddCommand(
        pluginPayload({ isOverwritten: false, verbosity: "medium" }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("--no-overwrite");
      expect(cmd).toContain("-vv");
    });

    it("appends userMessage when version is un-parseable", async () => {
      setProbedCreatorVersion("not-a-version");
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastOutput(web)).toContain(
        "Invalid version format: not-a-version.",
      );
    });
  });

  describe("runInitCommand", () => {
    it("builds an init-collection command and posts collectionUrl", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ initPath: "/tmp/init" }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("init collection ns.col");
      expect(lastArgs(web).collectionUrl).toBe("/tmp/init");
      expect(lastArgs(web).projectUrl).toBeUndefined();
    });

    it("joins namespace/collection when initPath ends with the collections root", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          initPath: "/home/collections/ansible_collections",
        }),
        web,
      );
      expect(lastArgs(web).collectionUrl).toBe(
        "/home/collections/ansible_collections/ns/col",
      );
    });

    it("builds an init-playbook command and posts projectUrl", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        projectPayload({ destinationPath: "/tmp/proj" }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("init playbook ns.col");
      expect(lastArgs(web).projectUrl).toBe("/tmp/proj");
      expect(lastArgs(web).collectionUrl).toBeUndefined();
    });

    it("falls back to homedir when project destinationPath is empty", async () => {
      const web = makeWeb();
      await ops.runInitCommand(projectPayload({ destinationPath: "" }), web);
      expect(typeof lastArgs(web).projectUrl).toBe("string");
      expect(lastArgs(web).projectUrl).not.toBe("");
    });

    it("expands a tilde init path before building the command", async () => {
      const web = makeWeb();
      const expected = path.join(os.homedir(), "cols");
      await ops.runInitCommand(collectionPayload({ initPath: "~/cols" }), web);
      expect(lastArgs(web).collectionUrl).toBe(expected);
      expect(creatorRunCmd()).toContain(expected);
    });

    it("falls back to default initPath when collection initPath is empty", async () => {
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload({ initPath: "" }), web);
      expect(creatorRunCmd()).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it("creator-missing early return for a collection payload", async () => {
      setProbedCreatorVersion("failed");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).collectionUrl).toBeDefined();
      expect(lastArgs(web).projectUrl).toBeUndefined();
      expect(lastArgs(web).status).toBe("failed");
    });

    it("creator-missing early return for a project payload", async () => {
      setProbedCreatorVersion("failed");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).projectUrl).toBeDefined();
      expect(lastArgs(web).collectionUrl).toBeUndefined();
    });

    it.each([
      ["26.2.0", true, "--overwrite"],
      ["26.4.0", false, "--no-overwrite"],
    ])(
      "overwrite matrix version=%s isOverwritten=%s -> %s",
      async (version, isOverwritten, expected) => {
        setProbedCreatorVersion(version);
        const web = makeWeb();
        await ops.runInitCommand(projectPayload({ isOverwritten }), web);
        expect(creatorRunCmd()).toContain(expected);
      },
    );

    it("rejects ansible-creator below the minimum version for a project", async () => {
      setProbedCreatorVersion("25.5.0");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload({ isOverwritten: true }), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expectCreatorRunSkipped();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed is 26.2.0",
      );
      expect(lastOutput(web)).toContain("25.5.0");
      expect(lastArgs(web).projectUrl).toBeDefined();
      expect(lastArgs(web).collectionUrl).toBeUndefined();
    });

    it("rejects ansible-creator below the minimum version for a collection", async () => {
      setProbedCreatorVersion("25.5.0");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expectCreatorRunSkipped();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed is 26.2.0",
      );
      expect(lastArgs(web).collectionUrl).toBeDefined();
      expect(lastArgs(web).projectUrl).toBeUndefined();
    });

    it("rejects an un-parseable ansible-creator version before running", async () => {
      setProbedCreatorVersion("garbage");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
    });

    it("rejects an un-parseable version for a collection", async () => {
      setProbedCreatorVersion("garbage");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
      expect(lastArgs(web).collectionUrl).toBeDefined();
    });

    it("omits log flags when logToFile is false", async () => {
      const web = makeWeb();
      await ops.runInitCommand(projectPayload({ logToFile: false }), web);
      expect(creatorRunCmd()).not.toContain("--lf=");
    });

    it("uses an explicit log file path for a collection (--la=<append>)", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          logToFile: true,
          logFilePath: "/var/log/c.log",
          logFileAppend: true,
        }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("--lf=/var/log/c.log");
      expect(cmd).toContain("--la=true");
    });

    it("uses --la=false for a collection when logFileAppend is false", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          logToFile: true,
          logFilePath: "/var/log/c.log",
          logFileAppend: false,
        }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("--la=false");
    });

    it("defaults the log file path to tmpdir and uses boolean --la for a project", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        projectPayload({
          logToFile: true,
          logFilePath: "",
          logFileAppend: false,
        }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("ansible-creator.log");
      expect(cmd).toContain("--la=false");
    });

    it("uses --la=true for a project when logFileAppend is true", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        projectPayload({
          logToFile: true,
          logFilePath: "/tmp/log.txt",
          logFileAppend: true,
        }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("--la=true");
      expect(cmd).toContain("--lf=/tmp/log.txt");
    });

    it("includes log level flag when logToFile is true", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        projectPayload({
          logToFile: true,
          logFilePath: "/tmp/log.txt",
          logLevel: "warning",
        }),
        web,
      );
      const cmd = creatorRunCmd();
      expect(cmd).toContain("--ll=warning");
    });

    it("installs in editable mode when ADE version is high enough", async () => {
      setProbedAdeVersion("25.4.0");
      const web = makeWeb();
      const destinationWithSpaces = fixturePath("/tmp/My Collections");
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          initPath: destinationWithSpaces,
        }),
        web,
      );
      const adeArgs = adeInstallRunArgv() ?? [];
      expect(adeArgs).toContain("--im=cfg");
      expect(creatorRunCommandArgvCalls()).toHaveLength(2);
      const adeRun = creatorRunCommandArgvCalls().find(
        ([exe, args]) => exe === "ade" && args[0] === "install",
      );
      expect(adeRun?.[0]).toBe("ade");
      expect(adeRun?.[1]).toEqual(
        expect.arrayContaining([
          "install",
          "--venv",
          path.join(destinationWithSpaces, ".venv"),
          "--editable",
          ".",
          "--no-ansi",
          "--im=cfg",
        ]),
      );
      expect(adeRun?.[2]).toEqual({ TEST: "1" });
      expect(adeRun?.[3]).toBe(destinationWithSpaces);
    });

    it("reports the editable-mode failure when ADE version is too low", async () => {
      setProbedAdeVersion("1.0.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "Collection could not be installed in editable mode",
      );
      // only the creator command ran
      expect(creatorRunCommandArgvCalls()).toHaveLength(1);
    });

    it("skips the ADE block when editable mode is disabled", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: false }),
        web,
      );
      expect(adeInstallRunArgv()).toBeUndefined();
      expect(creatorRunCommandArgvCalls()).toHaveLength(1);
    });

    it("includes verbosity in the ADE editable-mode command", async () => {
      setProbedAdeVersion("25.4.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          verbosity: "medium",
        }),
        web,
      );
      const adeArgs = adeInstallRunArgv() ?? [];
      expect(adeArgs).toContain("-vv");
    });

    it("posts failed execution-log when init interpreter resolution fails", async () => {
      vi.mocked(withInterpreterArgv).mockRejectedValueOnce(
        new Error("no interpreter"),
      );
      const web = makeWeb();
      await ops.runInitCommand(projectPayload(), web);
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Failed to resolve the Python environment for ansible-creator",
      );
    });

    it("marks editable mode failed when the ADE command fails", async () => {
      setProbedAdeVersion("25.4.0");
      vi.mocked(runCommandArgv).mockImplementation((executable, args) => {
        if (isVersionProbeArgs(args)) {
          const version =
            executable === "ade" ? probedAdeVersion : probedCreatorVersion;
          return { output: `${version}\n`, status: "passed" };
        }
        if (executable === "ade") {
          return { output: "ade failed\n", status: "failed" };
        }
        return { output: "creator-output\n", status: "passed" };
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("ade failed");
    });

    it("posts failed final execution-log when ADE version discovery throws", async () => {
      vi.mocked(withInterpreterArgv).mockImplementation(
        async (_settings: unknown, executable: string) => {
          if (executable === "ade") {
            throw new Error("no ade");
          }
          return { executable, args: [], env: { TEST: "1" } };
        },
      );
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Failed to resolve the Python environment for ansible-creator",
      );
    });

    it("reports ADE discovery failure when the rejection is not an Error", async () => {
      vi.mocked(withInterpreterArgv).mockImplementation(
        async (_settings: unknown, executable: string) => {
          if (executable === "ade") {
            throw "ade missing";
          }
          return { executable, args: [], env: { TEST: "1" } };
        },
      );
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
    });

    it("posts failed final execution-log when ADE interpreter resolution fails", async () => {
      setProbedAdeVersion("25.4.0");
      vi.mocked(withInterpreterArgv).mockImplementation(
        async (_settings: unknown, executable: string) => {
          if (executable === "ade") {
            throw new Error("no interpreter");
          }
          return { executable, args: [], env: { TEST: "1" } };
        },
      );
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      const execLogs = web.postMessage.mock.calls
        .map((call) => call[0])
        .filter((msg) => msg.command === "execution-log");
      expect(
        execLogs.filter((msg) => msg.arguments.status === "failed"),
      ).toHaveLength(1);
      expect(lastOutput(web)).toContain(
        "Failed to resolve the Python environment for ansible-creator",
      );
      expect(execLogs.at(-1)?.arguments.status).toBe("failed");
    });

    it("reports ADE interpreter failure when the rejection is not an Error", async () => {
      setProbedAdeVersion("25.4.0");
      vi.mocked(withInterpreterArgv).mockImplementation(
        async (_settings: unknown, executable: string) => {
          if (executable === "ade") {
            throw "no interpreter";
          }
          return { executable, args: [], env: { TEST: "1" } };
        },
      );
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
    });

    it("posts in-progress status during editable mode install", async () => {
      setProbedAdeVersion("25.4.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      // First postMessage is the in-progress status
      const firstCall = web.postMessage.mock.calls[0][0];
      expect(firstCall.arguments.status).toBe("in-progress");
      expect(firstCall.arguments.commandOutput).toContain(
        "installation in progress",
      );
    });

    it("editable mode ADE version too low includes required version info", async () => {
      setProbedAdeVersion("24.0.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "required version of ansible-dev-environment",
      );
      expect(lastOutput(web)).toContain("--isolation-mode=cfg");
      expect(lastOutput(web)).toContain("24.0.0");
    });

    it("skips ADE when collection scaffolding fails", async () => {
      setProbedAdeVersion("25.4.0");
      vi.mocked(runCommandArgv).mockImplementation((executable, args) => {
        if (args.length === 1 && args[0] === "--version") {
          const version =
            executable === "ade" ? probedAdeVersion : probedCreatorVersion;
          return { output: `${version}\n`, status: "passed" };
        }
        return { output: "creator failed\n", status: "failed" };
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(adeInstallRunArgv()).toBeUndefined();
      expect(lastOutput(web)).not.toContain("ansible-dev-environment logs");
    });

    it("reports missing ADE when the version probe returns failed", async () => {
      setProbedAdeVersion("failed");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "ansible-dev-environment (ade) is not installed",
      );
      expect(lastArgs(web).status).toBe("failed");
    });

    it("retries ADE only when the collection scaffold already exists", async () => {
      setProbedAdeVersion("25.4.0");
      const collectionRoot = fixturePath("/tmp/col-root");
      vi.mocked(fs.existsSync).mockImplementation((target) => {
        const targetPath = String(target);
        return (
          targetPath === path.join(collectionRoot, "galaxy.yml") ||
          targetPath === path.join(collectionRoot, "devfile.yaml")
        );
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          initPath: collectionRoot,
        }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "skipping ansible-creator init and running the editable install step only",
      );
      expect(creatorRunCommandArgvCalls()).toHaveLength(1);
      expect(adeInstallRunArgv()).toBeDefined();
      expect(getCreatorVersion).not.toHaveBeenCalled();
    });

    it("rejects ADE resume when an existing collection identity does not match", async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        "namespace: other\nname: col\n",
      );
      const collectionRoot = fixturePath("/tmp/col-root");
      vi.mocked(fs.existsSync).mockImplementation((target) => {
        const targetPath = String(target);
        return (
          targetPath === path.join(collectionRoot, "galaxy.yml") ||
          targetPath === path.join(collectionRoot, "devfile.yaml")
        );
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          initPath: collectionRoot,
        }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "does not match the requested collection",
      );
      expect(lastOutput(web)).toContain(
        "Overwrite cannot replace a different collection identity",
      );
      expect(adeInstallRunArgv()).toBeUndefined();
    });

    it("runs Creator with overwrite when re-scaffolding a matching collection in editable mode", async () => {
      setProbedCreatorVersion("26.2.0");
      setProbedAdeVersion("25.4.0");
      const collectionRoot = fixturePath("/tmp/col-root");
      vi.mocked(fs.existsSync).mockImplementation((target) => {
        const targetPath = String(target);
        return (
          targetPath === path.join(collectionRoot, "galaxy.yml") ||
          targetPath === path.join(collectionRoot, "devfile.yaml")
        );
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          isOverwritten: true,
          initPath: collectionRoot,
        }),
        web,
      );
      expect(lastOutput(web)).not.toContain(
        "skipping ansible-creator init and running the editable install step only",
      );
      const initCalls = creatorRunCommandArgvCalls().filter(([, args]) =>
        args.includes("init"),
      );
      expect(initCalls.length).toBeGreaterThanOrEqual(1);
      expect(initCalls[0]?.[1]).toContain("--overwrite");
    });

    it("rejects identity mismatch even when overwrite is enabled", async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        "namespace: other\nname: col\n",
      );
      const collectionRoot = fixturePath("/tmp/col-root");
      vi.mocked(fs.existsSync).mockImplementation((target) => {
        const targetPath = String(target);
        return (
          targetPath === path.join(collectionRoot, "galaxy.yml") ||
          targetPath === path.join(collectionRoot, "devfile.yaml")
        );
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          isOverwritten: true,
          initPath: collectionRoot,
        }),
        web,
      );
      expect(lastArgs(web).status).toBe("failed");
      expect(creatorRunCommandArgvCalls()).toHaveLength(0);
    });

    it("canonicalizes init paths with realpathSync before building commands", async () => {
      const resolvedRoot = fixturePath("/tmp/collections/ansible_collections");
      const symlink = fixturePath("/tmp/collections-link");
      vi.mocked(fs.realpathSync).mockImplementation((targetPath) => {
        if (String(targetPath) === symlink) {
          return resolvedRoot;
        }
        return String(targetPath);
      });
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload({ initPath: symlink }), web);
      expect(creatorRunCmd()).toContain(resolvedRoot);
      expect(lastArgs(web).collectionUrl).toBe(
        path.join(resolvedRoot, "ns", "col"),
      );
    });

    it("includes ADE retry guidance when editable install fails after scaffold", async () => {
      setProbedAdeVersion("25.4.0");
      vi.mocked(runCommandArgv).mockImplementation((executable, args) => {
        if (isVersionProbeArgs(args)) {
          const version =
            executable === "ade" ? probedAdeVersion : probedCreatorVersion;
          return { output: `${version}\n`, status: "passed" };
        }
        if (executable === "ade") {
          return { output: "ade failed\n", status: "failed" };
        }
        return { output: "creator-output\n", status: "passed" };
      });
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "retry the editable install without re-scaffolding",
      );
    });
  });

  describe("isADEPresent", () => {
    it("posts ADEPresence false when ade is not found", async () => {
      vi.mocked(getBinDetail).mockResolvedValue("failed");
      const web = makeWeb();
      await ops.isADEPresent(web as never);
      expect(web.postMessage).toHaveBeenCalledWith({
        command: "ADEPresence",
        arguments: false,
      });
    });

    it("posts ADEPresence true when ade is found", async () => {
      vi.mocked(getBinDetail).mockResolvedValue("ade 25.4.0" as never);
      const web = makeWeb();
      await ops.isADEPresent(web as never);
      expect(web.postMessage).toHaveBeenCalledWith({
        command: "ADEPresence",
        arguments: true,
      });
    });

    it("posts ADEPresence false when getBinDetail rejects with a non-Error", async () => {
      vi.mocked(getBinDetail).mockRejectedValue("env down");
      const web = makeWeb();
      await ops.isADEPresent(web as never);
      expect(web.postMessage).toHaveBeenCalledWith({
        command: "ADEPresence",
        arguments: false,
      });
    });

    it("posts ADEPresence false when getBinDetail rejects", async () => {
      vi.mocked(getBinDetail).mockRejectedValue(new Error("env failed"));
      const web = makeWeb();
      await ops.isADEPresent(web as never);
      expect(web.postMessage).toHaveBeenCalledWith({
        command: "ADEPresence",
        arguments: false,
      });
    });
  });

  describe("version-syntax command builders", () => {
    it("getCollectionCreatorCommand uses the current init syntax", () => {
      const cmd = ops.getCollectionCreatorCommand("ns", "col", "/tmp");
      expect(cmd).toEqual([
        "init",
        "collection",
        "ns.col",
        "/tmp",
        "--no-ansi",
      ]);
    });

    it("getPlaybookCreatorCommand uses the current init syntax", () => {
      const cmd = ops.getPlaybookCreatorCommand("ns", "col", "/tmp");
      expect(cmd).toEqual(["init", "playbook", "ns.col", "/tmp", "--no-ansi"]);
    });

    it("getRoleCreatorCommand uses add resource role syntax", () => {
      const cmd = ops.getRoleCreatorCommand("myrole", "/tmp/dest");
      expect(cmd).toEqual([
        "add",
        "resource",
        "role",
        "myrole",
        "/tmp/dest",
        "--no-ansi",
      ]);
    });

    it("getRoleCreatorCommand keeps shell metacharacters as literal argv", () => {
      const cmd = ops.getRoleCreatorCommand("role';touch", "/tmp/My Role");
      expect(cmd).toEqual([
        "add",
        "resource",
        "role",
        "role';touch",
        "/tmp/My Role",
        "--no-ansi",
      ]);
    });

    it("getPluginCreatorCommand uses add plugin syntax", () => {
      const cmd = ops.getPluginCreatorCommand("myplugin", "module", "/tmp/p");
      expect(cmd).toEqual([
        "add",
        "plugin",
        "module",
        "myplugin",
        "/tmp/p",
        "--no-ansi",
      ]);
    });
  });
});
