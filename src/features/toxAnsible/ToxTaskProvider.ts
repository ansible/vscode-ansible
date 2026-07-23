/**
 * ToxTaskProvider — VS Code Task Provider for tox-ansible environments.
 *
 * Surfaces tox-ansible environments as VS Code tasks accessible via
 * Command Palette → "Run Task". Uses ToxAnsibleService for discovery.
 */

import * as vscode from 'vscode';
import { ToxAnsibleService, CommandService } from '@ansible/developer-services';
import { log } from '@src/extension';

const TASK_TYPE = 'ansible-tox';
const TASK_SOURCE = 'ansible-tox';

/** VS Code Task Provider for tox-ansible environments. */
export class ToxTaskProvider implements vscode.TaskProvider {
    private readonly _service: ToxAnsibleService;
    private readonly _cmd: CommandService;

    /**
     * @param service - ToxAnsibleService instance for discovery
     * @param cmd - CommandService instance for venv-aware path resolution
     */
    constructor(service?: ToxAnsibleService, cmd?: CommandService) {
        this._service = service ?? new ToxAnsibleService();
        this._cmd = cmd ?? CommandService.getInstance();
    }

    /**
     * Provide all tox-ansible environments as VS Code tasks.
     * Called by VS Code when the user opens "Run Task" or the Tasks view.
     * @returns Array of VS Code tasks for each tox-ansible environment
     */
    async provideTasks(): Promise<vscode.Task[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return [];

        const availability = await this._service.checkAvailability();
        if (!availability.toxInstalled || !availability.toxAnsibleInstalled) return [];

        const tasks: vscode.Task[] = [];

        for (const folder of folders) {
            const envs = await this._service.listEnvironments(folder.uri.fsPath);

            for (const env of envs) {
                const task = await this._createTask(env.name, env.description, folder);
                tasks.push(task);
            }

            if (envs.length > 0) {
                log(`ToxTaskProvider: provided ${String(envs.length)} tasks from ${folder.name}`);
            }
        }

        return tasks;
    }

    /**
     * Resolve a task definition from tasks.json. Fills in the execution
     * details for user-defined ansible-tox tasks.
     * @param task - Task to resolve with execution details
     * @returns Resolved task with ShellExecution, or undefined
     */
    async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
        const definition = task.definition as { type: string; environment?: string };
        if (definition.type !== TASK_TYPE || !definition.environment) {
            return undefined;
        }

        const folder =
            task.scope && typeof task.scope === 'object' && 'uri' in task.scope
                ? task.scope
                : vscode.workspace.workspaceFolders?.[0];
        return this._createTask(definition.environment, undefined, folder);
    }

    /**
     * Create a VS Code Task for a tox-ansible environment.
     * Uses CommandService.getToolPath for venv-aware tox resolution.
     * @param envName - Tox environment name
     * @param description - Optional human-readable description
     * @param folder - Workspace folder for cwd
     * @returns Configured VS Code task
     */
    private async _createTask(
        envName: string,
        description: string | undefined,
        folder: vscode.WorkspaceFolder | undefined,
    ): Promise<vscode.Task> {
        const definition: vscode.TaskDefinition = {
            type: TASK_TYPE,
            environment: envName,
        };

        const toxPath = (await this._cmd.getToolPath('tox')) ?? 'tox';
        const args = ['-e', envName, '--ansible'];
        if (folder?.uri.fsPath) {
            const configFile = this._service.detectConfigFile(folder.uri.fsPath);
            if (configFile && !configFile.endsWith('pyproject.toml')) {
                args.push('--conf', configFile);
            }
        }

        const execution = new vscode.ShellExecution(toxPath, args, {
            cwd: folder?.uri.fsPath,
        });

        const task = new vscode.Task(
            definition,
            folder ?? vscode.TaskScope.Workspace,
            envName,
            TASK_SOURCE,
            execution,
        );

        task.detail = description ?? `Run tox-ansible environment: ${envName}`;
        task.group = vscode.TaskGroup.Test;
        task.presentationOptions = { reveal: vscode.TaskRevealKind.Always };

        return task;
    }
}
