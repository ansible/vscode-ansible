import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { makeConfigurationMiddleware } from "@src/extension";
import type { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";
import type {
  CancellationToken,
  ConfigurationParams,
  LSPAny,
} from "vscode-languageserver-protocol";
import type { HandlerResult } from "vscode-jsonrpc";

type ConfigurationNext = (
  params: ConfigurationParams,
  token: CancellationToken,
) => HandlerResult<LSPAny[], void>;

describe("makeConfigurationMiddleware", function () {
  let mockPythonEnvService: {
    getExecutablePath: ReturnType<typeof vi.fn>;
    resolveInterpreterPath: ReturnType<typeof vi.fn>;
  };
  let mockOutputChannel: {
    appendLine: ReturnType<typeof vi.fn>;
  };
  let middleware: ReturnType<typeof makeConfigurationMiddleware>;
  let mockNext: ReturnType<typeof vi.fn<ConfigurationNext>>;

  const mockToken: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
  };

  async function invokeMiddleware(params: ConfigurationParams) {
    return middleware(params, mockToken, mockNext);
  }

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(vscode.workspace, "getWorkspaceFolder", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        uri: {
          fsPath: "/workspace/project",
        },
      }),
    });

    mockPythonEnvService = {
      getExecutablePath: vi.fn(),
      resolveInterpreterPath: vi.fn((userPath: string) =>
        Promise.resolve(userPath),
      ),
    };

    mockOutputChannel = {
      appendLine: vi.fn(),
    };

    middleware = makeConfigurationMiddleware(
      mockPythonEnvService as unknown as PythonEnvironmentService,
      mockOutputChannel as unknown as import("vscode").OutputChannel,
    );

    mockNext = vi.fn<ConfigurationNext>();
  });

  it("should pass through non-ansible config sections unchanged", async function () {
    const params: ConfigurationParams = { items: [{ section: "editor" }] };
    const originalResult = [{ fontSize: 14 }];
    mockNext.mockResolvedValue(originalResult);

    const result = await invokeMiddleware(params);

    expect(result).toEqual(originalResult);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should inject resolved path when interpreterPath is not set", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [{ python: { activationScript: "" } }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/home/user/.venv/bin/python");
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should respect user-configured interpreterPath and not override it", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [
      { python: { interpreterPath: "/usr/local/bin/python3" } },
    ];
    mockNext.mockResolvedValue(originalResult);

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/local/bin/python3");
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("user-configured interpreterPath"),
    );
  });

  it("should log when transitioning from a path to no path", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };

    // First call — env resolves a path; mockNext returns a fresh object
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );
    await invokeMiddleware(params);

    // Second call — env returns nothing; fresh object avoids mutation leak
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(undefined);
    await invokeMiddleware(params);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("No Python environment available"),
    );
  });

  it("should handle config with no python section", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [{ ansible: { path: "/usr/bin/ansible" } }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/usr/bin/python3",
    );

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/bin/python3");
  });

  it("should handle null/undefined config entries", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [undefined];
    mockNext.mockResolvedValue(originalResult);

    const result = await invokeMiddleware(params);

    expect(result).toEqual([undefined]);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should call getExecutablePath when scopeUri is present", async function () {
    const params: ConfigurationParams = {
      items: [{ section: "ansible", scopeUri: "file:///workspace/project" }],
    };
    const originalResult = [{ python: {} }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/workspace/.venv/bin/python",
    );

    const result = await invokeMiddleware(params);

    expect(mockPythonEnvService.getExecutablePath).toHaveBeenCalledTimes(1);
    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/workspace/.venv/bin/python");
  });

  it("should handle multiple config items in a single request", async function () {
    const params: ConfigurationParams = {
      items: [
        { section: "editor" },
        { section: "ansible" },
        { section: "ansible" },
      ],
    };
    const originalResult = [
      { fontSize: 14 },
      { python: {} },
      { python: { interpreterPath: "/explicit/python" } },
    ];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/resolved/python",
    );

    const result = await invokeMiddleware(params);

    const editorConfig = (result as Record<string, unknown>[])[0];
    expect(editorConfig).toEqual({ fontSize: 14 });

    const ansibleConfig1 = (result as Record<string, unknown>[])[1];
    expect(
      (ansibleConfig1.python as Record<string, unknown>).interpreterPath,
    ).toBe("/resolved/python");

    const ansibleConfig2 = (result as Record<string, unknown>[])[2];
    expect(
      (ansibleConfig2.python as Record<string, unknown>).interpreterPath,
    ).toBe("/explicit/python");
  });

  it("should return non-array results from next() unchanged", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const nonArrayResult = "unexpected";
    mockNext.mockResolvedValue(nonArrayResult as unknown as LSPAny[]);

    const result = await invokeMiddleware(params);

    expect(result).toBe(nonArrayResult);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should preserve existing python config properties when injecting", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [
      { python: { activationScript: "/path/to/activate" } },
    ];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/injected/python",
    );

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/injected/python");
    expect(pythonConfig.activationScript).toBe("/path/to/activate");
  });

  it("should only log once when same path is injected multiple times", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );

    // Each call returns a fresh object to avoid mutation leakage
    for (let n = 0; n < 3; n++) {
      mockNext.mockResolvedValue([{ python: {} }]);
      await invokeMiddleware(params);
    }

    expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should log when transitioning between user-configured and auto-resolved with same path", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };

    // First call: user has configured path
    mockNext.mockResolvedValue([
      { python: { interpreterPath: "/usr/bin/python3" } },
    ]);
    await invokeMiddleware(params);

    // Should log user-configured
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("user-configured interpreterPath"),
    );

    // Second call: user removes config, auto-resolves to SAME path
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/usr/bin/python3",
    );
    await invokeMiddleware(params);

    // Should STILL log because source changed (user → auto-resolved)
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should handle errors from next() gracefully", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    mockNext.mockRejectedValue(new Error("Configuration fetch failed"));

    const result = await invokeMiddleware(params);

    // Should return empty array and log error
    expect(result).toEqual([]);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Configuration middleware error"),
    );
  });

  it("should handle errors from getExecutablePath gracefully", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockRejectedValue(
      new Error("Python env resolution failed"),
    );

    const result = await invokeMiddleware(params);

    // Should return unmodified result and log error once
    expect(result).toEqual([{ python: {} }]);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Failed to resolve Python environment"),
    );

    // Second call should not log again (same scope, same error state)
    vi.clearAllMocks();
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockRejectedValue(
      new Error("Python env resolution failed"),
    );

    await invokeMiddleware(params);

    // Should NOT log again
    expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
  });

  it("should expand tilde in user-configured interpreterPath", async function () {
    const params: ConfigurationParams = { items: [{ section: "ansible" }] };
    const originalResult = [
      {
        python: {
          interpreterPath: "~/.local/share/virtualenvs/vsa/bin/python",
        },
      },
    ];
    mockNext.mockResolvedValue(originalResult);

    // Mock resolveInterpreterPath to expand tilde
    mockPythonEnvService.resolveInterpreterPath.mockResolvedValue(
      "/home/user/.local/share/virtualenvs/vsa/bin/python",
    );

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;

    // Should expand ~ to home directory
    expect(pythonConfig.interpreterPath).toBe(
      "/home/user/.local/share/virtualenvs/vsa/bin/python",
    );
    expect(pythonConfig.interpreterPath).not.toContain("~");

    // Should log with both original and resolved paths
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringMatching(/user-configured interpreterPath.*~.*resolved:/),
    );
  });

  it("should resolve user-configured config.path relative to workspaceFolder", async function () {
    vi.mocked(vscode.Uri.parse).mockImplementation(
      (value: string) =>
        ({
          fsPath: value.replace("file://", ""),
          path: value.replace("file://", ""),
        }) as unknown as import("vscode").Uri,
    );

    const params: ConfigurationParams = {
      items: [
        { section: "ansible", scopeUri: "file:///workspace/project/site.yml" },
      ],
    };
    const originalResult = [
      {
        config: {
          path: "${workspaceFolder}/ansible/ansible.cfg",
        },
      },
    ];
    mockNext.mockResolvedValue(originalResult);

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const configSettings = config.config as Record<string, unknown>;
    expect(configSettings.path).toBe("/workspace/project/ansible/ansible.cfg");
  });

  it("should resolve config.path when interpreterPath is user-configured", async function () {
    vi.mocked(vscode.Uri.parse).mockImplementation(
      (value: string) =>
        ({
          fsPath: value.replace("file://", ""),
          path: value.replace("file://", ""),
        }) as unknown as import("vscode").Uri,
    );

    const params: ConfigurationParams = {
      items: [
        { section: "ansible", scopeUri: "file:///workspace/project/site.yml" },
      ],
    };
    const originalResult = [
      {
        python: { interpreterPath: "/usr/local/bin/python3" },
        config: {
          path: "${workspaceFolder}/ansible/ansible.cfg",
        },
      },
    ];
    mockNext.mockResolvedValue(originalResult);

    const result = await invokeMiddleware(params);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    const configSettings = config.config as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/local/bin/python3");
    expect(configSettings.path).toBe("/workspace/project/ansible/ansible.cfg");
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });
});
