import { vi } from "vitest";

// Mock vscode first so it's available when other packages try to require it
vi.mock("vscode", () => {
  // Create a mock EventEmitter class
  class MockEventEmitter<T> {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
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
      registerUriHandler: vi.fn(),
      createWebviewPanel: vi.fn(),
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
    EventEmitter: MockEventEmitter,
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
  };
});

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
