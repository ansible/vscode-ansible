import { expect } from "vitest";
import sinon from "sinon";
import { Connection } from "vscode-languageserver";
import { AnsibleLanguageService } from "@src/ansibleLanguageService.js";

interface MockConnection extends Connection {
  _simulateInitialize: (params: unknown) => void;
  _simulateInitialized: () => void;
  _getRequestHandler: (method: string) => ((params: unknown) => Promise<unknown>) | undefined;
}

function createMockDocuments() {
  return {
    listen: sinon.stub(),
    get: sinon.stub().returns(undefined),
    onDidOpen: sinon.stub(),
    onDidClose: sinon.stub(),
    onDidSave: sinon.stub(),
    onDidChangeContent: sinon.stub(),
  };
}

function createMockConnection(): MockConnection {
  const onInitializeHandlers: ((params: unknown) => unknown)[] = [];
  const onInitializedHandlers: (() => void)[] = [];
  const requestHandlers: Map<
    string,
    (params: unknown) => Promise<unknown>
  > = new Map();

  return {
    console: {
      log: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    },
    client: {
      register: sinon
        .stub()
        .rejects(new Error("client/registerCapability not supported")),
    },
    workspace: {
      onDidChangeWorkspaceFolders: sinon.stub(),
    },
    onInitialize: (handler: (params: unknown) => unknown) => {
      onInitializeHandlers.push(handler);
    },
    onInitialized: (handler: () => void) => {
      onInitializedHandlers.push(handler);
    },
    onRequest: (method: string, handler: (params: unknown) => Promise<unknown>) => {
      requestHandlers.set(method, handler);
    },
    onDidChangeConfiguration: sinon.stub(),
    onDidChangeWatchedFiles: sinon.stub(),
    onDidChangeTextDocument: sinon.stub(),
    onCompletion: sinon.stub(),
    onCompletionResolve: sinon.stub(),
    onHover: sinon.stub(),
    onDefinition: sinon.stub(),
    onNotification: sinon.stub(),
    sendNotification: sinon.stub(),
    window: {
      showInformationMessage: sinon.stub(),
    },
    languages: {
      semanticTokens: {
        on: sinon.stub(),
      },
    },
    _simulateInitialize(params: unknown) {
      for (const handler of onInitializeHandlers) {
        handler(params);
      }
    },
    _simulateInitialized() {
      for (const handler of onInitializedHandlers) {
        handler();
      }
    },
    _getRequestHandler(method: string) {
      return requestHandlers.get(method);
    },
  } as unknown as MockConnection;
}

describe("AnsibleLanguageService", () => {
  let mockConnection: MockConnection;
  let mockDocuments: ReturnType<typeof createMockDocuments>;

  beforeEach(() => {
    mockConnection = createMockConnection();
    mockDocuments = createMockDocuments();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("onInitialized client/registerCapability rejection", () => {
    it("should warn on registration failure instead of crashing", async () => {
      const service = new AnsibleLanguageService(
        mockConnection,
        mockDocuments as never,
      );
      service.initialize();

      mockConnection._simulateInitialize({
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true },
        },
        workspaceFolders: [],
      });
      mockConnection._simulateInitialized();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const warnStub = (
        mockConnection as unknown as {
          console: { warn: sinon.SinonStub };
        }
      ).console.warn;
      expect(warnStub.called).toBe(true);

      const warnMessages: string[] = warnStub.args.map(
        (args: unknown[]) => args[0] as string,
      );
      expect(
        warnMessages.some((msg) =>
          msg.includes("dynamic configuration registration"),
        ),
      ).toBe(true);
      expect(
        warnMessages.some((msg) =>
          msg.includes("dynamic file watcher registration"),
        ),
      ).toBe(true);
    });

    it("should continue serving requests after registration failure", async () => {
      const service = new AnsibleLanguageService(
        mockConnection,
        mockDocuments as never,
      );
      service.initialize();

      mockConnection._simulateInitialize({
        capabilities: {
          workspace: { configuration: true },
        },
        workspaceFolders: [],
      });
      mockConnection._simulateInitialized();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const onHoverStub = (
        mockConnection as unknown as { onHover: sinon.SinonStub }
      ).onHover;
      expect(onHoverStub.called).toBe(true);
      await expect(
        onHoverStub.firstCall.args[0]({
          textDocument: { uri: "file:///test.yml" },
          position: { line: 0, character: 0 },
        }),
      ).resolves.toBeNull();

      const onCompletionStub = (
        mockConnection as unknown as {
          onCompletion: sinon.SinonStub;
        }
      ).onCompletion;
      expect(onCompletionStub.called).toBe(true);
      await expect(
        onCompletionStub.firstCall.args[0]({
          textDocument: { uri: "file:///test.yml" },
          position: { line: 0, character: 0 },
        }),
      ).resolves.toBeNull();
    });
  });

  describe("ansible/refreshConfiguration request", () => {
    it("should register request handler and return success", async () => {
      const service = new AnsibleLanguageService(
        mockConnection,
        mockDocuments as never,
      );
      service.initialize();

      mockConnection._simulateInitialize({
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true },
        },
        workspaceFolders: [
          {
            uri: "file:///test",
            name: "test",
          },
        ],
      });
      mockConnection._simulateInitialized();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Get the registered handler
      const handler = mockConnection._getRequestHandler(
        "ansible/refreshConfiguration",
      );

      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler({});
        expect(result).toEqual({ success: true });
      }
    });
  });
});
