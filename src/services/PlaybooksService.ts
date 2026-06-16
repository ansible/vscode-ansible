import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '@src/extension';
import {
    buildPlaybookCommand,
    buildPlaybookSummaryPrompt,
    parsePlaybook,
    DEFAULT_PLAYBOOK_CONFIG,
    type PlaybookConfig,
    type PlaybookPlay,
} from '@ansible/services';

export type { PlaybookConfig, PlaybookPlay } from '@ansible/services';
export interface PlaybookInfo {
    name: string;
    path: string;
    relativePath: string;
    workspaceFolder: vscode.Uri;
    plays: PlaybookPlay[];
}

const CACHE_DIR = '.cache/ansible-environments';
const GLOBAL_CONFIG_FILE = 'playbook-defaults.json';
const PLAYBOOKS_CONFIG_DIR = 'playbooks';

/** Service for discovering workspace playbooks and managing run configuration. */
export class PlaybooksService {
    private static _instance: PlaybooksService | undefined;
    private _playbooks = new Map<string, PlaybookInfo>();
    private _loading = false;
    private _loaded = false;

    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    /** Private constructor for the singleton playbooks service. */
    private constructor() {
        /* singleton */
    }

    /**
     * Return the shared playbooks service instance.
     * @returns Singleton PlaybooksService instance
     */
    public static getInstance(): PlaybooksService {
        PlaybooksService._instance ??= new PlaybooksService();
        return PlaybooksService._instance;
    }

    /**
     * Whether a playbook discovery pass is currently running.
     * @returns True while discovery is in progress
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Whether at least one discovery pass has completed.
     * @returns True after the first successful refresh
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Return discovered playbooks sorted by relative path.
     * @returns Playbook metadata for all discovered files
     */
    public getPlaybooks(): PlaybookInfo[] {
        return Array.from(this._playbooks.values()).sort((a, b) =>
            a.relativePath.localeCompare(b.relativePath),
        );
    }

    /**
     * Look up a single playbook by its workspace-relative path.
     * @param relativePath - Workspace-relative path of the playbook
     * @returns The playbook info, or undefined if not found
     */
    public getPlaybook(relativePath: string): PlaybookInfo | undefined {
        return this._playbooks.get(relativePath);
    }

    /** Scan workspace folders for playbooks and refresh the cache. */
    public async refresh(): Promise<void> {
        if (this._loading) {
            return;
        }

        this._loading = true;
        this._onDidChange.fire();

        try {
            await this._discoverPlaybooks();
            this._loaded = true;
            log(`PlaybooksService: Discovered ${String(this._playbooks.size)} playbooks`);
        } catch (error) {
            log(
                `PlaybooksService: Error discovering playbooks: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            this._loading = false;
            this._onDidChange.fire();
        }
    }

    /** Walk workspace folders to find Ansible playbook files and populate the cache. */
    private async _discoverPlaybooks(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        this._playbooks.clear();

        // Exclude patterns for directories that don't contain standalone playbooks
        const excludePattern =
            '{**/.*/**,**/node_modules/**,**/venv/**,**/.venv/**,**/artifacts/**,**/roles/*/tasks/**,**/roles/*/handlers/**,**/roles/*/defaults/**,**/roles/*/vars/**,**/roles/*/meta/**,**/roles/*/templates/**,**/roles/*/files/**,**/collections/**,**/__pycache__/**}';

        for (const folder of workspaceFolders) {
            const workspaceRoot = folder.uri.fsPath;

            const pattern = new vscode.RelativePattern(folder, '**/*.{yml,yaml}');
            const files = await vscode.workspace.findFiles(pattern, excludePattern);

            for (const file of files) {
                try {
                    const relativePath = path.relative(workspaceRoot, file.fsPath);

                    // Skip files deep inside role directories (catch-all for non-standard role layouts)
                    if (
                        /\broles\b.*[/\\](tasks|handlers|defaults|vars|meta)[/\\]/i.test(
                            relativePath,
                        )
                    ) {
                        continue;
                    }

                    const content = await fs.promises.readFile(file.fsPath, 'utf-8');
                    const plays = parsePlaybook(content);

                    if (plays.length > 0) {
                        const displayPath =
                            workspaceFolders.length > 1
                                ? `${folder.name}/${relativePath}`
                                : relativePath;
                        const name = path.basename(file.fsPath, path.extname(file.fsPath));

                        this._playbooks.set(displayPath, {
                            name,
                            path: file.fsPath,
                            relativePath: displayPath,
                            workspaceFolder: folder.uri,
                            plays,
                        });
                    }
                } catch {
                    // Skip files that can't be read
                }
            }
        }
    }

    // Configuration management
    /**
     * Resolve the workspace cache directory for playbook configuration files.
     * @returns Cache directory path, or null when no workspace is open
     */
    private _getConfigDir(): string | null {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return null;
        }
        return path.join(workspaceRoot, CACHE_DIR);
    }

    /** Ensure playbook configuration directories exist under the workspace cache. */
    private _ensureConfigDir(): void {
        const configDir = this._getConfigDir();
        if (!configDir) {
            return;
        }

        const playbooksDir = path.join(configDir, PLAYBOOKS_CONFIG_DIR);
        if (!fs.existsSync(playbooksDir)) {
            fs.mkdirSync(playbooksDir, { recursive: true });
        }
    }

    /**
     * Load workspace-wide default ansible-playbook settings.
     * @returns Global playbook configuration merged with defaults
     */
    public getGlobalConfig(): PlaybookConfig {
        const configDir = this._getConfigDir();
        if (!configDir) {
            return { ...DEFAULT_PLAYBOOK_CONFIG };
        }

        const configPath = path.join(configDir, GLOBAL_CONFIG_FILE);
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                return {
                    ...DEFAULT_PLAYBOOK_CONFIG,
                    ...(JSON.parse(content) as Partial<PlaybookConfig>),
                };
            }
        } catch (error) {
            log(
                `PlaybooksService: Error reading global config: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return { ...DEFAULT_PLAYBOOK_CONFIG };
    }

    /**
     * Persist workspace-wide default ansible-playbook settings.
     * @param config - Global playbook configuration to save
     */
    public saveGlobalConfig(config: PlaybookConfig): void {
        this._ensureConfigDir();
        const configDir = this._getConfigDir();
        if (!configDir) {
            return;
        }

        const configPath = path.join(configDir, GLOBAL_CONFIG_FILE);
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            log(`PlaybooksService: Saved global config`);
        } catch (error) {
            log(
                `PlaybooksService: Error saving global config: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Load per-playbook settings merged over global defaults.
     * @param relativePath - Workspace-relative or multi-root display path
     * @returns Effective playbook configuration for the requested file
     */
    public getPlaybookConfig(relativePath: string): PlaybookConfig {
        const globalConfig = this.getGlobalConfig();
        const configDir = this._getConfigDir();
        if (!configDir) {
            return globalConfig;
        }

        const configPath = this._getPlaybookConfigPath(configDir, relativePath);

        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                return {
                    ...globalConfig,
                    ...(JSON.parse(content) as Partial<PlaybookConfig>),
                };
            }
        } catch (error) {
            log(
                `PlaybooksService: Error reading playbook config: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return globalConfig;
    }

    /**
     * Persist per-playbook settings under the workspace cache directory.
     * @param relativePath - Workspace-relative or multi-root display path
     * @param config - Playbook-specific configuration to save
     */
    public savePlaybookConfig(relativePath: string, config: PlaybookConfig): void {
        this._ensureConfigDir();
        const configDir = this._getConfigDir();
        if (!configDir) {
            return;
        }

        const configPath = this._getPlaybookConfigPath(configDir, relativePath);

        // Ensure the directory exists (for nested paths)
        const configDirPath = path.dirname(configPath);
        if (!fs.existsSync(configDirPath)) {
            fs.mkdirSync(configDirPath, { recursive: true });
        }

        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            log(`PlaybooksService: Saved config for ${relativePath}`);
        } catch (error) {
            log(
                `PlaybooksService: Error saving playbook config: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Map a playbook path to its cached JSON configuration file path.
     * @param configDir - Workspace cache directory root
     * @param relativePath - Workspace-relative or multi-root display path
     * @returns Absolute path to the playbook config JSON file
     */
    private _getPlaybookConfigPath(configDir: string, relativePath: string): string {
        // Preserve directory hierarchy: deploy/app.yml → playbooks/deploy/app.json
        const configRelPath = relativePath.replace(/\.ya?ml$/, '') + '.json';
        return path.join(configDir, PLAYBOOKS_CONFIG_DIR, configRelPath);
    }

    /**
     * Build an ansible-playbook shell command from saved configuration.
     * Delegates to @ansible/services buildPlaybookCommand.
     * @param playbookPath - Playbook file path passed to ansible-playbook
     * @param config - Effective playbook run settings
     * @returns Shell-ready ansible-playbook command string
     */
    public buildCommand(playbookPath: string, config: PlaybookConfig): string {
        return buildPlaybookCommand(playbookPath, config);
    }

    /**
     * Build an AI analysis prompt for a discovered playbook.
     * @param playbook - Playbook metadata discovered in the workspace
     * @returns Prompt text suitable for chat injection
     */
    public generateAiPrompt(playbook: PlaybookInfo): string {
        return buildPlaybookSummaryPrompt(playbook.relativePath, playbook.name);
    }
}
