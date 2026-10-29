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

vi.mock("@src/features/contentCreator/utils", () => ({
  getADEVersion: vi.fn(),
  getCreatorVersion: vi.fn(),
  getBinDetail: vi.fn(),
  runCommand: vi.fn(),
}));

vi.mock("@src/features/utils/commandRunner", () => ({
  withInterpreter: vi.fn(),
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
  getADEVersion,
  getCreatorVersion,
  getBinDetail,
  runCommand,
} from "@src/features/contentCreator/utils";
import { withInterpreter } from "@src/features/utils/commandRunner";
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

// The command string handed to withInterpreter (the assembled ansible-creator cmd).
function interpreterCmd(callIndex = 0): string {
  return vi.mocked(withInterpreter).mock.calls[callIndex][1] as string;
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
    initPath: "/tmp/init",
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
    destinationPath: "/tmp/proj",
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
    vi.mocked(getCreatorVersion).mockResolvedValue("26.2.0");
    vi.mocked(getADEVersion).mockResolvedValue("25.4.0");
    vi.mocked(getBinDetail).mockResolvedValue("ade 25.4.0" as never);
    vi.mocked(runCommand).mockResolvedValue({
      output: "creator-output\n",
      status: "passed",
    } as never);
    vi.mocked(withInterpreter).mockImplementation(
      async (_settings: unknown, command: string) =>
        ({ command, env: { TEST: "1" } }) as never,
    );
    ops = new AnsibleCreatorOperations();
  });

  describe("checkVersionWithError", () => {
    const call = (cur: string, req: string) =>
      (
        ops as unknown as {
          checkVersionWithError: (
            c: string,
            r: string,
          ) => { isGte: boolean; userMessage?: string };
        }
      ).checkVersionWithError(cur, req);

    it("returns isGte true for a valid semver that satisfies the requirement", () => {
      expect(call("25.5.0", "25.4.0")).toEqual({ isGte: true });
    });

    it("coerces a non-strict version like 'v25.4'", () => {
      expect(call("v25.4", "25.0.0")).toEqual({ isGte: true });
    });

    it("returns userMessage for an un-parseable version", () => {
      expect(call("garbage", "1.0.0")).toEqual({
        isGte: false,
        userMessage: "Invalid version format: garbage.\n",
      });
    });

    it("hits the catch arm when semver.gte throws", () => {
      vi.mocked(semver.gte).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      expect(call("1.2.3", "1.0.0")).toEqual({
        isGte: false,
        userMessage: "Invalid version format: 1.2.3.\n",
      });
    });

    it("returns isGte false when current version is below required", () => {
      expect(call("24.0.0", "25.0.0")).toEqual({ isGte: false });
    });

    it("returns isGte true for an exact match", () => {
      expect(call("26.2.0", "26.2.0")).toEqual({ isGte: true });
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
      vi.mocked(getCreatorVersion).mockResolvedValue("25.0.0");
      const web = makeWeb();
      const result = await callGate(ops, web, " to add the role resource", {
        projectUrl: "/tmp",
      });
      expect(result).toEqual({ passed: false });
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed to add the role resource is 26.2.0",
      );
      expect(lastOutput(web)).toContain("25.0.0");
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
    it("reports failure and skips runCommand when ansible-creator is missing", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("failed");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("ansible-creator is not installed");
    });

    it("adds --overwrite and the correct verbosity flag, defaulting the collection path", async () => {
      const web = makeWeb();
      await ops.runRoleAddCommand(
        rolePayload({ isOverwritten: true, verbosity: "high" }),
        web,
      );
      expect(interpreterCmd()).toContain("--overwrite");
      expect(interpreterCmd()).toContain(" -vvv");
      // default destination path used
      expect(lastArgs(web).projectUrl).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it.each([
      ["off", ""],
      ["low", " -v"],
      ["medium", " -vv"],
      ["high", " -vvv"],
      ["bogus", ""],
    ])(
      "maps verbosity %s -> %s and uses --no-overwrite",
      async (verbosity, flag) => {
        const web = makeWeb();
        await ops.runRoleAddCommand(
          rolePayload({ verbosity, isOverwritten: false }),
          web,
        );
        const cmd = interpreterCmd();
        expect(cmd).toContain("--no-overwrite");
        if (flag) {
          expect(cmd).toContain(flag);
        }
      },
    );

    it("runs the command when the version gate passes", async () => {
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(lastArgs(web).status).toBe("passed");
      expect(lastOutput(web)).toContain("creator-output");
    });

    it("emits the minimum-version message when the gate fails without a userMessage", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("25.3.0");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(withInterpreter).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed to add the role resource is 26.2.0",
      );
    });

    it("appends the userMessage when the version is un-parseable", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("garbage");
      const web = makeWeb();
      await ops.runRoleAddCommand(rolePayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(withInterpreter).not.toHaveBeenCalled();
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
      expect(lastOutput(web)).not.toContain("Minimum ansible-creator version");
    });

    it("uses a custom collectionPath when provided", async () => {
      const web = makeWeb();
      await ops.runRoleAddCommand(
        rolePayload({ collectionPath: "/custom/path" }),
        web,
      );
      expect(interpreterCmd()).toContain("/custom/path");
      expect(lastArgs(web).projectUrl).toBe("/custom/path");
    });
  });

  describe("runPluginAddCommand", () => {
    it("reports failure and skips runCommand when ansible-creator is missing", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue(undefined as never);
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
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
        expect(runCommand).toHaveBeenCalledTimes(1);
        const cmd = interpreterCmd();
        expect(cmd).toContain(`add plugin ${pluginType}`);
        expect(cmd).toContain("--overwrite");
        expect(cmd).toContain(" -v");
        expect(lastArgs(web).status).toBe("passed");
      },
    );

    it("emits the minimum-version message for a plugin when the gate fails", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("24.0.0");
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload({ pluginType: "test" }), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(withInterpreter).not.toHaveBeenCalled();
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
      expect(interpreterCmd()).toContain("/my/plugins");
      expect(lastArgs(web).projectUrl).toBe("/my/plugins");
    });

    it("defaults the collection path when collectionPath is empty", async () => {
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload({ collectionPath: "" }), web);
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
      const cmd = interpreterCmd();
      expect(cmd).toContain("--no-overwrite");
      expect(cmd).toContain(" -vv");
    });

    it("appends userMessage when version is un-parseable", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("not-a-version");
      const web = makeWeb();
      await ops.runPluginAddCommand(pluginPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
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
      const cmd = interpreterCmd();
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
      const cmd = interpreterCmd();
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

    it("falls back to default initPath when collection initPath is empty", async () => {
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload({ initPath: "" }), web);
      expect(interpreterCmd()).toContain(
        "/.ansible/collections/ansible_collections",
      );
    });

    it("creator-missing early return for a collection payload", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("failed");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(lastArgs(web).collectionUrl).toBeDefined();
      expect(lastArgs(web).projectUrl).toBeUndefined();
      expect(lastArgs(web).status).toBe("failed");
    });

    it("creator-missing early return for a project payload", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("failed");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(lastArgs(web).projectUrl).toBeDefined();
      expect(lastArgs(web).collectionUrl).toBeUndefined();
    });

    it.each([
      ["26.2.0", true, "--overwrite"],
      ["26.4.0", false, "--no-overwrite"],
    ])(
      "overwrite matrix version=%s isOverwritten=%s -> %s",
      async (version, isOverwritten, expected) => {
        vi.mocked(getCreatorVersion).mockResolvedValue(version);
        const web = makeWeb();
        await ops.runInitCommand(projectPayload({ isOverwritten }), web);
        expect(interpreterCmd()).toContain(expected);
      },
    );

    it("rejects ansible-creator below the minimum version for a project", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("25.5.0");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload({ isOverwritten: true }), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(withInterpreter).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed is 26.2.0",
      );
      expect(lastOutput(web)).toContain("25.5.0");
      expect(lastArgs(web).projectUrl).toBeDefined();
      expect(lastArgs(web).collectionUrl).toBeUndefined();
    });

    it("rejects ansible-creator below the minimum version for a collection", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("25.5.0");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(withInterpreter).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain(
        "Minimum ansible-creator version needed is 26.2.0",
      );
      expect(lastArgs(web).collectionUrl).toBeDefined();
      expect(lastArgs(web).projectUrl).toBeUndefined();
    });

    it("rejects an un-parseable ansible-creator version before running", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("garbage");
      const web = makeWeb();
      await ops.runInitCommand(projectPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
    });

    it("rejects an un-parseable version for a collection", async () => {
      vi.mocked(getCreatorVersion).mockResolvedValue("garbage");
      const web = makeWeb();
      await ops.runInitCommand(collectionPayload(), web);
      expect(runCommand).not.toHaveBeenCalled();
      expect(lastArgs(web).status).toBe("failed");
      expect(lastOutput(web)).toContain("Invalid version format: garbage.");
      expect(lastArgs(web).collectionUrl).toBeDefined();
    });

    it("omits log flags when logToFile is false", async () => {
      const web = makeWeb();
      await ops.runInitCommand(projectPayload({ logToFile: false }), web);
      expect(interpreterCmd()).not.toContain("--lf=");
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
      const cmd = interpreterCmd();
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
      const cmd = interpreterCmd();
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
      const cmd = interpreterCmd();
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
      const cmd = interpreterCmd();
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
      const cmd = interpreterCmd();
      expect(cmd).toContain("--ll=warning");
    });

    it("installs in editable mode when ADE version is high enough", async () => {
      vi.mocked(getADEVersion).mockResolvedValue("25.4.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      // second withInterpreter call is the ADE command with --im=cfg
      const adeCmd = vi.mocked(withInterpreter).mock.calls[1][1] as string;
      expect(adeCmd).toContain("--im=cfg");
      // runCommand called for both creator and ADE
      expect(runCommand).toHaveBeenCalledTimes(2);
    });

    it("reports the editable-mode failure when ADE version is too low", async () => {
      vi.mocked(getADEVersion).mockResolvedValue("1.0.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: true }),
        web,
      );
      expect(lastOutput(web)).toContain(
        "Collection could not be installed in editable mode",
      );
      // only the creator command ran
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    it("skips the ADE block when editable mode is disabled", async () => {
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({ isEditableModeInstall: false }),
        web,
      );
      expect(getADEVersion).not.toHaveBeenCalled();
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    it("includes verbosity in the ADE editable-mode command", async () => {
      vi.mocked(getADEVersion).mockResolvedValue("25.4.0");
      const web = makeWeb();
      await ops.runInitCommand(
        collectionPayload({
          isEditableModeInstall: true,
          verbosity: "medium",
        }),
        web,
      );
      const adeCmd = vi.mocked(withInterpreter).mock.calls[1][1] as string;
      expect(adeCmd).toContain(" -vv");
    });

    it("posts in-progress status during editable mode install", async () => {
      vi.mocked(getADEVersion).mockResolvedValue("25.4.0");
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
      vi.mocked(getADEVersion).mockResolvedValue("24.0.0");
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
  });

  describe("version-syntax command builders", () => {
    it("getCollectionCreatorCommand uses the current init syntax", () => {
      const cmd = ops.getCollectionCreatorCommand("ns", "col", "/tmp");
      expect(cmd).toBe("ansible-creator init collection ns.col /tmp --no-ansi");
    });

    it("getPlaybookCreatorCommand uses the current init syntax", () => {
      const cmd = ops.getPlaybookCreatorCommand("ns", "col", "/tmp");
      expect(cmd).toBe("ansible-creator init playbook ns.col /tmp --no-ansi");
    });

    it("getRoleCreatorCommand uses add resource role syntax", () => {
      const cmd = ops.getRoleCreatorCommand("myrole", "/tmp/dest");
      expect(cmd).toBe(
        "ansible-creator add resource role myrole /tmp/dest --no-ansi",
      );
    });

    it("getPluginCreatorCommand uses add plugin syntax", () => {
      const cmd = ops.getPluginCreatorCommand("myplugin", "module", "/tmp/p");
      expect(cmd).toBe(
        "ansible-creator add plugin module myplugin /tmp/p --no-ansi",
      );
    });
  });
});
