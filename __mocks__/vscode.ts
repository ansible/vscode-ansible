import { vi } from "vitest";

export const window = {
  createWebviewPanel: () => {
    return {
      onDidDispose: vi.fn(),
      webview: {
        asWebviewUri: vi.fn(),
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
      },
    };
  },
  showErrorMessage: vi.fn(),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  joinPath: (uri: any, ...pathSegments: string[]) => ({
    fsPath: pathSegments.join("/"),
  }),
};

export const ViewColumn = {
  One: 1,
};
