import * as ini from 'ini';
import * as path from 'path';
import _ from 'lodash';
import { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { getCommandService } from '@ansible/core/out/services/CommandService';
import type { WorkspaceFolderContext } from './workspaceManager';

export type AnsibleMetaData = Record<string, string | undefined>;

/**
 * Loads Ansible configuration and version metadata for a workspace folder.
 */
export class AnsibleConfig {
    private connection: Connection;
    private context: WorkspaceFolderContext;
    private _collectionPaths: string[] = [];
    private _moduleLocations: string[] = [];
    private _ansibleLocation = '';
    private _defaultHostList: string[] = [];
    private _ansibleMetaData: AnsibleMetaData = {};

    /**
     * Binds the config service to an LSP connection and workspace context.
     *
     * @param connection - LSP connection for error reporting.
     * @param context - Workspace folder whose Ansible config is loaded.
     */
    constructor(connection: Connection, context: WorkspaceFolderContext) {
        this.connection = connection;
        this.context = context;
    }

    /**
     * Fetches ansible-config dump and ansible --version output for the workspace.
     */
    public async initialize(): Promise<void> {
        try {
            const commandService = getCommandService();
            const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

            const configResult = await commandService.runTool('ansible-config', ['dump'], {
                cwd: workingDirectory,
            });
            let config = ini.parse(configResult.stdout);
            config = _.mapKeys(config, (_: unknown, key: string) =>
                key.substring(0, key.indexOf('(')),
            );

            this._collectionPaths =
                typeof config.COLLECTIONS_PATHS === 'string'
                    ? parsePythonStringArray(config.COLLECTIONS_PATHS)
                    : [];

            this._defaultHostList =
                typeof config.DEFAULT_HOST_LIST === 'string'
                    ? parsePythonStringArray(config.DEFAULT_HOST_LIST)
                    : [];

            const versionResult = await commandService.runTool('ansible', ['--version']);
            const versionInfo = ini.parse(versionResult.stdout) as Record<string, string>;
            this._ansibleMetaData = versionInfo;
            const moduleSearchPath = versionInfo['configured module search path'] ?? '';
            this._moduleLocations = parsePythonStringArray(moduleSearchPath);
            const moduleLocation = versionInfo['ansible python module location'] ?? '';
            this._moduleLocations.push(path.resolve(moduleLocation, 'modules'));
            this._ansibleLocation = moduleLocation;
        } catch (error) {
            if (error instanceof Error) {
                this.connection.window.showErrorMessage(error.message);
            } else {
                this.connection.console.error(
                    `Exception in AnsibleConfig service: ${JSON.stringify(error)}`,
                );
            }
        }
    }

    /**
     * Collection search paths from ansible-config.
     *
     * @returns Configured collection search paths.
     */
    get collectionPaths(): string[] {
        return this._collectionPaths;
    }

    /**
     * Default inventory sources from ansible-config.
     *
     * @returns Default host list paths from configuration.
     */
    get defaultHostList(): string[] {
        return this._defaultHostList;
    }

    /**
     * Module search paths reported by ansible --version.
     *
     * @returns Module directories Ansible searches for plugins.
     */
    get moduleLocations(): string[] {
        return this._moduleLocations;
    }

    /**
     * Path to the ansible Python module installation.
     *
     * @returns Ansible Python package location from version output.
     */
    get ansibleLocation(): string {
        return this._ansibleLocation;
    }

    /**
     * Parsed ansible --version metadata key-value pairs.
     *
     * @returns Version and configuration metadata from ansible --version.
     */
    get ansibleMetaData(): AnsibleMetaData {
        return this._ansibleMetaData;
    }
}

/**
 * Parses a Python list literal string into an array of path strings.
 *
 * @param stringList - Bracketed, comma-separated quoted paths from ansible-config.
 * @returns Unquoted path entries.
 */
function parsePythonStringArray(stringList: string): string[] {
    if (!stringList || stringList.length < 2) return [];
    const cleaned = stringList.slice(1, stringList.length - 1);
    const quoted = cleaned.split(',').map((e) => e.trim());
    return quoted.map((e) => e.slice(1, e.length - 1));
}
