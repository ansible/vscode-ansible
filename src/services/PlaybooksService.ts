import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../extension';

export interface PlaybookPlay {
    name: string;
    hosts: string;
    lineNumber: number;
}

export interface PlaybookInfo {
    name: string;
    path: string;
    relativePath: string;
    workspaceFolder: vscode.Uri;
    plays: PlaybookPlay[];
}

export interface PlaybookConfig {
    inventory?: string[];
    limit?: string;
    tags?: string[];
    skipTags?: string[];
    extraVars?: string;
    check?: boolean;
    diff?: boolean;
    verbose?: number;
    forks?: number;
    connection?: string;
    user?: string;
    timeout?: number;
    privateKey?: string;
    become?: boolean;
    becomeMethod?: string;
    becomeUser?: string;
    vaultPasswordFile?: string;
    startAtTask?: string;
    step?: boolean;
    askPass?: boolean;
    askBecomePass?: boolean;
    askVaultPass?: boolean;
}

const DEFAULT_CONFIG: PlaybookConfig = {
    inventory: [],
    limit: '',
    tags: [],
    skipTags: [],
    extraVars: '',
    check: false,
    diff: false,
    verbose: 0,
    forks: 5,
    connection: 'ssh',
    user: '',
    timeout: undefined,
    privateKey: '',
    become: false,
    becomeMethod: 'sudo',
    becomeUser: 'root',
    vaultPasswordFile: '',
    startAtTask: '',
    step: false,
    askPass: false,
    askBecomePass: false,
    askVaultPass: false,
};

const CACHE_DIR = '.cache/ansible-environments';
const GLOBAL_CONFIG_FILE = 'playbook-defaults.json';
const PLAYBOOKS_CONFIG_DIR = 'playbooks';

export class PlaybooksService {
    private static _instance: PlaybooksService;
    private _playbooks: Map<string, PlaybookInfo> = new Map();
    private _loading = false;
    private _loaded = false;
    
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private constructor() {}

    public static getInstance(): PlaybooksService {
        if (!PlaybooksService._instance) {
            PlaybooksService._instance = new PlaybooksService();
        }
        return PlaybooksService._instance;
    }

    public isLoading(): boolean {
        return this._loading;
    }

    public isLoaded(): boolean {
        return this._loaded;
    }

    public getPlaybooks(): PlaybookInfo[] {
        return Array.from(this._playbooks.values()).sort((a, b) => 
            a.relativePath.localeCompare(b.relativePath)
        );
    }

    public getPlaybook(relativePath: string): PlaybookInfo | undefined {
        return this._playbooks.get(relativePath);
    }

    public async refresh(): Promise<void> {
        if (this._loading) {
            return;
        }

        this._loading = true;
        this._onDidChange.fire();

        try {
            await this._discoverPlaybooks();
            this._loaded = true;
            log(`PlaybooksService: Discovered ${this._playbooks.size} playbooks`);
        } catch (error) {
            log(`PlaybooksService: Error discovering playbooks: ${error}`);
        } finally {
            this._loading = false;
            this._onDidChange.fire();
        }
    }

    private async _discoverPlaybooks(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        this._playbooks.clear();

        // Scan all workspace folders
        for (const folder of workspaceFolders) {
            const workspaceRoot = folder.uri.fsPath;
            
            // Find all yml/yaml files, excluding dot directories
            const pattern = new vscode.RelativePattern(folder, '**/*.{yml,yaml}');
            const files = await vscode.workspace.findFiles(pattern, '**/.*/**');

            for (const file of files) {
                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf-8');
                    const plays = this._parsePlaybook(content);
                    
                    if (plays.length > 0) {
                        const relativePath = path.relative(workspaceRoot, file.fsPath);
                        // For multi-root, prefix with folder name to avoid collisions
                        const displayPath = workspaceFolders.length > 1 
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
                } catch (error) {
                    // Skip files that can't be read
                }
            }
        }
    }

    private _parsePlaybook(content: string): PlaybookPlay[] {
        const plays: PlaybookPlay[] = [];
        const lines = content.split('\n');
        
        let currentPlay: Partial<PlaybookPlay> | null = null;
        let inPlay = false;
        let playIndent = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || trimmed === '') {
                continue;
            }

            // Check for list item start (play start)
            const listMatch = line.match(/^(\s*)-\s*/);
            if (listMatch) {
                // If we have a previous play with hosts, save it
                if (currentPlay && currentPlay.hosts) {
                    plays.push({
                        name: currentPlay.name || 'Unknown',
                        hosts: currentPlay.hosts,
                        lineNumber: currentPlay.lineNumber || 0,
                    });
                }

                // Start new potential play
                currentPlay = { lineNumber: i + 1 };
                inPlay = true;
                playIndent = listMatch[1].length;

                // Check if hosts is on the same line
                const restOfLine = line.substring(listMatch[0].length);
                if (restOfLine.startsWith('hosts:')) {
                    const hostsMatch = restOfLine.match(/^hosts:\s*(.+)/);
                    if (hostsMatch) {
                        currentPlay.hosts = hostsMatch[1].trim();
                    }
                } else if (restOfLine.startsWith('name:')) {
                    const nameMatch = restOfLine.match(/^name:\s*(.+)/);
                    if (nameMatch) {
                        currentPlay.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
                    }
                }
                continue;
            }

            // If we're in a play, look for hosts: and name:
            if (inPlay && currentPlay) {
                const indent = line.match(/^(\s*)/)?.[1].length || 0;
                
                // Check if we've exited the play (less or equal indent with content)
                if (indent <= playIndent && trimmed !== '' && !trimmed.startsWith('#')) {
                    // This line is at a level that suggests we're starting a new top-level item
                    // But only if it's a list item
                    if (!line.match(/^\s*-\s/)) {
                        // Not a list item, still in play content
                    }
                }

                if (trimmed.startsWith('hosts:')) {
                    const hostsMatch = trimmed.match(/^hosts:\s*(.+)/);
                    if (hostsMatch) {
                        currentPlay.hosts = hostsMatch[1].trim();
                    }
                } else if (trimmed.startsWith('name:')) {
                    const nameMatch = trimmed.match(/^name:\s*(.+)/);
                    if (nameMatch) {
                        currentPlay.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
                    }
                }
            }
        }

        // Don't forget the last play
        if (currentPlay && currentPlay.hosts) {
            plays.push({
                name: currentPlay.name || 'Unknown',
                hosts: currentPlay.hosts,
                lineNumber: currentPlay.lineNumber || 0,
            });
        }

        return plays;
    }

    // Configuration management
    private _getConfigDir(): string | null {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return null;
        }
        return path.join(workspaceRoot, CACHE_DIR);
    }

    private _ensureConfigDir(): void {
        const configDir = this._getConfigDir();
        if (!configDir) {return;}

        const playbooksDir = path.join(configDir, PLAYBOOKS_CONFIG_DIR);
        if (!fs.existsSync(playbooksDir)) {
            fs.mkdirSync(playbooksDir, { recursive: true });
        }
    }

    public getGlobalConfig(): PlaybookConfig {
        const configDir = this._getConfigDir();
        if (!configDir) {
            return { ...DEFAULT_CONFIG };
        }

        const configPath = path.join(configDir, GLOBAL_CONFIG_FILE);
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
            }
        } catch (error) {
            log(`PlaybooksService: Error reading global config: ${error}`);
        }
        return { ...DEFAULT_CONFIG };
    }

    public saveGlobalConfig(config: PlaybookConfig): void {
        this._ensureConfigDir();
        const configDir = this._getConfigDir();
        if (!configDir) {return;}

        const configPath = path.join(configDir, GLOBAL_CONFIG_FILE);
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            log(`PlaybooksService: Saved global config`);
        } catch (error) {
            log(`PlaybooksService: Error saving global config: ${error}`);
        }
    }

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
                return { ...globalConfig, ...JSON.parse(content) };
            }
        } catch (error) {
            log(`PlaybooksService: Error reading playbook config: ${error}`);
        }
        return globalConfig;
    }

    public savePlaybookConfig(relativePath: string, config: PlaybookConfig): void {
        this._ensureConfigDir();
        const configDir = this._getConfigDir();
        if (!configDir) {return;}

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
            log(`PlaybooksService: Error saving playbook config: ${error}`);
        }
    }

    private _getPlaybookConfigPath(configDir: string, relativePath: string): string {
        // Preserve directory hierarchy: deploy/app.yml → playbooks/deploy/app.json
        const configRelPath = relativePath.replace(/\.ya?ml$/, '') + '.json';
        return path.join(configDir, PLAYBOOKS_CONFIG_DIR, configRelPath);
    }

    public buildCommand(playbookPath: string, config: PlaybookConfig): string {
        const args: string[] = ['ansible-playbook'];

        // Inventory
        if (config.inventory && config.inventory.length > 0) {
            for (const inv of config.inventory) {
                if (inv) {
                    args.push('-i', inv);
                }
            }
        }

        // Limit
        if (config.limit) {
            args.push('-l', config.limit);
        }

        // Tags
        if (config.tags && config.tags.length > 0) {
            for (const tag of config.tags) {
                if (tag) {
                    args.push('-t', tag);
                }
            }
        }

        // Skip tags
        if (config.skipTags && config.skipTags.length > 0) {
            for (const tag of config.skipTags) {
                if (tag) {
                    args.push('--skip-tags', tag);
                }
            }
        }

        // Extra vars
        if (config.extraVars) {
            args.push('-e', config.extraVars);
        }

        // Check mode
        if (config.check) {
            args.push('--check');
        }

        // Diff mode
        if (config.diff) {
            args.push('--diff');
        }

        // Verbose
        if (config.verbose && config.verbose > 0) {
            args.push('-' + 'v'.repeat(Math.min(config.verbose, 6)));
        }

        // Forks
        if (config.forks && config.forks !== 5) {
            args.push('-f', String(config.forks));
        }

        // Connection
        if (config.connection && config.connection !== 'ssh') {
            args.push('-c', config.connection);
        }

        // User
        if (config.user) {
            args.push('-u', config.user);
        }

        // Timeout
        if (config.timeout) {
            args.push('-T', String(config.timeout));
        }

        // Private key
        if (config.privateKey) {
            args.push('--private-key', config.privateKey);
        }

        // Become
        if (config.become) {
            args.push('--become');
        }

        // Become method
        if (config.becomeMethod && config.becomeMethod !== 'sudo') {
            args.push('--become-method', config.becomeMethod);
        }

        // Become user
        if (config.becomeUser && config.becomeUser !== 'root') {
            args.push('--become-user', config.becomeUser);
        }

        // Vault password file
        if (config.vaultPasswordFile) {
            args.push('--vault-password-file', config.vaultPasswordFile);
        }

        // Start at task
        if (config.startAtTask) {
            args.push('--start-at-task', config.startAtTask);
        }

        // Step
        if (config.step) {
            args.push('--step');
        }

        // Ask pass
        if (config.askPass) {
            args.push('--ask-pass');
        }

        // Ask become pass
        if (config.askBecomePass) {
            args.push('--ask-become-pass');
        }

        // Ask vault pass
        if (config.askVaultPass) {
            args.push('--ask-vault-pass');
        }

        // Playbook path
        args.push(playbookPath);

        return args.join(' ');
    }

    public generateAiPrompt(playbook: PlaybookInfo): string {
        return `Please analyze the Ansible playbook at "${playbook.relativePath}" and provide a comprehensive summary.

## Instructions:
1. Read the playbook file
2. Follow all imports (import_playbook, include_playbook)
3. Examine all roles used (check roles/ directory and requirements.yml)
4. List all tasks in order of execution
5. Identify any variables, handlers, and templates used
6. **Catalog all collections and plugins used** - note every fully-qualified collection name (FQCN) referenced in the playbook (e.g., ansible.builtin.copy, community.general.ufw)

## Required Output (in this order):

### Executive Summary
Provide a 1-2 paragraph summary explaining what this playbook accomplishes at a high level. Describe the purpose, the systems it targets, and the end result after successful execution. Write this for someone who needs to quickly understand what running this playbook will do.

### Hierarchical Structure
- Playbook: ${playbook.name}
  - Play 1: [name] (hosts: [hosts])
    - Pre-tasks: [list]
    - Roles: [list with brief description]
    - Tasks: [list with brief description]
    - Handlers: [list]
    - Post-tasks: [list]
  - Play 2: ...

### Collections Used
List all collections referenced in the playbook with their FQCNs.

### Other Dependencies
Note any additional external dependencies (Galaxy roles, required variables, inventory requirements, etc.)

---

## Final Step: Collection Audit (Do this LAST)
**Important: Complete all sections above before this step.**

1. Use the \`list_collections\` MCP tool to check which collections are currently installed
2. Compare the installed collections against those required by the playbook
3. Note any version requirements from collections/requirements.yml if present
4. **End your response by asking the user** if they would like to install any missing collections using the \`install_collection\` MCP tool

This prompt should be the final thing in your response so the user can easily respond with their choice.`;
    }
}
