/* Inspired by https://github.com/The-Compiler/vscode-python-tox */

import * as path from "path";
import * as fs_promises from "fs/promises";
import * as fs from "fs";
import * as vscode from "vscode";
import { getToxEnvs } from "./runner";
import {
  ANSIBLE_TOX_FILE_NAME,
  ANSIBLE_TOX_RUN_COMMAND,
  TOX_TYPE,
} from "./constants";

export class AnsibleToxProvider implements vscode.TaskProvider {
  static readonly toxType = TOX_TYPE;
  static readonly ansibleToxIni = ANSIBLE_TOX_FILE_NAME;
  private toxPromise: Thenable<vscode.Task[]> | undefined = undefined;

  constructor(workspaceRoot: string) {
    const pattern = path.join(workspaceRoot, AnsibleToxProvider.ansibleToxIni);
    const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    fileWatcher.onDidChange(() => (this.toxPromise = undefined));
    fileWatcher.onDidCreate(() => (this.toxPromise = undefined));
    fileWatcher.onDidDelete(() => (this.toxPromise = undefined));
  }

  public provideTasks(): Thenable<vscode.Task[]> | undefined {
    if (!this.toxPromise) {
      this.toxPromise = getToxTestTasks();
    }
    return this.toxPromise;
  }

  public resolveTask(_task: vscode.Task): vscode.Task | undefined {
    const testenv = _task.definition.ansible;
    if (testenv) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const definition: ToxTaskDefinition = <any>_task.definition;
      return new vscode.Task(
        definition,
        _task.scope ?? vscode.TaskScope.Workspace,
        definition.ansible,
        AnsibleToxProvider.toxType,
        new vscode.ShellExecution(
          `${ANSIBLE_TOX_RUN_COMMAND} ${definition.ansible} --ansible --conf tox-ansible.ini`,
        ),
      );
    }
    return undefined;
  }
}

interface ToxTaskDefinition extends vscode.TaskDefinition {
  /**
   * The environment name
   */
  testenv: string;
}

const buildTaskNames: string[] = ["build", "compile", "watch"];
const testTaskNames: string[] = ["test"];
function inferTaskGroup(taskName: string): vscode.TaskGroup | undefined {
  if (buildTaskNames.includes(taskName)) {
    return vscode.TaskGroup.Build;
  } else if (testTaskNames.includes(taskName)) {
    return vscode.TaskGroup.Test;
  } else {
    return undefined;
  }
}

async function getToxTestTasks(): Promise<vscode.Task[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const result: vscode.Task[] = [];

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return result;
  }
  for (const workspaceFolder of workspaceFolders) {
    const folderString = workspaceFolder.uri.fsPath;
    if (!folderString) {
      continue;
    }
    const toxFile = path.join(folderString, AnsibleToxProvider.ansibleToxIni);
    try {
      await fs_promises.access(toxFile, fs.constants.R_OK);
    } catch {
      continue;
    }

    const toxTestenvs = await getToxEnvs(folderString);

    if (toxTestenvs !== undefined) {
      for (const toxTestenv of toxTestenvs) {
        if (toxTestenv.length === 0) {
          continue;
        }

        const kind: ToxTaskDefinition = {
          type: AnsibleToxProvider.toxType,
          testenv: toxTestenv,
        };

        const task = new vscode.Task(
          kind,
          workspaceFolder,
          toxTestenv,
          AnsibleToxProvider.toxType,
          new vscode.ShellExecution(
            `${ANSIBLE_TOX_RUN_COMMAND} ${toxTestenv} --ansible --conf tox-ansible.ini`,
          ),
        );
        task.group = inferTaskGroup(toxTestenv.toLowerCase());
        result.push(task);
      }
    }
  }
  return result;
}
