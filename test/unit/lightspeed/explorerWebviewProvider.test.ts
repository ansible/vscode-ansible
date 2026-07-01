import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { LightspeedExplorerWebviewViewProvider } from "@src/features/lightspeed/explorerWebviewViewProvider";

// Mock WebviewHelper
vi.mock("@src/features/lightspeed/vue/views/helper", () => ({
  WebviewHelper: {
    setupHtml: vi.fn(() => "<html>Mock Explorer HTML</html>"),
    setupWebviewHooks: vi.fn(),
  },
}));

// Import after mocks
import { WebviewHelper } from "@src/features/lightspeed/vue/views/helper";

describe("LightspeedExplorerWebviewViewProvider", () => {
  let provider: LightspeedExplorerWebviewViewProvider;
  let mockWebviewView: vscode.WebviewView;
  let mockWebview: vscode.Webview;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock webview
    mockWebview = {
      html: "",
      options: {},
      cspSource: "test-csp-source",
      asWebviewUri: vi.fn((uri) => uri),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    };

    // Setup mock webview view
    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeVisibility: vi.fn(),
    } as unknown as vscode.WebviewView;

    // Setup mock context
    mockContext = {
      subscriptions: [],
      extensionPath: "/test/extension",
    } as unknown as vscode.ExtensionContext;

    provider = new LightspeedExplorerWebviewViewProvider(mockContext);
  });

  describe("constructor", () => {
    it("should initialize with correct static viewType", () => {
      expect(LightspeedExplorerWebviewViewProvider.viewType).toBe(
        "lightspeed-explorer-webview",
      );
    });
  });

  describe("resolveWebviewView", () => {
    it("should configure webview options correctly", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockWebviewView.webview.options).toEqual({
        enableScripts: true,
        enableCommandUris: true,
      });
    });

    it("should setup HTML content using WebviewHelper", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(WebviewHelper.setupHtml).toHaveBeenCalledWith(
        mockWebview,
        mockContext,
        "explorer",
      );
      expect(mockWebview.html).toBe("<html>Mock Explorer HTML</html>");
    });

    it("should setup webview hooks using WebviewHelper", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(WebviewHelper.setupWebviewHooks).toHaveBeenCalledWith(
        mockWebview,
        expect.any(Array),
        mockContext,
      );
    });

    it("should register disposal handler", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockWebviewView.onDidDispose).toHaveBeenCalled();
    });
  });

  describe("disposal handler behavior", () => {
    it("should dispose all disposables and empty the array when view is disposed", async () => {
      let capturedDispose: (() => void) | undefined;
      let capturedDisposables: Array<{ dispose: () => void }> | undefined;

      (
        mockWebviewView.onDidDispose as ReturnType<typeof vi.fn>
      ).mockImplementation((cb: () => void) => {
        capturedDispose = cb;
        return { dispose: vi.fn() };
      });

      const d1 = { dispose: vi.fn() };
      const d2 = { dispose: vi.fn() };
      vi.mocked(WebviewHelper.setupWebviewHooks).mockImplementation(
        async (
          _webview: unknown,
          disposables: Array<{ dispose: () => void }>,
        ) => {
          capturedDisposables = disposables;
          disposables.push(d1, d2);
        },
      );

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(capturedDisposables).toHaveLength(2);
      expect(capturedDispose).toBeDefined();

      capturedDispose?.();

      expect(d1.dispose).toHaveBeenCalledTimes(1);
      expect(d2.dispose).toHaveBeenCalledTimes(1);
      expect(capturedDisposables).toHaveLength(0);
    });

    it("should skip falsy disposables and not throw", async () => {
      let capturedDispose: (() => void) | undefined;

      (
        mockWebviewView.onDidDispose as ReturnType<typeof vi.fn>
      ).mockImplementation((cb: () => void) => {
        capturedDispose = cb;
        return { dispose: vi.fn() };
      });

      const realDisposable = { dispose: vi.fn() };
      vi.mocked(WebviewHelper.setupWebviewHooks).mockImplementation(
        async (
          _webview: unknown,
          disposables: Array<{ dispose: () => void }>,
        ) => {
          // Last element popped first is falsy (L54 false branch),
          // then the real disposable (L54 true branch).
          disposables.push(
            realDisposable,
            undefined as unknown as { dispose: () => void },
          );
        },
      );

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(() => capturedDispose?.()).not.toThrow();
      expect(realDisposable.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe("refreshWebView", () => {
    it("should post a refresh message after the view is resolved", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      provider.refreshWebView();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "userRefreshExplorerState",
        data: {},
      });
    });

    it("should not post a message when the view has not been resolved", () => {
      const freshProvider = new LightspeedExplorerWebviewViewProvider(
        mockContext,
      );

      expect(() => freshProvider.refreshWebView()).not.toThrow();
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });
});
