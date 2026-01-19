import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { LightspeedExplorerWebviewViewProvider } from "../../../src/features/lightspeed/explorerWebviewViewProvider";

// Mock WebviewHelper
vi.mock("../../../src/features/lightspeed/vue/views/helper", () => ({
  WebviewHelper: {
    setupHtml: vi.fn(() => "<html>Mock Explorer HTML</html>"),
    setupWebviewHooks: vi.fn(),
  },
}));

// Import after mocks
import { WebviewHelper } from "../../../src/features/lightspeed/vue/views/helper";

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
    } as unknown as vscode.Webview;

    // Setup mock webview view
    const onDidDisposeCallbacks: Array<() => void> = [];
    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn((callback: () => void) => {
        onDidDisposeCallbacks.push(callback);
        return { dispose: vi.fn() };
      }),
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
});
