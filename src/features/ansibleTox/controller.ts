/* Inspired by https://github.com/The-Compiler/vscode-python-tox */

import * as vscode from "vscode";
import * as path from "path";
import * as util from "util";
import { runTox, getToxEnvs } from "./runner";
import { getTerminal, getRootParentLabelDesc } from "./utils";
import { ANSIBLE_TOX_FILE_NAME } from "./constants";

export class AnsibleToxController {
  public controller: vscode.TestController;

  constructor() {
    this.controller = vscode.tests.createTestController(
      "ansibleToxController",
      "Ansible Tox",
    );
  }

  public create() {
    this.controller.resolveHandler = async (test) => {
      if (!test) {
        await this.discoverAllFilesInWorkspace();
      } else {
        await this.parseTestsInFileContents(test);
      }
    };
    this.controller.createRunProfile(
      "Ansible Tox",
      vscode.TestRunProfileKind.Run,
      (request, token) => {
        this.runHandler(request, token);
      },
    );
    this.controller.refreshHandler = async () => {
      await this.discoverAllFilesInWorkspace();
    };
    // Check all existing documents
    for (const document of vscode.workspace.textDocuments) {
      this.parseTestsInAnsibleToxFile(document);
    }

    // Check for tox.ini files when a new document is opened or saved.
    vscode.workspace.onDidOpenTextDocument(this.parseTestsInAnsibleToxFile);
    vscode.workspace.onDidSaveTextDocument(this.parseTestsInAnsibleToxFile);

    return this.controller;
  }

  async discoverAllFilesInWorkspace() {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }
    const watchers: vscode.FileSystemWatcher[] = [];

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const pattern = new vscode.RelativePattern(
        workspaceFolder,
        ANSIBLE_TOX_FILE_NAME,
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate((uri) => this.getOrCreateFile(uri));
      watcher.onDidChange((uri) =>
        this.parseTestsInFileContents(this.getOrCreateFile(uri)),
      );
      watcher.onDidDelete((uri) =>
        this.controller.items.delete(uri.toString()),
      );
      const files = await vscode.workspace.findFiles(pattern);
      files.forEach(this.getOrCreateFile);
      watchers.push(watcher);
    }
    return watchers;
  }

  private getOrCreateFile = (uri: vscode.Uri): vscode.TestItem => {
    const existing = this.controller.items.get(uri.toString());
    if (existing) {
      return existing;
    }

    const splittedPath = uri.path.split("/");

    const fileName = splittedPath.pop();
    if (fileName === undefined) {
      throw new TypeError(`Expected filename as string from ${splittedPath}`);
    }

    const parentFolderName = splittedPath.pop();

    const file = this.controller.createTestItem(uri.toString(), fileName, uri);
    file.description = `(${parentFolderName})`;
    this.controller.items.add(file);

    file.canResolveChildren = true;
    return file;
  };

  async parseTestsInFileContents(
    file: vscode.TestItem,
    contents?: string,
  ): Promise<vscode.TestItem[]> {
    if (file.uri === undefined) {
      return [];
    }
    if (contents === undefined) {
      const rawContent = await vscode.workspace.fs.readFile(file.uri);
      contents = new util.TextDecoder().decode(rawContent);
    }

    const listOfChildren: vscode.TestItem[] = [];
    const testRegex = /^(\[ansible):(.*)\]/gm;
    const lines = contents.split("\n");

    const toxTests = await getToxEnvs(path.dirname(file.uri.path));

    if (toxTests) {
      for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo];
        const regexResult = testRegex.exec(line);
        if (!regexResult) {
          continue;
        }

        const envName = regexResult[2];
        if (envName.includes("{")) {
          continue;
        }

        for (let testNo = 0; testNo < toxTests.length; testNo++) {
          const toxTest = toxTests[testNo];

          if (toxTest === envName) {
            const newTestItem = this.controller.createTestItem(
              envName,
              envName,
              file.uri,
            );
            newTestItem.range = new vscode.Range(
              new vscode.Position(lineNo, 0),
              new vscode.Position(lineNo, regexResult[0].length),
            );
            listOfChildren.push(newTestItem);
            toxTests.splice(testNo, 1);
            break;
          }
        }
      }

      for (const toxTest of toxTests) {
        const newTestItem = this.controller.createTestItem(
          toxTest,
          toxTest,
          file.uri,
        );
        newTestItem.range = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0),
        );
        listOfChildren.push(newTestItem);
      }
    }

    return listOfChildren;
  }

  parseTestsInAnsibleToxFile = async (
    document: vscode.TextDocument,
    filename: string = ANSIBLE_TOX_FILE_NAME,
  ) => {
    if (
      document.uri.scheme === "file" &&
      path.basename(document.uri.fsPath) === filename
    ) {
      const file = this.getOrCreateFile(document.uri);
      const content = document.getText();

      const listOfChildren = await this.parseTestsInFileContents(file, content);
      file.children.replace(listOfChildren);
    }
  };

  async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ) {
    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [...(request.include || [])];

    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.pop();
      if (test === undefined || test.uri === undefined) {
        continue;
      }

      if (request.exclude?.includes(test)) {
        continue;
      }

      const start = Date.now();
      try {
        const cwd = vscode.workspace.getWorkspaceFolder(test.uri)?.uri.path;
        runTox(
          [test.label.split("->")[0].trim()],
          "",
          getTerminal(cwd, getRootParentLabelDesc(test)),
        );
        run.passed(test, Date.now() - start);
      } catch (e: unknown) {
        let msg;
        if (e instanceof Error) {
          msg = e.message;
        } else {
          msg = `${e}`;
        }
        run.failed(test, new vscode.TestMessage(msg), Date.now() - start);
      }
    }

    run.end();
  }
}
