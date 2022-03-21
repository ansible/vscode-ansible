import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import { promises as fs } from "fs";
import { WorkspaceManager } from "../src/services/workspaceManager";
import { createConnection, TextDocuments } from "vscode-languageserver/node";
import { ValidationManager } from "../src/services/validationManager";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Fuse = require("fuse.js");

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
 * A function that tries to imitate the filtering of the completion items done in the respective client extension
 * when the user starts typing against the provided auto-completions
 * @param completionList list with completion items
 * @param triggerCharacter string against which fuzzy search is to be done
 * @returns list after sorting and filtering
 */
export function smartFilter(completionList, triggerCharacter) {
  if (!completionList) {
    return [];
  }

  // Sort completion list based on `sortText` property of the completion item
  completionList.sort((a, b) => a.sortText.localeCompare(b.sortText));

  // Construct a new Fuse object to do fuzzy search with key as `filterText` property of the completion item
  const searcher = new Fuse(completionList, {
    keys: ["filterText"],
    threshold: 0.4,
    refIndex: false,
  });

  let filteredCompletionList = triggerCharacter
    ? searcher.search(triggerCharacter).slice(0, 5)
    : completionList.slice(0, 5);

  if (filteredCompletionList.length === 0) {
    // Handle the case when filterText property is not available in completion item.
    // In this case, construct a new Fuse object to do fuzzy search with key as `label` property of the completion item
    const newSearcher = new Fuse(completionList, {
      keys: ["label"],
      threshold: 0.2,
      refIndex: false,
    });

    filteredCompletionList = triggerCharacter
      ? newSearcher.search(triggerCharacter).slice(0, 5)
      : completionList.slice(0, 5);
  }

  return filteredCompletionList;
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
