import { vi } from "vitest";

const mockAppendLine = vi.fn();
const mockDispose = vi.fn();
const mockClear = vi.fn();

const mockOutputChannel = {
  appendLine: mockAppendLine,
  dispose: mockDispose,
  clear: mockClear,
};

const window = {
  createOutputChannel: vi.fn().mockReturnValue(mockOutputChannel),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
};

const workspace = {
  getConfiguration: vi.fn(),
};

// Export the mocked vscode module
export { window, workspace };
