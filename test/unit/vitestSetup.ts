import { vi } from "vitest";

// Mock vscode first so it's available when other packages try to require it
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
  // Create a mock Disposable class
  class MockDisposable {
    dispose = vi.fn();
    static from(...disposables: MockDisposable[]): MockDisposable {
      return {
        dispose: vi.fn(() => {
          disposables.forEach((d) => d.dispose());
        }),
      } as MockDisposable;
    }
  }

  return {
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn(),
    },
    ExtensionContext: vi.fn(),
    EventEmitter: MockEventEmitter,
    window: {
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      withProgress: vi.fn(),
      showTextDocument: vi.fn(),
      createOutputChannel: vi.fn(
        (name: string, options?: { log?: boolean }) => {
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
        },
      ),
      registerUriHandler: vi.fn(),
      createWebviewPanel: vi.fn(),
      createTerminal: vi.fn(() => ({
        name: "Mock Terminal",
        processId: Promise.resolve(12345),
        show: vi.fn(),
        sendText: vi.fn(),
        dispose: vi.fn(),
      })),
      terminals: [] as Array<{
        name: string;
        processId: Promise<number>;
        show: () => void;
        sendText: () => void;
        dispose: () => void;
      }>,
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      openTextDocument: vi.fn(),
    },
    extensions: {
      getExtension: vi.fn(),
    },
    ExtensionMode: {
      Production: 1,
      Development: 2,
      Test: 3,
    },
    Uri: {
      file: vi.fn((path: string) => ({ fsPath: path, path })),
      parse: vi.fn(),
      joinPath: vi.fn((base: { path: string }, ...segments: string[]) => {
        const joined = [base.path, ...segments].join("/");
        return { fsPath: joined, path: joined, toString: () => joined };
      }),
    },
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ThemeColor: class MockThemeColor {
      id: string;
      constructor(id: string) {
        this.id = id;
      }
    },
    MarkdownString: class MockMarkdownString {
      value: string;
      isTrusted: boolean;
      constructor(value?: string, supportThemeIcons?: boolean) {
        this.value = value || "";
        this.isTrusted = supportThemeIcons || false;
      }
    },
    env: {
      machineId: "test-machine-id",
      sessionId: "test-session-id",
      openExternal: vi.fn(),
    },
    lm: {
      registerMcpServerDefinitionProvider: vi.fn(),
    },
    Disposable: MockDisposable,
    Event: vi.fn(),
    UriHandler: vi.fn(),
    Webview: vi.fn(),
    WebviewPanel: vi.fn(),
    authentication: {
      registerAuthenticationProvider: vi.fn(),
      getSession: vi.fn(),
    },
    ProgressLocation: {
      Notification: 15,
      SourceControl: 1,
      Window: 10,
    },
    ConfigurationTarget: {
      Workspace: 1,
      Global: 2,
      WorkspaceFolder: 3,
    },
    McpStdioServerDefinition: vi
      .fn()
      .mockImplementation((label, command, args, env, cwd) => ({
        label,
        command,
        args,
        env,
        cwd,
      })),
  };
});

// Mock @vscode/python-extension for PythonEnvironmentService fallback tests
vi.mock("@vscode/python-extension", () => ({
  PythonExtension: {
    api: vi.fn().mockResolvedValue({
      ready: Promise.resolve(),
      environments: {
        getActiveEnvironmentPath: vi.fn().mockReturnValue({
          id: "mock-env",
          path: "/usr/bin/python3",
        }),
        resolveEnvironment: vi.fn().mockResolvedValue(undefined),
        onDidChangeActiveEnvironmentPath: vi.fn().mockReturnValue({
          dispose: vi.fn(),
        }),
        known: [],
        refreshEnvironments: vi.fn(),
      },
    }),
  },
  PVSC_EXTENSION_ID: "ms-python.python",
}));

// Mock vscode-languageclient packages to prevent them from trying to require vscode
vi.mock("vscode-languageclient", () => ({
  LanguageClient: vi.fn(),
  LanguageClientOptions: {},
  NotificationType: vi.fn(),
  ServerOptions: {},
  TransportKind: {
    stdio: "stdio",
    ipc: "ipc",
    pipe: "pipe",
    socket: "socket",
  },
  RevealOutputChannelOn: {
    Never: 0,
    Info: 1,
    Warn: 2,
    Error: 3,
  },
}));

vi.mock("vscode-languageclient/node", () => ({
  LanguageClient: vi.fn(),
  LanguageClientOptions: {},
  NotificationType: vi.fn(),
  ServerOptions: {},
  TransportKind: {
    stdio: "stdio",
    ipc: "ipc",
    pipe: "pipe",
    socket: "socket",
  },
  RevealOutputChannelOn: {
    Never: 0,
    Info: 1,
    Warn: 2,
    Error: 3,
  },
}));

// Mock vscode-redhat-telemetry to prevent it from trying to require vscode
vi.mock("@redhat-developer/vscode-redhat-telemetry", () => ({
  RedHatService: vi.fn(),
}));

vi.mock("@redhat-developer/vscode-redhat-telemetry/lib", () => ({
  getRedHatService: vi.fn(),
  TelemetryService: vi.fn(),
}));
