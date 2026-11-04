import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sinon from "sinon";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Connection } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { AnsibleLanguageService } from "@src/ansibleLanguageService.js";

interface MockConnection extends Connection {
  _simulateInitialize: (params: unknown) => void;
  _simulateInitialized: () => void;
  _getRequestHandler: (
    method: string,
  ) => ((params: unknown) => Promise<unknown>) | undefined;
}

function createMockDocuments() {
  return {
    listen: sinon.stub(),
    all: sinon.stub().returns([]),
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
  const requestHandlers: Map<string, (params: unknown) => Promise<unknown>> =
    new Map();

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
    onRequest: (
      method: string,
      handler: (params: unknown) => Promise<unknown>,
    ) => {
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
  let temporaryWorkspaceRoot: string | undefined;

  beforeEach(() => {
    mockConnection = createMockConnection();
    mockDocuments = createMockDocuments();
  });

  afterEach(async () => {
    sinon.restore();
    if (temporaryWorkspaceRoot) {
      await rm(temporaryWorkspaceRoot, { recursive: true, force: true });
      temporaryWorkspaceRoot = undefined;
    }
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

  describe("onDefinition", () => {
    const uri = "file:///test/play.yml";
    const text = `- hosts: localhost
  tasks:
    - ansible.builtin.template:
        src: missing.j2
        dest: /tmp/x
`;

    function setup() {
      const service = new AnsibleLanguageService(
        mockConnection,
        mockDocuments as never,
      );
      service.initialize();
      const handler = (
        mockConnection as unknown as { onDefinition: sinon.SinonStub }
      ).onDefinition.firstCall.args[0] as (params: unknown) => Promise<unknown>;
      return { service, handler };
    }

    function stubContext(
      service: AnsibleLanguageService,
      workspaceUri = "file:///test",
    ) {
      (
        service as unknown as {
          workspaceManager: { getContext: () => unknown };
        }
      ).workspaceManager.getContext = () => ({
        workspaceFolder: { uri: workspaceUri, name: "test" },
        docsLibrary: Promise.resolve({
          findModule: async () => [undefined],
        }),
      });
    }

    it("logs when a referenced file cannot be found", async () => {
      const doc = TextDocument.create(uri, "ansible", 1, text);
      mockDocuments.get.returns(doc);
      const { service, handler } = setup();
      stubContext(service);

      const result = await handler({
        textDocument: { uri },
        position: doc.positionAt(text.indexOf("missing.j2") + 1),
      });

      expect(result).toBeNull();
      const infoStub = (
        mockConnection as unknown as { console: { info: sinon.SinonStub } }
      ).console.info;
      expect(infoStub.calledWith("File not found: missing.j2")).toBe(true);
    });

    it("returns null when the document is not open", async () => {
      const { handler } = setup();

      const result = await handler({
        textDocument: { uri },
        position: { line: 0, character: 0 },
      });

      expect(result).toBeNull();
    });

    it("resolves workspace-root files from a nested document", async () => {
      temporaryWorkspaceRoot = await mkdtemp(
        path.join(tmpdir(), "ansible-definition-"),
      );
      const nestedDirectory = path.join(temporaryWorkspaceRoot, "nested");
      const filesDirectory = path.join(temporaryWorkspaceRoot, "files");
      await mkdir(nestedDirectory, { recursive: true });
      await mkdir(filesDirectory, { recursive: true });
      await writeFile(path.join(filesDirectory, "static.txt"), "content");

      const nestedUri = URI.file(
        path.join(nestedDirectory, "play.yml"),
      ).toString();
      const documentText = `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: static.txt
        dest: /tmp/x
`;
      const doc = TextDocument.create(nestedUri, "ansible", 1, documentText);
      mockDocuments.get.returns(doc);
      const { service, handler } = setup();
      stubContext(service, URI.file(temporaryWorkspaceRoot).toString());

      const result = await handler({
        textDocument: { uri: nestedUri },
        position: doc.positionAt(documentText.indexOf("static.txt")),
      });

      expect(result).toHaveLength(1);
      expect(
        URI.parse(
          (result as { targetUri: string }[])[0].targetUri,
        ).fsPath.toLowerCase(),
      ).toBe(path.join(filesDirectory, "static.txt").toLowerCase());
    });

    it("uses the directory of an open playbook that includes the task file", async () => {
      temporaryWorkspaceRoot = await mkdtemp(
        path.join(tmpdir(), "ansible-definition-"),
      );
      const playbooksDirectory = path.join(temporaryWorkspaceRoot, "playbooks");
      const tasksDirectory = path.join(playbooksDirectory, "tasks");
      const filesDirectory = path.join(playbooksDirectory, "files");
      await mkdir(tasksDirectory, { recursive: true });
      await mkdir(filesDirectory, { recursive: true });
      await writeFile(path.join(filesDirectory, "app.conf"), "content");

      const playbookUri = URI.file(
        path.join(playbooksDirectory, "site.yml"),
      ).toString();
      const taskUri = URI.file(
        path.join(tasksDirectory, "deploy.yml"),
      ).toString();
      const playbookText = `- hosts: localhost
  tasks:
    - ansible.builtin.import_tasks: tasks/deploy.yml
`;
      const taskText = `- ansible.builtin.copy:
    src: files/app.conf
    dest: /tmp/app.conf
`;
      const playbookDoc = TextDocument.create(
        playbookUri,
        "ansible",
        1,
        playbookText,
      );
      const taskDoc = TextDocument.create(taskUri, "ansible", 1, taskText);
      await writeFile(path.join(tasksDirectory, "deploy.yml"), taskText);
      mockDocuments.get.returns(taskDoc);
      mockDocuments.all.returns([playbookDoc, taskDoc]);
      const { service, handler } = setup();
      stubContext(service, URI.file(temporaryWorkspaceRoot).toString());

      const result = await handler({
        textDocument: { uri: taskUri },
        position: taskDoc.positionAt(taskText.indexOf("files/app.conf")),
      });

      expect(result).toHaveLength(1);
      expect(
        URI.parse(
          (result as { targetUri: string }[])[0].targetUri,
        ).fsPath.toLowerCase(),
      ).toBe(path.join(filesDirectory, "app.conf").toLowerCase());
    });

    it("logs and returns null when the handler throws", async () => {
      const doc = TextDocument.create(uri, "ansible", 1, text);
      mockDocuments.get.returns(doc);
      const { service, handler } = setup();
      (
        service as unknown as {
          workspaceManager: { getContext: () => unknown };
        }
      ).workspaceManager.getContext = () => {
        throw new Error("boom");
      };

      const result = await handler({
        textDocument: { uri },
        position: { line: 0, character: 0 },
      });

      expect(result).toBeNull();
      const errorStub = (
        mockConnection as unknown as { console: { error: sinon.SinonStub } }
      ).console.error;
      expect(errorStub.called).toBe(true);
    });
  });
});
