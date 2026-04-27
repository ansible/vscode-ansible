/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfigurationMiddleware } from "@src/extension";
import type { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

describe("makeConfigurationMiddleware", function () {
  let mockPythonEnvService: {
    getExecutablePath: ReturnType<typeof vi.fn>;
    resolveInterpreterPath: ReturnType<typeof vi.fn>;
  };
  let mockOutputChannel: {
    appendLine: ReturnType<typeof vi.fn>;
  };
  let middleware: ReturnType<typeof makeConfigurationMiddleware>;
  let mockNext: ReturnType<typeof vi.fn>;

  const mockToken = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPythonEnvService = {
      getExecutablePath: vi.fn(),
      resolveInterpreterPath: vi.fn((userPath) => Promise.resolve(userPath)),
    };

    mockOutputChannel = {
      appendLine: vi.fn(),
    };

    middleware = makeConfigurationMiddleware(
      mockPythonEnvService as unknown as PythonEnvironmentService,
      mockOutputChannel as unknown as import("vscode").OutputChannel,
    );

    mockNext = vi.fn();
  });

  it("should pass through non-ansible config sections unchanged", async function () {
    const params = { items: [{ section: "editor" }] };
    const originalResult = [{ fontSize: 14 }];
    mockNext.mockResolvedValue(originalResult);

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    expect(result).toEqual(originalResult);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should inject resolved path when interpreterPath is not set", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [{ python: { activationScript: "" } }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/home/user/.venv/bin/python");
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should respect user-configured interpreterPath and not override it", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [
      { python: { interpreterPath: "/usr/local/bin/python3" } },
    ];
    mockNext.mockResolvedValue(originalResult);

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/local/bin/python3");
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("user-configured interpreterPath"),
    );
  });

  it("should log when transitioning from a path to no path", async function () {
    const params = { items: [{ section: "ansible" }] };

    // First call — env resolves a path; mockNext returns a fresh object
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );
    await middleware(params as any, mockToken as any, mockNext as any);

    // Second call — env returns nothing; fresh object avoids mutation leak
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(undefined);
    await middleware(params as any, mockToken as any, mockNext as any);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("No Python environment available"),
    );
  });

  it("should handle config with no python section", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [{ ansible: { path: "/usr/bin/ansible" } }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/usr/bin/python3",
    );

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/bin/python3");
  });

  it("should handle null/undefined config entries", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [undefined];
    mockNext.mockResolvedValue(originalResult);

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    expect(result).toEqual([undefined]);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should call getExecutablePath when scopeUri is present", async function () {
    const params = {
      items: [{ section: "ansible", scopeUri: "file:///workspace/project" }],
    };
    const originalResult = [{ python: {} }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/workspace/.venv/bin/python",
    );

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    expect(mockPythonEnvService.getExecutablePath).toHaveBeenCalledTimes(1);
    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/workspace/.venv/bin/python");
  });

  it("should handle multiple config items in a single request", async function () {
    const params = {
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

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

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
    const params = { items: [{ section: "ansible" }] };
    const nonArrayResult = "unexpected";
    mockNext.mockResolvedValue(nonArrayResult);

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    expect(result).toBe(nonArrayResult);
    expect(mockPythonEnvService.getExecutablePath).not.toHaveBeenCalled();
  });

  it("should preserve existing python config properties when injecting", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [
      { python: { activationScript: "/path/to/activate" } },
    ];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/injected/python",
    );

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/injected/python");
    expect(pythonConfig.activationScript).toBe("/path/to/activate");
  });

  it("should only log once when same path is injected multiple times", async function () {
    const params = { items: [{ section: "ansible" }] };
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );

    // Each call returns a fresh object to avoid mutation leakage
    for (let n = 0; n < 3; n++) {
      mockNext.mockResolvedValue([{ python: {} }]);
      await middleware(params as any, mockToken as any, mockNext as any);
    }

    expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should log when transitioning between user-configured and auto-resolved with same path", async function () {
    const params = { items: [{ section: "ansible" }] };

    // First call: user has configured path
    mockNext.mockResolvedValue([
      { python: { interpreterPath: "/usr/bin/python3" } },
    ]);
    await middleware(params as any, mockToken as any, mockNext as any);

    // Should log user-configured
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("user-configured interpreterPath"),
    );

    // Second call: user removes config, auto-resolves to SAME path
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/usr/bin/python3",
    );
    await middleware(params as any, mockToken as any, mockNext as any);

    // Should STILL log because source changed (user → auto-resolved)
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });

  it("should handle errors from next() gracefully", async function () {
    const params = { items: [{ section: "ansible" }] };
    mockNext.mockRejectedValue(new Error("Configuration fetch failed"));

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

    // Should return array of null matching request size and log error
    expect(result).toEqual([null]);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Configuration middleware error"),
    );
  });

  it("should handle errors from getExecutablePath gracefully", async function () {
    const params = { items: [{ section: "ansible" }] };
    mockNext.mockResolvedValue([{ python: {} }]);
    mockPythonEnvService.getExecutablePath.mockRejectedValue(
      new Error("Python env resolution failed"),
    );

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

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

    await middleware(params as any, mockToken as any, mockNext as any);

    // Should NOT log again
    expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
  });

  it("should expand tilde in user-configured interpreterPath", async function () {
    const params = { items: [{ section: "ansible" }] };
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

    const result = await middleware(
      params as any,
      mockToken as any,
      mockNext as any,
    );

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
});
