import {
  Connection,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  InitializeParams,
  InitializeResult,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { provideCodeActions } from "@src/providers/codeActionProvider.js";
import {
  doCompletion,
  doCompletionResolve,
} from "@src/providers/completionProvider.js";
import { getDefinition } from "@src/providers/definitionProvider.js";
import { doHover } from "@src/providers/hoverProvider.js";
import {
  doSemanticTokens,
  tokenModifiers,
  tokenTypes,
} from "@src/providers/semanticTokenProvider.js";
import { doValidate } from "@src/providers/validationProvider.js";
import { SchemaService } from "@src/services/schemaService.js";
import { ValidationManager } from "@src/services/validationManager.js";
import { WorkspaceManager } from "@src/services/workspaceManager.js";
import { getAnsibleMetaData } from "@src/utils/getAnsibleMetaData.js";

/**
 * Initializes the connection and registers all lifecycle event handlers.
 *
 * The event handlers interact with the `WorkspaceManager` to find the relevant
 * context and service instance, and then perform the required actions.
 *
 * Providers are used here directly in the event handlers.
 */
export class AnsibleLanguageService {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private workspaceManager: WorkspaceManager;
  private validationManager: ValidationManager;
  private schemaService: SchemaService;

  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
    this.workspaceManager = new WorkspaceManager(connection);
    this.validationManager = new ValidationManager(connection, documents);
    this.schemaService = new SchemaService(connection);
  }

  public initialize(): void {
    this.initializeConnection();
    this.registerLifecycleEventHandlers();
  }

  private initializeConnection() {
    this.connection.onInitialize((params: InitializeParams) => {
      this.workspaceManager.setWorkspaceFolders(params.workspaceFolders || []);
      this.workspaceManager.setCapabilities(params.capabilities);

      const result: InitializeResult = {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          semanticTokensProvider: {
            documentSelector: [
              {
                language: "ansible",
              },
            ],
            full: true,
            legend: {
              tokenTypes: tokenTypes,
              tokenModifiers: tokenModifiers,
            },
          },
          hoverProvider: true,
          codeActionProvider: {
            codeActionKinds: ["quickfix"],
          },
          completionProvider: {
            resolveProvider: true,
          },
          definitionProvider: true,
          workspace: {},
        },
      };
      if (
        this.workspaceManager.clientCapabilities.workspace?.workspaceFolders
      ) {
        result.capabilities.workspace = {
          workspaceFolders: {
            supported: true,
            changeNotifications: true,
          },
        };
      }
      return result;
    });

    this.connection.onInitialized(() => {
      if (this.workspaceManager.clientCapabilities.workspace?.configuration) {
        this.connection.client
          .register(DidChangeConfigurationNotification.type, {
            section: "ansible",
          })
          .catch(() => {
            this.connection.console.warn(
              "Client does not support dynamic configuration registration. " +
                "Configuration change notifications will not be received.",
            );
          });
      }
      if (
        this.workspaceManager.clientCapabilities.workspace?.workspaceFolders
      ) {
        this.connection.workspace.onDidChangeWorkspaceFolders((e) => {
          this.workspaceManager.handleWorkspaceChanged(e);
        });
      }
      this.connection.client
        .register(DidChangeWatchedFilesNotification.type, {
          watchers: [
            {
              // watch ansible configuration
              globPattern: "**/ansible.cfg",
            },
            {
              // watch ansible-lint configuration
              globPattern: "**/.ansible-lint",
            },
            {
              // watch role meta-configuration
              globPattern: "**/meta/main.{yml,yaml}",
            },
          ],
        })
        .catch(() => {
          this.connection.console.warn(
            "Client does not support dynamic file watcher registration. " +
              "Changes to ansible.cfg, .ansible-lint, and role meta files " +
              "will require a server restart to take effect.",
          );
        });

      // Trigger async workspace-level apme scan on startup
      this.triggerApmeWorkspaceScan();
    });
  }

  private triggerApmeWorkspaceScan(): void {
    this.workspaceManager.forEachContext(async (context) => {
      try {
        const settings = await context.documentSettings.get(
          context.workspaceFolder.uri,
        );
        if (!settings.validation?.enabled || !settings.validation?.apme?.enabled) {
          return;
        }
        this.connection.console.log(
          "[apme] Triggering workspace scan on startup...",
        );
        const diagnosticsByFile =
          await context.ansibleApme.doValidateWorkspace();

        for (const [fileUri, fileDiagnostics] of diagnosticsByFile) {
          this.connection.sendDiagnostics({
            uri: fileUri,
            diagnostics: fileDiagnostics,
          });
        }
        this.connection.console.log(
          `[apme] Workspace scan complete: ${diagnosticsByFile.size} file(s) with violations`,
        );
      } catch (error) {
        this.handleError(error, "apmeWorkspaceScan");
      }
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration(async (params) => {
      try {
        await this.workspaceManager.forEachContext((context) =>
          context.documentSettings.handleConfigurationChanged(params),
        );
      } catch (error) {
        this.handleError(error, "onDidChangeConfiguration");
      }
    });

    // Custom request handler for configuration refresh with immediate cache clearing
    this.connection.onRequest(
      "ansible/refreshConfiguration",
      async (): Promise<{ success: boolean }> => {
        try {
          // Clear caches immediately instead of waiting for debounced timer
          await this.workspaceManager.forEachContext(async (context) => {
            await context.documentSettings.handleConfigurationChanged({
              settings: null,
            });
            context.clearCachedServices();
          });
          return { success: true };
        } catch (error) {
          this.handleError(error, "ansible/refreshConfiguration");
          return { success: false };
        }
      },
    );

    this.documents.onDidOpen(async (e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          // perform full validation
          await doValidate(
            e.document,
            this.validationManager,
            false,
            context,
            this.connection,
            this.schemaService,
          );
        }
      } catch (error) {
        this.handleError(error, "onDidOpen");
      }
    });

    this.documents.onDidClose((e) => {
      try {
        this.validationManager.handleDocumentClosed(e.document.uri);
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          context.documentSettings.handleDocumentClosed(e.document.uri);
        }
      } catch (error) {
        this.handleError(error, "onDidClose");
      }
    });

    this.connection.onDidChangeWatchedFiles((params) => {
      try {
        this.workspaceManager.forEachContext((context) => {
          context.handleWatchedDocumentChange(params);
        });
      } catch (error) {
        this.handleError(error, "onDidChangeWatchedFiles");
      }
    });

    this.documents.onDidSave(async (e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          // perform full validation
          await doValidate(
            e.document,
            this.validationManager,
            false,
            context,
            this.connection,
            this.schemaService,
          );
        }
      } catch (error) {
        this.handleError(error, "onDidSave");
      }
    });

    this.connection.onDidChangeTextDocument((e) => {
      try {
        this.validationManager.reconcileCacheItems(
          e.textDocument.uri,
          e.contentChanges,
        );
      } catch (error) {
        this.handleError(error, "onDidChangeTextDocument");
      }
    });

    this.documents.onDidChangeContent(async (e) => {
      try {
        await doValidate(
          e.document,
          this.validationManager,
          true,
          this.workspaceManager.getContext(e.document.uri),
          this.connection,
          this.schemaService,
        );
      } catch (error) {
        this.handleError(error, "onDidChangeContent");
      }
    });

    this.connection.languages.semanticTokens.on(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri,
          );
          if (context) {
            return await doSemanticTokens(document, await context.docsLibrary);
          }
        }
      } catch (error) {
        this.handleError(error, "onSemanticTokens");
      }
      return {
        data: [],
      };
    });

    this.connection.onHover(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri,
          );
          if (context) {
            return await doHover(
              document,
              params.position,
              await context.docsLibrary,
            );
          }
        }
      } catch (error) {
        this.handleError(error, "onHover");
      }
      return null;
    });

    this.connection.onCompletion(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri,
          );
          if (context) {
            return await doCompletion(
              document,
              params.position,
              context,
              this.schemaService,
            );
          }
        }
      } catch (error) {
        this.handleError(error, "onCompletion");
      }
      return null;
    });

    this.connection.onCompletionResolve(async (completionItem) => {
      try {
        if (completionItem.data?.documentUri) {
          const context = this.workspaceManager.getContext(
            completionItem.data?.documentUri,
          );
          if (context) {
            return await doCompletionResolve(completionItem, context);
          }
        }
      } catch (error) {
        this.handleError(error, "onCompletionResolve");
      }
      return completionItem;
    });

    this.connection.onDefinition(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri,
          );
          if (context) {
            return await getDefinition(
              document,
              params.position,
              await context.docsLibrary,
            );
          }
        }
      } catch (error) {
        this.handleError(error, "onDefinition");
      }
      return null;
    });

    this.connection.onCodeAction(async (params) => {
      try {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri,
        );
        return await provideCodeActions(params, context, this.connection);
      } catch (error) {
        this.handleError(error, "onCodeAction");
        return [];
      }
    });

    this.connection.onRequest(
      "ansible/apme/remediate",
      async (filePath: string): Promise<{ success: boolean; filesUpdated: number }> => {
        try {
          const fileUri = `file://${filePath}`;
          const context = this.workspaceManager.getContext(fileUri);
          if (!context) {
            return { success: false, filesUpdated: 0 };
          }
          const result = await context.ansibleApme.doRemediate(filePath);

          if (result.success) {
            const document = this.documents.get(fileUri);
            if (document) {
              await doValidate(
                document,
                this.validationManager,
                false,
                context,
                this.connection,
                this.schemaService,
              );
            }
          }
          return result;
        } catch (error) {
          this.handleError(error, "ansible/apme/remediate");
          return { success: false, filesUpdated: 0 };
        }
      },
    );

    this.connection.onRequest(
      "ansible/apme/remediateWorkspace",
      async (): Promise<{ success: boolean; filesUpdated: number }> => {
        try {
          let totalUpdated = 0;
          await this.workspaceManager.forEachContext(async (context) => {
            const workspacePath = URI.parse(context.workspaceFolder.uri).path;
            const result = await context.ansibleApme.doRemediate(workspacePath);
            totalUpdated += result.filesUpdated;
          });
          return { success: true, filesUpdated: totalUpdated };
        } catch (error) {
          this.handleError(error, "ansible/apme/remediateWorkspace");
          return { success: false, filesUpdated: 0 };
        }
      },
    );

    // Custom actions that are performed on receiving special notifications from the client
    // Resync ansible inventory service by clearing the cached items
    this.connection.onNotification("resync/ansible-inventory", async () => {
      this.workspaceManager.forEachContext((e) => {
        // Invalidate ansible inventory cache
        e.clearAnsibleInventory();
        this.connection.window.showInformationMessage(
          "Re-syncing ansible inventory. This might take some time.",
        );

        // Run the ansible inventory service
        e.ansibleInventory.then(() => {
          this.connection.window.showInformationMessage(
            "Ansible Inventory re-synced.",
          );
        });
      });
    });

    // Send ansible info to client on receive of notification
    this.connection.onNotification(
      "update/ansible-metadata",
      async (activeFileUri) => {
        const ctx = this.workspaceManager.getContext(activeFileUri);
        if (ctx !== undefined) {
          const ansibleMetaData = await getAnsibleMetaData(
            ctx,
            this.connection,
          );
          this.connection.sendNotification("update/ansible-metadata", [
            ansibleMetaData,
          ]);
        }
      },
    );
  }

  private handleError(error: unknown, contextName: string) {
    const leadMessage = `An error occurred in '${contextName}' handler: `;
    if (error instanceof Error) {
      const stack = error.stack ? `\n${error.stack}` : "";
      this.connection.console.error(
        `${leadMessage}[${error.name}] ${error.message}${stack}`,
      );
    } else {
      this.connection.console.error(leadMessage + JSON.stringify(error));
    }
  }
}
