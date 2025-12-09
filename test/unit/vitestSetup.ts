import * as chai from "chai";
chai.config.truncateThreshold = 0; // disable truncating
import { vi } from "vitest";

vi.mock("vscode", () => {
  class MockEventEmitter<T> {
    public listeners: Array<(value: T) => void>;
    
    constructor() {
      this.listeners = [];
    }
    
    event(listener: (value: T) => void): { dispose: () => void } {
      if (!this.listeners) {
        this.listeners = [];
      }
      this.listeners.push(listener);
      return {
        dispose: () => {
          if (this.listeners) {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
              this.listeners.splice(index, 1);
            }
          }
        },
      };
    }
    
    fire(value: T): void {
      if (this.listeners && this.listeners.length > 0) {
        this.listeners.forEach((listener) => listener(value));
      }
    }
    
    dispose(): void {
      this.listeners = [];
    }
  }

  return {
    commands: {
      executeCommand: vi.fn(),
    },
    ExtensionContext: vi.fn(),
    EventEmitter: MockEventEmitter,
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
    lm: {
      registerMcpServerDefinitionProvider: vi.fn(),
    },
    McpStdioServerDefinition: vi.fn().mockImplementation((label, command, args, env, cwd) => ({
      label,
      command,
      args,
      env,
      cwd,
    })),
  };
});
