import { vi } from "vitest";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  ExtensionContext: vi.fn(),
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    createOutputChannel: vi.fn((name: string, options?: { log?: boolean }) => {
      // If log option is true, return LogOutputChannel with logging methods
      if (options?.log) {
        return {
          appendLine: vi.fn(),
          show: vi.fn(),
          dispose: vi.fn(),
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
        };
      }
      // Otherwise return regular OutputChannel
      return {
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      };
    }),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(),
  },
  Uri: {
    file: vi.fn(),
    parse: vi.fn(),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
  },
  env: {
    machineId: "test-machine-id",
    sessionId: "test-session-id",
  },
}));
