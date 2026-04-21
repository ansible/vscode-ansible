import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfigurationMiddleware } from "@src/extension";
import type { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

describe("makeConfigurationMiddleware", function () {
  let mockPythonEnvService: {
    getExecutablePath: ReturnType<typeof vi.fn>;
  };
  let mockOutputChannel: {
    appendLine: ReturnType<typeof vi.fn>;
  };
  let middleware: ReturnType<typeof makeConfigurationMiddleware>;
  let mockNext: ReturnType<typeof vi.fn>;

  const mockToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPythonEnvService = {
      getExecutablePath: vi.fn(),
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

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

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
    const originalResult = [{ python: {} }];

    // First call with a path
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );
    await middleware(params, mockToken, mockNext as any);

    // Second call with no path (should log transition)
    mockPythonEnvService.getExecutablePath.mockResolvedValue(undefined);
    await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/usr/bin/python3");
  });

  it("should handle null/undefined config entries", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [undefined];
    mockNext.mockResolvedValue(originalResult);

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

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

    const result = await middleware(params, mockToken, mockNext as any);

    const config = (result as Record<string, unknown>[])[0];
    const pythonConfig = config.python as Record<string, unknown>;
    expect(pythonConfig.interpreterPath).toBe("/injected/python");
    expect(pythonConfig.activationScript).toBe("/path/to/activate");
  });

  it("should only log once when same path is injected multiple times", async function () {
    const params = { items: [{ section: "ansible" }] };
    const originalResult = [{ python: {} }];
    mockNext.mockResolvedValue(originalResult);
    mockPythonEnvService.getExecutablePath.mockResolvedValue(
      "/home/user/.venv/bin/python",
    );

    // Call middleware 3 times with same path
    await middleware(params, mockToken, mockNext as any);
    await middleware(params, mockToken, mockNext as any);
    await middleware(params, mockToken, mockNext as any);

    // Should only log once (on first call)
    expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining("Python environment changed"),
    );
  });
});
