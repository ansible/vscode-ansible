import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { runTox } from "../../../../src/features/ansibleTox/runner";

// Mock the utils module
vi.mock("../../../../src/features/ansibleTox/utils", () => ({
  getTerminal: vi.fn(),
}));

// Mock PythonEnvironmentService
vi.mock("../../../../src/services/PythonEnvironmentService", () => ({
  PythonEnvironmentService: {
    getInstance: vi.fn(() => ({
      getEnvironment: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(true),
    })),
  },
}));

describe("ansibleTox/runner", function () {
  describe("runTox", function () {
    let mockTerminal: {
      show: ReturnType<typeof vi.fn>;
      sendText: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      vi.clearAllMocks();

      mockTerminal = {
        show: vi.fn(),
        sendText: vi.fn(),
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should run tox with provided environments", async function () {
      await runTox(
        ["py39", "py310"],
        "--verbose",
        mockTerminal as unknown as vscode.Terminal,
      );

      expect(mockTerminal.show).toHaveBeenCalledWith(true);
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("py39,py310"),
      );
    });

    it("should include tox arguments", async function () {
      await runTox(
        ["lint"],
        "--parallel",
        mockTerminal as unknown as vscode.Terminal,
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("--parallel"),
      );
    });

    it("should use ansible-tox config file", async function () {
      await runTox(["test"], "", mockTerminal as unknown as vscode.Terminal);

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("--conf"),
      );
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("--ansible"),
      );
    });

    it("should use custom command when provided", async function () {
      await runTox(
        ["env1"],
        "",
        mockTerminal as unknown as vscode.Terminal,
        "custom-run-command",
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("custom-run-command"),
      );
    });

    it("should join multiple environments with comma", async function () {
      await runTox(
        ["py38", "py39", "py310", "py311"],
        "",
        mockTerminal as unknown as vscode.Terminal,
      );

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining("py38,py39,py310,py311"),
      );
    });

    it("should show terminal before sending command", async function () {
      await runTox(["test"], "", mockTerminal as unknown as vscode.Terminal);

      // Verify show was called before sendText
      const showCall = mockTerminal.show.mock.invocationCallOrder[0];
      const sendTextCall = mockTerminal.sendText.mock.invocationCallOrder[0];
      expect(showCall).toBeLessThan(sendTextCall);
    });
  });
});
