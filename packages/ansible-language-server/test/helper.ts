import chalk from "chalk";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import { readFileSync } from "fs";
import { WorkspaceManager } from "../src/services/workspaceManager";
import {
  CompletionItem,
  createConnection,
  TextDocuments,
} from "vscode-languageserver/node";
import { ValidationManager } from "../src/services/validationManager";
import { ExtensionSettings } from "../src/interfaces/extensionSettings";
import { rmSync } from "fs";

import Fuse from "fuse.js";

export const FIXTURES_BASE_PATH = path.join("test", "fixtures");
export const ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH = path.resolve(
  FIXTURES_BASE_PATH,
  "common",
  "collections",
);
export const ANSIBLE_ADJACENT_COLLECTIONS__PATH = path.resolve(
  "playbook_adjacent_collection",
  "collections",
);
export const ANSIBLE_CONFIG_FILE = path.resolve(
  FIXTURES_BASE_PATH,
  "completion",
  "ansible.cfg",
);

export function deleteAlsCache(): void {
  const hostCacheBasePath = path.resolve(
    `${process.env.HOME}/.cache/ansible-language-server/`,
  );
  rmSync(hostCacheBasePath, { recursive: true, force: true });
}

export function setFixtureAnsibleCollectionPathEnv(prePendPath?: string): void {
  if (prePendPath) {
    process.env.ANSIBLE_COLLECTIONS_PATHS = `${prePendPath}:${ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH}`;
  } else {
    process.env.ANSIBLE_COLLECTIONS_PATHS =
      ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH;
  }
}

export function unSetFixtureAnsibleCollectionPathEnv(): void {
  process.env.ANSIBLE_COLLECTIONS_PATHS = undefined;
}

export function setAnsibleConfigEnv(): void {
  process.env.ANSIBLE_CONFIG = ANSIBLE_CONFIG_FILE;
}

export function unsetAnsibleConfigEnv(): void {
  process.env.ANSIBLE_CONFIG = undefined;
}

export async function enableExecutionEnvironmentSettings(
  docSettings: Thenable<ExtensionSettings>,
): Promise<void> {
  (await docSettings).executionEnvironment.enabled = true;
  (await docSettings).executionEnvironment.volumeMounts = [
    {
      src: ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH,
      dest: ANSIBLE_COLLECTIONS_FIXTURES_BASE_PATH,
      options: "ro", // read-only option for volume mounts
    },
    {
      src: ANSIBLE_ADJACENT_COLLECTIONS__PATH,
      dest: ANSIBLE_ADJACENT_COLLECTIONS__PATH,
      options: "ro", // read-only option for volume mounts
    },
  ];
}

export async function disableExecutionEnvironmentSettings(
  docSettings: Thenable<ExtensionSettings>,
): Promise<void> {
  (await docSettings).executionEnvironment.enabled = false;
  (await docSettings).executionEnvironment.volumeMounts = [];
}

export function resolveDocUri(filename: string): string {
  return path.resolve(FIXTURES_BASE_PATH, filename).toString();
}

export function getDoc(filename: string): TextDocument {
  const file = readFileSync(path.resolve(FIXTURES_BASE_PATH, filename), {
    encoding: "utf8",
  });
  const docUri = path.resolve(FIXTURES_BASE_PATH, filename).toString();
  return TextDocument.create(docUri, "ansible", 1, file);
}

export function isWindows(): boolean {
  // win32 applies to x64 arch too, is the platform name
  return process.platform === "win32";
}

export function skipEE(): boolean {
  const SKIP_PODMAN = (process.env.SKIP_PODMAN || "0") === "1";
  const SKIP_DOCKER = (process.env.SKIP_DOCKER || "0") === "1";
  return SKIP_PODMAN && SKIP_DOCKER;
}
/**
 * A function that tries to imitate the filtering of the completion items done in the respective client extension
 * when the user starts typing against the provided auto-completions
 * @param completionList - list with completion items
 * @param triggerCharacter - string against which fuzzy search is to be done
 * @returns list after sorting and filtering
 */
export function smartFilter(
  completionList: CompletionItem[],
  triggerCharacter: string,
): CompletionItem[] {
  if (!completionList) {
    return [];
  }

  // Sort completion list based on `sortText` property of the completion item
  completionList.sort((a: CompletionItem, b: CompletionItem) =>
    a.sortText && b.sortText ? a.sortText.localeCompare(b?.sortText) : 0,
  );

  // Construct a new Fuse object to do fuzzy search with key as `filterText` property of the completion item
  const searcher = new Fuse(completionList, {
    keys: ["filterText"],
    threshold: 0.4,
  });

  let filteredCompletionList = triggerCharacter
    ? searcher
        .search(triggerCharacter)
        .slice(0, 5)
        .map((completion) => {
          return completion.item;
        })
    : completionList.slice(0, 5);

  if (filteredCompletionList.length === 0) {
    // Handle the case when filterText property is not available in completion item.
    // In this case, construct a new Fuse object to do fuzzy search with key as `label` property of the completion item
    const newSearcher = new Fuse(completionList, {
      keys: ["label"],
      threshold: 0.2,
    });
    filteredCompletionList = triggerCharacter
      ? newSearcher
          .search(triggerCharacter)
          .slice(0, 5)
          .map((completion) => {
            return completion.item;
          })
      : completionList.slice(0, 5);
  }

  return filteredCompletionList;
}

/**
 * A function that initiates the connection object with ipc that can be used to create a workspace manager for testing purposes
 * @returns WorkspaceManager - object to serve as a workspace manager for testing purposes
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
    TextDocument,
  );
  const validationManager = new ValidationManager(connection, documents);

  connection.listen();
  return validationManager;
}

type LogFunction = (...args: unknown[]) => void;

function logWrapper(
  originalLog: (...args: unknown[]) => void,
  wrapper: chalk.ChalkFunction,
): (...args: unknown[]) => void {
  return function (...args: unknown[]): void {
    wrapper(originalLog(...args));
  };
}

interface CustomConsole extends Console {}
const customConsole: CustomConsole = Object.create(console);

customConsole.info = logWrapper(console.info as LogFunction, chalk.blue);
customConsole.error = logWrapper(console.error as LogFunction, chalk.red);
customConsole.warn = logWrapper(
  console.warn as LogFunction,
  chalk.yellowBright,
);
customConsole.log = logWrapper(console.log as LogFunction, chalk.gray);

export { customConsole as console };
