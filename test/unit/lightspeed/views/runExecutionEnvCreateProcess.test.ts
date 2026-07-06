import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import * as vscode from "vscode";

// --- Module-level dependencies of the SUT module (mirrors the sibling
// webviewMessageHandlers.test.ts preamble so the import resolves cleanly). ---
vi.mock("@src/extension", () => ({
  lightSpeedManager: {
    apiInstance: {
      playbookGenerationRequest: vi.fn(),
      feedbackRequest: vi.fn(),
    },
    providerManager: { generatePlaybook: vi.fn() },
    settingsManager: {
      settings: {
        lightSpeedService: { provider: "google", modelName: "gpt-4" },
      },
    },
    statusBarProvider: {
      statusBar: { text: "" },
      getLightSpeedStatusBarText: vi.fn().mockResolvedValue("Lightspeed"),
    },
    telemetry: {
      telemetryService: {},
      isTelemetryInit: vi.fn().mockResolvedValue(true),
    },
    lightspeedExplorerProvider: { refreshWebView: vi.fn() },
  },
}));

vi.mock("@src/features/lightspeed/vue/views/lightspeedUtils", async () => {
  const actual = await vi.importActual(
    "@src/features/lightspeed/vue/views/lightspeedUtils",
  );
  return { ...actual };
});

vi.mock("@src/features/lightspeed/vue/views/fileOperations", () => ({
  FileOperations: class {
    openLogFile = vi.fn();
    openFolderInWorkspaceProjects = vi.fn();
    openFolderInWorkspacePlugin = vi.fn();
    openFolderInWorkspaceRole = vi.fn();
    openFolderInWorkspaceDevcontainer = vi.fn();
    openDevfile = vi.fn();
    openFileInEditor = vi.fn();
  },
  openNewPlaybookEditor: vi.fn(),
  getCollectionsFromWorkspace: vi.fn().mockResolvedValue([]),
  getRoleBaseDir: vi.fn(),
  fileExists: vi.fn(),
}));

vi.mock("@src/features/lightspeed/vue/views/ansibleCreatorUtils", () => ({
  AnsibleCreatorOperations: class {
    runInitCommand = vi.fn();
    runPluginAddCommand = vi.fn();
    runRoleAddCommand = vi.fn();
    isADEPresent = vi.fn();
  },
}));

vi.mock("@src/utils/telemetryUtils", () => ({ sendTelemetry: vi.fn() }));

// --- Dependencies exercised by runExecutionEnvCreateProcess itself. ---
vi.mock("fs", async (importActual) => {
  const actual = await importActual<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(), writeFileSync: vi.fn() };
});

vi.mock("@src/features/contentCreator/utils", async (importActual) => {
  const actual =
    await importActual<typeof import("@src/features/contentCreator/utils")>();
  return {
    ...actual,
    expandPath: (p: string) => p,
    runCommand: vi
      .fn()
      .mockResolvedValue({ output: "creator-logs", status: "passed" }),
  };
});

vi.mock("@src/features/utils/commandRunner", async (importActual) => {
  const actual =
    await importActual<typeof import("@src/features/utils/commandRunner")>();
  return {
    ...actual,
    withInterpreter: vi
      .fn()
      .mockResolvedValue({ command: "resolved-cmd", env: {} }),
  };
});

vi.mock("@src/settings", () => ({
  SettingsManager: class {
    settings = {};
    async initialize() {
      /* no-op */
    }
  },
}));

// Import after mocks.
import { WebviewMessageHandlers } from "@src/features/lightspeed/vue/views/webviewMessageHandlers";
import * as fs from "fs";
import { runCommand } from "@src/features/contentCreator/utils";
import type { AnsibleExecutionEnvInterface } from "@src/features/contentCreator/types";

// The SUT method is public; the collaborators we spy on are private. Expose
// them through a structural view so vi.spyOn can target them by name.
interface Handlers {
  runExecutionEnvCreateProcess: (
    payload: AnsibleExecutionEnvInterface,
    webView: vscode.Webview,
  ) => Promise<void>;
  getWorkspaceFolder: () => string;
  generateYAMLFromJSON: (json: unknown, dest: string) => boolean;
  runAnsibleBuilderCommand: (
    cmd: string,
  ) => Promise<{ success: boolean; output: string }>;
}

function basePayload(
  overrides: Partial<AnsibleExecutionEnvInterface> = {},
): AnsibleExecutionEnvInterface {
  return {
    destinationPath: "/dest",
    verbosity: "Off",
    isOverwritten: true,
    isCreateContextEnabled: false,
    isBuildImageEnabled: false,
    isInitEEProjectEnabled: false,
    baseImage: "quay.io/ansible/base:latest",
    customBaseImage: "",
    collections: "",
    systemPackages: "",
    pythonPackages: "",
    tag: "latest",
    ...overrides,
  };
}

describe("runExecutionEnvCreateProcess", () => {
  let handlers: Handlers;
  let webView: vscode.Webview;
  let yamlSpy: MockInstance;
  let builderSpy: MockInstance;

  function lastLog() {
    const calls = vi.mocked(webView.postMessage).mock.calls.map((c) => c[0]);
    return [...calls]
      .reverse()
      .find(
        (m: unknown) => (m as { command?: string }).command === "execution-log",
      ) as { arguments: { commandOutput: string; status: string } };
  }

  function postedCommands() {
    return vi
      .mocked(webView.postMessage)
      .mock.calls.map((c) => (c[0] as { command: string }).command);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    webView = { postMessage: vi.fn() } as unknown as vscode.Webview;
    handlers = new WebviewMessageHandlers() as unknown as Handlers;

    vi.spyOn(handlers, "getWorkspaceFolder").mockReturnValue("/ws");
    yamlSpy = vi.spyOn(handlers, "generateYAMLFromJSON").mockReturnValue(true);
    builderSpy = vi
      .spyOn(handlers, "runAnsibleBuilderCommand")
      .mockResolvedValue({ success: true, output: "builder-out" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it("posts a failed log and skips generation when the file exists and overwrite is off", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ isOverwritten: false }),
      webView,
    );

    expect(yamlSpy).not.toHaveBeenCalled();
    const log = lastLog();
    expect(log.arguments.status).toBe("failed");
    expect(log.arguments.commandOutput).toContain("already exists");
  });

  it("creates the file and enables the open-file button on success", async () => {
    await handlers.runExecutionEnvCreateProcess(basePayload(), webView);

    expect(yamlSpy).toHaveBeenCalledTimes(1);
    const log = lastLog();
    expect(log.arguments.status).toBe("passed");
    expect(log.arguments.commandOutput).toContain(
      "Execution environment file created",
    );
    expect(postedCommands()).toContain("enable-open-file-button");
  });

  it("reports failure and disables the open-file button when YAML generation fails", async () => {
    yamlSpy.mockReturnValue(false);
    await handlers.runExecutionEnvCreateProcess(basePayload(), webView);

    const log = lastLog();
    expect(log.arguments.status).toBe("failed");
    expect(log.arguments.commandOutput).toContain(
      "Could not create execution environment file",
    );
    expect(postedCommands()).toContain("disable-open-file-button");
  });

  it("includes collections, system/python packages and tag in the definition", async () => {
    await handlers.runExecutionEnvCreateProcess(
      basePayload({
        collections: "ns.one, ns.two",
        systemPackages: "gcc,make",
        pythonPackages: "requests",
        tag: "v1",
      }),
      webView,
    );

    const json = yamlSpy.mock.calls[0][0] as {
      dependencies: {
        galaxy?: { collections: { name: string }[] };
        system?: string[];
        python?: string[];
      };
      options: { tags: string[] };
    };
    expect(json.dependencies.galaxy?.collections).toEqual([
      { name: "ns.one" },
      { name: "ns.two" },
    ]);
    expect(json.dependencies.system).toEqual(["gcc", "make"]);
    expect(json.dependencies.python).toEqual(["requests"]);
    expect(json.options.tags).toEqual(["v1"]);
  });

  it("omits empty dependency groups", async () => {
    await handlers.runExecutionEnvCreateProcess(basePayload(), webView);
    const json = yamlSpy.mock.calls[0][0] as {
      dependencies: Record<string, unknown>;
    };
    expect(json.dependencies.galaxy).toBeUndefined();
    expect(json.dependencies.system).toBeUndefined();
    expect(json.dependencies.python).toBeUndefined();
  });

  it("adds fedora build steps and the dnf5 package manager", async () => {
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ baseImage: "quay.io/fedora/fedora:latest" }),
      webView,
    );
    const json = yamlSpy.mock.calls[0][0] as {
      additional_build_steps?: { prepend_base: string[] };
      options: { package_manager_path?: string };
    };
    expect(json.additional_build_steps?.prepend_base).toEqual([
      "RUN $PKGMGR -y -q install python3-devel",
    ]);
    expect(json.options.package_manager_path).toBe("/usr/bin/dnf5");
  });

  it("uses microdnf for rhel/redhat base images", async () => {
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ baseImage: "registry.redhat.io/rhel9:latest" }),
      webView,
    );
    const json = yamlSpy.mock.calls[0][0] as {
      options: { package_manager_path?: string };
    };
    expect(json.options.package_manager_path).toBe("/usr/bin/microdnf");
  });

  it("falls back to customBaseImage when baseImage is empty", async () => {
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ baseImage: "", customBaseImage: "my/custom:1" }),
      webView,
    );
    const json = yamlSpy.mock.calls[0][0] as {
      images: { base_image: { name: string } };
    };
    expect(json.images.base_image.name).toBe("my/custom:1");
  });

  it("runs create-context and sets the result from the builder outcome", async () => {
    builderSpy.mockResolvedValue({ success: true, output: "ctx-out" });
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ isCreateContextEnabled: true }),
      webView,
    );
    expect(builderSpy).toHaveBeenCalledWith(
      expect.stringContaining("ansible-builder create"),
    );
    expect(lastLog().arguments.status).toBe("passed");
  });

  it("marks the result failed when create-context fails", async () => {
    builderSpy.mockResolvedValue({ success: false, output: "ctx-err" });
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ isCreateContextEnabled: true }),
      webView,
    );
    expect(lastLog().arguments.status).toBe("failed");
  });

  it("builds the image with the verbosity flag when enabled", async () => {
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ isBuildImageEnabled: true, verbosity: "Medium" }),
      webView,
    );
    expect(builderSpy).toHaveBeenCalledWith(
      expect.stringContaining("ansible-builder build"),
    );
    expect(builderSpy).toHaveBeenCalledWith(expect.stringContaining(" -vv"));
  });

  it("runs the init-EE-project command and replaces output with creator logs", async () => {
    vi.mocked(runCommand).mockResolvedValue({
      output: "init-ee-logs",
      status: "passed",
    });
    await handlers.runExecutionEnvCreateProcess(
      basePayload({ isInitEEProjectEnabled: true, isOverwritten: true }),
      webView,
    );
    const log = lastLog();
    expect(log.arguments.commandOutput).toContain("init-ee-logs");
    expect(log.arguments.status).toBe("passed");
  });

  it("posts a failed log from the catch block when an error is thrown", async () => {
    yamlSpy.mockImplementation(() => {
      throw new Error("boom");
    });
    await handlers.runExecutionEnvCreateProcess(basePayload(), webView);
    const log = lastLog();
    expect(log.arguments.status).toBe("failed");
    expect(log.arguments.commandOutput).toContain("boom");
    expect(postedCommands()).toContain("enable-build-button");
  });
});
