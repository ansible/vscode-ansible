import { Connection } from 'vscode-languageserver';
import { getCommandService } from '@ansible/services';
import type { WorkspaceFolderContext } from '../services/workspaceManager';

export interface AnsibleMetaDataEntry {
    name: string;
    version: string;
    path?: string;
}

export interface AnsibleMetaDataType {
    [key: string]: string | AnsibleMetaDataEntry | undefined;
    ansibleVersion?: string;
    ansibleLintVersion?: string;
}

/**
 * Collects installed Ansible and ansible-lint version metadata for a workspace.
 *
 * @param ctx - Workspace folder context used to resolve tool paths.
 * @param connection - LSP connection for logging failures.
 * @returns Metadata entries keyed by tool name.
 */
export async function getAnsibleMetaData(
    ctx: WorkspaceFolderContext,
    connection: Connection,
): Promise<AnsibleMetaDataType> {
    const metaData: AnsibleMetaDataType = {};
    const commandService = getCommandService();

    try {
        const ansibleResult = await commandService.runTool('ansible', ['--version']);
        if (ansibleResult.exitCode === 0 && ansibleResult.stdout) {
            const firstLine = ansibleResult.stdout.split('\n')[0];
            const versionMatch = /ansible.*?(\d+\.\d+\.\d+)/.exec(firstLine);
            if (versionMatch) {
                metaData.ansibleVersion = versionMatch[1];
            }
        }
    } catch {
        connection.console.info('ansible --version failed');
    }

    try {
        const lintResult = await commandService.runTool('ansible-lint', ['--version']);
        if (lintResult.exitCode === 0 && lintResult.stdout) {
            const versionMatch = /ansible-lint\s+(\d+\.\d+\.\d+)/.exec(lintResult.stdout);
            if (versionMatch) {
                metaData.ansibleLintVersion = versionMatch[1];
            }
        }
    } catch {
        connection.console.info('ansible-lint --version failed');
    }

    return metaData;
}
