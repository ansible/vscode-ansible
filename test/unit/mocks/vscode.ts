import { vi } from "vitest";

// Explicit type for mocks so declaration emit does not reference @vitest/spy (fixes vue-tsc with pnpm)
type MockFn = (...args: unknown[]) => unknown;

const mockAppendLine = vi.fn();
const mockDispose = vi.fn();
const mockClear = vi.fn();

const mockOutputChannel = {
  appendLine: mockAppendLine,
  dispose: mockDispose,
  clear: mockClear,
};

// Mock terminal
const mockTerminal: {
  name: string;
  processId: Promise<number>;
  show: MockFn;
  sendText: MockFn;
  dispose: MockFn;
} = {
  name: "Test Terminal",
  processId: Promise.resolve(12345),
  show: vi.fn(),
  sendText: vi.fn(),
  dispose: vi.fn(),
};

const window: {
  createOutputChannel: MockFn;
  showInformationMessage: MockFn;
  showWarningMessage: MockFn;
  showErrorMessage: MockFn;
  createTerminal: MockFn;
  terminals: (typeof mockTerminal)[];
} = {
  createOutputChannel: vi.fn().mockReturnValue(mockOutputChannel),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  createTerminal: vi.fn().mockReturnValue(mockTerminal),
  terminals: [],
};

const workspace: {
  getConfiguration: MockFn;
  workspaceFolders: { uri: { fsPath: string } }[] | undefined;
} = {
  getConfiguration: vi.fn(),
  workspaceFolders: undefined,
};

// Mock extensions API
const extensions: { getExtension: MockFn } = {
  getExtension: vi.fn(),
};

// Mock commands API
const commands: { executeCommand: MockFn } = {
  executeCommand: vi.fn(),
};

// Mock env API
const env: { openExternal: MockFn } = {
  openExternal: vi.fn(),
};

// Mock EventEmitter class
class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  fire(data: T) {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose() {
    this.listeners = [];
  }
}

// Mock Uri class
const Uri = {
  file: (path: string) => ({ fsPath: path, path, scheme: "file" }),
  parse: (uri: string) => ({ fsPath: uri, path: uri, scheme: "https" }),
};

// Mock ConfigurationTarget enum
const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

// Export the mocked vscode module
export {
  window,
  workspace,
  extensions,
  commands,
  env,
  EventEmitter,
  Uri,
  ConfigurationTarget,
};
