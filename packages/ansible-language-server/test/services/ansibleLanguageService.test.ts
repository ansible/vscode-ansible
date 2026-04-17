import { expect } from "vitest";
import sinon from "sinon";
import { Connection } from "vscode-languageserver";
import { AnsibleLanguageService } from "@src/ansibleLanguageService.js";

interface MockConnection extends Connection {
  _simulateInitialize: (params: unknown) => void;
  _simulateInitialized: () => void;
}

function createMockDocuments() {
  return {
    listen: sinon.stub(),
    onDidOpen: sinon.stub(),
    onDidClose: sinon.stub(),
    onDidSave: sinon.stub(),
    onDidChangeContent: sinon.stub(),
  };
}

function createMockConnection(): MockConnection {
  const onInitializeHandlers: ((params: unknown) => unknown)[] = [];
  const onInitializedHandlers: (() => void)[] = [];

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
        .rejects(
          new Error("client/registerCapability not supported"),
        ),
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
    it("should handle registration failure gracefully", async () => {
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

      const errorStub = (
        mockConnection as unknown as {
          console: { error: sinon.SinonStub };
        }
      ).console.error;
      expect(errorStub.called).toBe(true);

      const errorMessages: string[] = errorStub.args.map(
        (args: unknown[]) => args[0] as string,
      );
      expect(
        errorMessages.some((msg) =>
          msg.includes("registerConfigurationCapability"),
        ),
      ).toBe(true);
      expect(
        errorMessages.some((msg) =>
          msg.includes("registerWatchedFilesCapability"),
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

      const onCompletionStub = (
        mockConnection as unknown as {
          onCompletion: sinon.SinonStub;
        }
      ).onCompletion;
      expect(onCompletionStub.called).toBe(true);
    });
  });
});
