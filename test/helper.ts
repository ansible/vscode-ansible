import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import { promises as fs } from "fs";
import { WorkspaceManager } from "../src/services/workspaceManager";
import { createConnection, TextDocuments } from "vscode-languageserver/node";
import { ValidationManager } from "../src/services/validationManager";

const FIXTURES_BASE_PATH = path.join("test", "fixtures");

export function setFixtureAnsibleCollectionPathEnv(): void {
  process.env.ANSIBLE_COLLECTIONS_PATHS = path.resolve(
    FIXTURES_BASE_PATH,
    "common",
    "collections"
  );
}

export async function getDoc(filename: string): Promise<TextDocument> {
  const file = await fs.readFile(path.resolve(FIXTURES_BASE_PATH, filename), {
    encoding: "utf8",
  });
  const docUri = path.resolve(FIXTURES_BASE_PATH, filename).toString();
  return TextDocument.create(docUri, "ansible", 1, file);
}

export function isWindows(): boolean {
  // win32 applies to x64 arch too, is the platform name
  return process.platform === "win32";
}

/**
 * A function that initiates the connection object with ipc that can be used to create a workspace manager for testing purposes
 * @returns {WorkspaceManager} object to serve as a workspace manager for testing purposes
 */
export function createTestWorkspaceManager(): WorkspaceManager {
  process.argv.push("--node-ipc");
  const connection = createConnection();
  const workspaceManager = new WorkspaceManager(connection);

  workspaceManager.clientCapabilities.window = {
    showMessage: { messageActionItem: { additionalPropertiesSupport: false } },
    showDocument: { support: true },
    workDoneProgress: true,
  };

  connection.listen();
  return workspaceManager;
}

export function createTestValidationManager(): ValidationManager {
  process.argv.push("--node-ipc");
  const connection = createConnection();

  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument
  );
  const validationManager = new ValidationManager(connection, documents);

  connection.listen();
  return validationManager;
}
