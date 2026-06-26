import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { PluginDocPanel } from '@src/panels/PluginDocPanel';
import { AnsibleDevToolsProvider } from '@src/views/AnsibleDevToolsProvider';
import { EnvironmentManagersProvider } from '@src/views/EnvironmentManagersProvider';
import { CollectionsProvider } from '@src/views/CollectionsProvider';
import { ExecutionEnvironmentsProvider } from '@src/views/ExecutionEnvironmentsProvider';
import { CreatorProvider } from '@src/views/CreatorProvider';
import { CreatorFormPanel } from '@src/panels/CreatorFormPanel';
import { PlaybooksProvider } from '@src/views/PlaybooksProvider';
import { PlaybookConfigPanel } from '@src/panels/PlaybookConfigPanel';
import { PlaybookProgressPanel } from '@src/panels/PlaybookProgressPanel';
import { EEDetailPanel } from '@src/panels/EEDetailPanel';
import { PackageDetailPanel } from '@src/panels/PackageDetailPanel';
import { PlaybooksService, PlaybookInfo, PlaybookPlay } from '@src/services/PlaybooksService';
import { TerminalService } from '@src/services/TerminalService';
import { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import {
    McpToolsProvider,
    injectToolPromptIntoChat,
    type ToolInfo,
} from '@src/views/McpToolsProvider';
import {
    CollectionSourcesProvider,
    setCollectionSourcesLogFunction,
    type CollectionSourceInfo,
} from '@src/views/CollectionSourcesProvider';
import {
    GalaxyCollectionCache,
    GalaxyDocsCache,
    SCMDocsCache,
    CollectionsService,
    setLogFunction as setCollectionsLogFunction,
    DevToolsService,
    cacheSelectedEnvironment,
    getCommandService,
    SkillRegistry,
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildGalaxyPluginExplanationPrompt,
    buildScmPluginExplanationPrompt,
    buildEESummaryPrompt,
    buildEEDetailPrompt,
    buildCreatorOverviewPrompt,
    buildCreatorCommandWalkthroughPrompt,
} from '@ansible/services';
import type { PythonEnvironment, SchemaNode, SkillSource, SkillEntry } from '@ansible/services';
import { SkillsProvider, openChatWithSkill, copySkillPrompt } from '@src/views/SkillsProvider';
import {
    registerMcpServerProvider,
    isMcpAvailable,
    registerCursorMcpServer,
    configureCursorMcp,
    showCursorMcpStatus,
    getMcpStatus,
    detectIde,
} from '@src/mcp';
import { getLlmService } from '@src/services/LlmService';
import { registerFileAssociation } from '@src/features/fileAssociation';
import { registerVaultCommand } from '@src/features/vault';
import { registerLightspeed } from '@src/features/lightspeed/register';
import { AnsibleStatusBar } from '@src/statusBar/ansibleStatusBar';
import { DiagnosticsPanel } from '@src/panels/DiagnosticsPanel';

// Create output channel for extension logs
export const outputChannel = vscode.window.createOutputChannel('Ansible');

let _logFilePath: string | undefined;
let _logStream: fs.WriteStream | undefined;
const _LOG_MAX_SIZE = 512 * 1024; // 512 KB — rotate when exceeded

/**
 * Ensure the extension log file exists and rotate it when oversized.
 * @param context - Extension context providing the log directory URI
 * @returns Absolute path to the active extension log file
 */
function _ensureLogFile(context: vscode.ExtensionContext): string {
    if (_logFilePath) {
        return _logFilePath;
    }
    const logDir = context.logUri.fsPath;
    fs.mkdirSync(logDir, { recursive: true });
    _logFilePath = path.join(logDir, 'ansible-extension.log');

    // Rotate if oversized
    try {
        const stat = fs.statSync(_logFilePath);
        if (stat.size > _LOG_MAX_SIZE) {
            const prev = `${_logFilePath}.1`;
            fs.renameSync(_logFilePath, prev);
        }
    } catch {
        // File doesn't exist yet — fine
    }

    _logStream = fs.createWriteStream(_logFilePath, { flags: 'a' });
    return _logFilePath;
}

/**
 * Convert an unknown thrown value into a log-safe error message.
 * @param error - Error object or value to stringify
 * @returns Human-readable error message text
 */
function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Write a timestamped message to the output channel and log file.
 * @param message - Log message to record
 */
export function log(message: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    outputChannel.appendLine(line);
    _logStream?.write(line + '\n');
}

/**
 * Path to the current log file (available after activation).
 * @returns Absolute log file path, or undefined before activation
 */
export function getLogFilePath(): string | undefined {
    return _logFilePath;
}

/**
 * Open the AI chat with a prompt pre-filled.
 * Uses the configured chat provider (vscode or abbenay).
 * Falls back to clipboard if the command doesn't support the query parameter.
 * @param prompt - Prompt text to send to the configured chat provider
 */
async function openChatWithPrompt(prompt: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('ansibleEnvironments');
    const chatProvider = config.get<string>('llm.chatProvider', 'vscode');

    if (chatProvider === 'abbenay') {
        try {
            await vscode.commands.executeCommand('abbenay.chatView.focus');
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                'Abbenay chat focused. Prompt copied to clipboard — paste to send.',
            );
        } catch {
            vscode.window.showWarningMessage(
                'Abbenay extension not found. Install it or switch to VS Code chat in settings.',
            );
        }
    } else {
        // Use VS Code's built-in chat (Copilot)
        try {
            // Try to open chat with the prompt directly (VS Code 1.93+ with Copilot)
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
            vscode.window.showInformationMessage('Prompt sent to chat.');
        } catch {
            // Fallback: copy to clipboard and let user paste
            await vscode.env.clipboard.writeText(prompt);
            vscode.window
                .showInformationMessage(
                    'AI prompt copied to clipboard. Paste it into an agent chat session.',
                    'Open Chat',
                )
                .then((selection) => {
                    if (selection === 'Open Chat') {
                        vscode.commands.executeCommand('workbench.action.chat.open');
                    }
                });
        }
    }
}

/**
 * Activate the Ansible extension and register providers and commands.
 * @param context - VS Code extension activation context
 */
export function activate(context: vscode.ExtensionContext) {
    // Initialize file-based logging (before anything else so all messages are captured)
    const logFile = _ensureLogFile(context);
    log(`Log file: ${logFile}`);

    outputChannel.show(true);

    registerFileAssociation(context);
    registerVaultCommand(context);
    registerLightspeed(context)
        .then((disposable) => {
            if (disposable) context.subscriptions.push(disposable);
        })
        .catch((e: unknown) => {
            console.error('[lightspeed] Registration failed:', e);
        });

    // Inject log function into services
    setCollectionsLogFunction(log);
    setCollectionSourcesLogFunction(log);

    log('Ansible extension is now active');
    console.log('Ansible extension is now active');

    // Helper to update MCP status context
    const updateMcpStatusContext = () => {
        const status = getMcpStatus(context);
        vscode.commands.executeCommand('setContext', 'ansibleMcp.configured', status.isConfigured);
        log(`MCP Status: IDE=${status.ide}, configured=${String(status.isConfigured)}`);
    };

    // Set initial MCP status context
    updateMcpStatusContext();

    // Register MCP server with the appropriate IDE API
    const ide = detectIde();
    if (ide === 'cursor') {
        if (registerCursorMcpServer(context)) {
            log('MCP server registered via Cursor extension API');
        } else {
            log(
                'Cursor MCP auto-registration failed (API unavailable or server binary missing) — user can configure manually via command',
            );
        }
    } else if (isMcpAvailable()) {
        registerMcpServerProvider(context);
        log('MCP server provider registered for VS Code');
    } else {
        log('VS Code MCP API not available (requires VS Code 1.99+)');
    }

    // Check if workspace is open
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Ansible requires an open workspace folder.');
        return;
    }

    // Start the Ansible Language Server
    const serverModule = context.asAbsolutePath(path.join('dist', 'language-server.js'));
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const serverEnv: Record<string, string> = {};
    if (workspaceRoot) {
        serverEnv.ANSIBLE_ENV_WORKSPACE = workspaceRoot;
    }
    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { cwd: workspaceRoot, env: serverEnv },
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6009'],
                cwd: workspaceRoot,
                env: serverEnv,
            },
        },
    };
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ansible' }],
        synchronize: {
            fileEvents: [
                vscode.workspace.createFileSystemWatcher('**/ansible.cfg'),
                vscode.workspace.createFileSystemWatcher('**/.ansible-lint'),
            ],
        },
    };
    const languageClient = new LanguageClient(
        'ansibleLanguageServer',
        'Ansible Language Server',
        serverOptions,
        clientOptions,
    );
    void languageClient.start();
    context.subscriptions.push(languageClient);
    log('Ansible Language Server started');

    // Initialize centralized Python environment service (handles PET detection,
    // ms-python.python fallback, and environment change events)
    const pythonEnvService = PythonEnvironmentService.getInstance();
    context.subscriptions.push(pythonEnvService);

    // Unified Ansible status bar — single icon for all Ansible status and actions
    const ansibleStatusBar = new AnsibleStatusBar(context, languageClient, pythonEnvService);
    context.subscriptions.push(ansibleStatusBar);

    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.showDiagnostics', () => {
            DiagnosticsPanel.show(context, ansibleStatusBar);
        }),
        vscode.commands.registerCommand('ansible.open-output', () => {
            outputChannel.show(true);
        }),
        vscode.commands.registerCommand('ansible.statusBar.refresh', () => {
            ansibleStatusBar.forceRefresh();
        }),
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            ansibleStatusBar.update();
        }),
        vscode.workspace.onDidOpenTextDocument(() => {
            ansibleStatusBar.update();
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration('ansible') ||
                e.affectsConfiguration('ansibleEnvironments')
            ) {
                ansibleStatusBar.forceRefresh();
            }
        }),
    );

    // Wire terminal service to Python environment service
    const terminalService = TerminalService.getInstance();
    terminalService.setPythonEnvService(pythonEnvService);

    // Wire terminal factory into DevToolsService so upgrade works in all editors
    DevToolsService.setTerminalServiceFactory(() => TerminalService);

    // Inject bin dir resolver into CommandService BEFORE any providers are
    // constructed so that early refresh() calls resolve the venv, not ~/.local/bin.
    const commandService = getCommandService();
    let binDirLogged = false;
    commandService.setBinDirResolver(async (workspaceUri) => {
        await pythonEnvService.initialize();
        const env = await pythonEnvService.getEnvironment(workspaceUri as vscode.Uri | undefined);
        if (env?.execInfo.run.executable) {
            const binDir = path.dirname(env.execInfo.run.executable);
            if (!binDirLogged) {
                log(`binDirResolver: env=${env.displayName}, binDir=${binDir}`);
                binDirLogged = true;
            }
            return binDir;
        }
        log('binDirResolver: no environment or executable found');
        return null;
    });

    pythonEnvService
        .initialize()
        .then((available) => {
            const capability = pythonEnvService.getCapability();
            log(
                `Python Environment Service initialized: available=${String(available)}, capability=${capability}, fullApi=${String(pythonEnvService.hasFullApi())}, envsExt=${String(pythonEnvService.hasEnvsExtension())}`,
            );

            // Publish capability context keys for viewsWelcome `when` clauses
            void vscode.commands.executeCommand(
                'setContext',
                'ansible.pythonEnvCapability',
                capability,
            );
            void vscode.commands.executeCommand(
                'setContext',
                'ansible.pythonEnvAvailable',
                available,
            );

            // Wire package installer into DevToolsService when envs extension is available
            if (pythonEnvService.hasEnvsExtension()) {
                const devToolsService = DevToolsService.getInstance();
                devToolsService.setPackageInstaller(async () => {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                    const env = await pythonEnvService.getEnvironment(workspaceFolder);
                    if (!env) {
                        throw new Error('No Python environment selected');
                    }
                    await pythonEnvService.managePackages(env, {
                        install: ['ansible-dev-tools'],
                        upgrade: false,
                    });
                });
            }

            // One-time degraded-mode notice when python-envs is missing
            if (capability === 'python-only') {
                const DISMISSED_KEY = 'ansible.pythonEnvsDegradedDismissed';
                if (!context.globalState.get<boolean>(DISMISSED_KEY)) {
                    void vscode.window
                        .showInformationMessage(
                            'Python Environments extension not found. Environment creation and package install will use terminal fallbacks.',
                            'Install Extension',
                            'Dismiss',
                        )
                        .then((selection) => {
                            if (selection === 'Install Extension') {
                                void vscode.commands.executeCommand(
                                    'workbench.extensions.search',
                                    'ms-python.vscode-python-envs',
                                );
                            }
                            void context.globalState.update(DISMISSED_KEY, true);
                        });
                }
            }

            // Cache environment for standalone consumers (MCP server, language server)
            const refreshCache = async () => {
                try {
                    const env = await pythonEnvService.getEnvironment();
                    if (env?.execInfo.run.executable) {
                        const execPath = env.execInfo.run.executable;
                        log(`Caching environment: ${env.displayName} (${execPath})`);
                        cacheSelectedEnvironment(execPath, env.displayName);
                    } else {
                        log('No environment executable found to cache');
                    }
                } catch (error) {
                    log(`Failed to refresh environment cache: ${formatError(error)}`);
                }
            };

            let cacheDebounce: ReturnType<typeof setTimeout> | undefined;
            const envCacheListener = pythonEnvService.onDidChangeEnvironment(() => {
                if (cacheDebounce) {
                    clearTimeout(cacheDebounce);
                }
                cacheDebounce = setTimeout(() => {
                    cacheDebounce = undefined;
                    void refreshCache();
                    ansibleStatusBar.forceRefresh();
                }, 1000);
            });
            context.subscriptions.push(envCacheListener);
            setTimeout(() => {
                void refreshCache();
            }, 2000);
        })
        .catch((error: unknown) => {
            log(`Python Environment Service initialization failed: ${formatError(error)}`);
        });

    // Register the Environment Managers view
    const envManagersProvider = new EnvironmentManagersProvider(pythonEnvService);
    const envManagersView = vscode.window.createTreeView('ansibleDevToolsEnvManagers', {
        treeDataProvider: envManagersProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(envManagersView);

    // Register the Packages view
    const devToolsProvider = new AnsibleDevToolsProvider(pythonEnvService);
    const packagesView = vscode.window.createTreeView('ansibleDevToolsPackages', {
        treeDataProvider: devToolsProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(packagesView);

    // Register the Collections view
    const collectionsProvider = new CollectionsProvider(pythonEnvService);
    const collectionsView = vscode.window.createTreeView('ansibleDevToolsCollections', {
        treeDataProvider: collectionsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(collectionsView);

    // Register the Execution Environments view
    const eeProvider = new ExecutionEnvironmentsProvider();
    const eeView = vscode.window.createTreeView('ansibleExecutionEnvironments', {
        treeDataProvider: eeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(eeView);

    // Register the Creator view
    const creatorProvider = new CreatorProvider();
    const creatorView = vscode.window.createTreeView('ansibleCreator', {
        treeDataProvider: creatorProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(creatorView);

    // Register the Playbooks view
    const playbooksProvider = new PlaybooksProvider();
    const playbooksView = vscode.window.createTreeView('ansiblePlaybooks', {
        treeDataProvider: playbooksProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(playbooksView);

    // Refresh playbooks when workspace folders change
    const workspaceFoldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        log('Workspace folders changed, refreshing playbooks...');
        playbooksProvider.refresh();
    });
    context.subscriptions.push(workspaceFoldersListener);

    // Register the MCP Tools view
    const mcpToolsProvider = new McpToolsProvider(context);
    const mcpToolsView = vscode.window.createTreeView('ansibleMcpTools', {
        treeDataProvider: mcpToolsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(mcpToolsView);

    // Register the Collection Sources view
    const collectionSourcesProvider = new CollectionSourcesProvider();
    const collectionSourcesView = vscode.window.createTreeView('ansibleCollectionSources', {
        treeDataProvider: collectionSourcesProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(collectionSourcesView);

    // Configure skill registry from settings and register Skills view
    const skillSources =
        vscode.workspace
            .getConfiguration('ansibleEnvironments')
            .get<SkillSource[]>('skillSources') ?? [];
    const skillRegistry = SkillRegistry.getInstance();
    skillRegistry.setSources(skillSources);

    const skillsProvider = new SkillsProvider();
    const skillsView = vscode.window.createTreeView('ansibleSkills', {
        treeDataProvider: skillsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(skillsView);

    context.subscriptions.push(
        vscode.commands.registerCommand('ansibleSkills.refresh', () => {
            skillsProvider.refresh();
        }),
        vscode.commands.registerCommand(
            'ansibleSkills.useInChat',
            (arg: SkillEntry | { skill: SkillEntry }) => {
                const skill = 'skill' in arg ? arg.skill : arg;
                void openChatWithSkill(skill);
            },
        ),
        vscode.commands.registerCommand(
            'ansibleSkills.copyPrompt',
            (arg: SkillEntry | { skill: SkillEntry }) => {
                const skill = 'skill' in arg ? arg.skill : arg;
                void copySkillPrompt(skill);
            },
        ),
    );

    // Reload skill sources when settings change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ansibleEnvironments.skillSources')) {
                const updated =
                    vscode.workspace
                        .getConfiguration('ansibleEnvironments')
                        .get<SkillSource[]>('skillSources') ?? [];
                skillRegistry.setSources(updated);
                skillsProvider.refresh();
            }
        }),
    );

    // Register sidebar commands
    const refreshCommand = vscode.commands.registerCommand(
        'ansibleDevToolsPackages.refresh',
        () => {
            void devToolsProvider.refresh();
        },
    );

    const installCommand = vscode.commands.registerCommand(
        'ansibleDevToolsPackages.install',
        async () => {
            try {
                const devToolsService = DevToolsService.getInstance();
                await devToolsService.install();
                vscode.window.showInformationMessage('ansible-dev-tools installation started.');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install ansible-dev-tools: ${formatError(error)}`,
                );
            }
        },
    );

    const upgradeCommand = vscode.commands.registerCommand(
        'ansibleDevToolsPackages.upgrade',
        async () => {
            try {
                const devToolsService = DevToolsService.getInstance();
                await devToolsService.upgrade();
                vscode.window.showInformationMessage('Upgrading ansible-dev-tools...');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to upgrade ansible-dev-tools: ${formatError(error)}`,
                );
            }
        },
    );

    // Register Environment Managers commands
    const envManagersRefreshCommand = vscode.commands.registerCommand(
        'ansibleDevToolsEnvManagers.refresh',
        () => {
            void envManagersProvider.refresh();
        },
    );

    const envManagersCreateCommand = vscode.commands.registerCommand(
        'ansibleDevToolsEnvManagers.create',
        async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open.');
                    return;
                }

                const environment = await pythonEnvService.createEnvironment(workspaceFolder, {
                    quickCreate: false,
                });

                if (environment) {
                    vscode.window.showInformationMessage(
                        `Created environment: ${environment.displayName}`,
                    );
                    void envManagersProvider.refresh();
                    void devToolsProvider.refresh();
                    void collectionsProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to create environment: ${formatError(error)}`,
                );
            }
        },
    );

    const selectEnvCommand = vscode.commands.registerCommand(
        'ansibleDevTools.selectEnvironment',
        async (environment: PythonEnvironment) => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;

                // Check if this is a global/system environment
                const isGlobalEnv = environment.envId.managerId.toLowerCase().includes('system');

                if (isGlobalEnv) {
                    const selection = await vscode.window.showWarningMessage(
                        'Use of global Python environments for Ansible development is strongly discouraged. Please create and select a virtual environment instead.',
                        'Create Virtual Environment',
                        'Use Anyway',
                    );

                    if (selection === 'Create Virtual Environment') {
                        void vscode.commands.executeCommand('ansibleDevToolsEnvManagers.create');
                        return;
                    } else if (selection !== 'Use Anyway') {
                        return;
                    }
                }

                await pythonEnvService.setEnvironment(workspaceFolder, environment);
                vscode.window.showInformationMessage(
                    `Selected environment: ${environment.displayName}`,
                );

                void envManagersProvider.refresh();
                void devToolsProvider.refresh();
                void collectionsProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to select environment: ${formatError(error)}`,
                );
            }
        },
    );

    // Start background loading of Galaxy collections cache
    const galaxyCache = GalaxyCollectionCache.getInstance();
    galaxyCache.setExtensionContext(context);
    galaxyCache.startBackgroundLoad();

    // Initialize Galaxy docs-blob cache
    const galaxyDocsCache = GalaxyDocsCache.getInstance();
    galaxyDocsCache.setExtensionContext(context);

    // Initialize SCM docs cache for GitHub collection plugin browsing
    const scmDocsCache = SCMDocsCache.getInstance();
    scmDocsCache.setLogFunction(log);

    // Register Collections commands
    const collectionsRefreshCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.refresh',
        () => {
            void collectionsProvider.refresh();
        },
    );

    // Register Collections search command
    interface PluginQuickPickItem extends vscode.QuickPickItem {
        fullName: string;
        pluginType: string;
    }

    const collectionsSearchCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.search',
        () => {
            const collectionsService = CollectionsService.getInstance();

            // Get all plugins from all collections
            const allPlugins: PluginQuickPickItem[] = [];

            for (const [, data] of collectionsService.getCollections()) {
                for (const [pluginType, plugins] of data.pluginTypes) {
                    for (const plugin of plugins) {
                        allPlugins.push({
                            label: plugin.fullName,
                            description: `(${pluginType})`,
                            detail: plugin.shortDescription,
                            fullName: plugin.fullName,
                            pluginType: pluginType,
                        });
                    }
                }
            }

            // Sort alphabetically
            allPlugins.sort((a, b) => a.label.localeCompare(b.label));

            const quickPick = vscode.window.createQuickPick<PluginQuickPickItem>();
            quickPick.title = 'Search Plugins';
            quickPick.placeholder = 'Type to search... (e.g., "interface" or "module:config")';
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;
            quickPick.items = allPlugins;

            quickPick.onDidChangeValue((value) => {
                // Support typed search: "module:name" or "filter:name"
                const typeMatch = /^(\w+):(.*)$/.exec(value);
                if (typeMatch) {
                    const [, pluginType, query] = typeMatch;
                    const lowerQuery = query.toLowerCase();
                    const lowerType = pluginType.toLowerCase();
                    quickPick.items = allPlugins.filter(
                        (p) =>
                            p.pluginType.toLowerCase() === lowerType &&
                            (p.label.toLowerCase().includes(lowerQuery) ||
                                (p.detail?.toLowerCase().includes(lowerQuery) ?? false)),
                    );
                } else {
                    // Regular search - let QuickPick handle matching
                    quickPick.items = allPlugins;
                }
            });

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                quickPick.hide();
                // Open plugin documentation
                void vscode.commands.executeCommand(
                    'ansibleDevTools.showPluginDoc',
                    selected.fullName,
                    selected.pluginType,
                );
            });

            quickPick.onDidHide(() => {
                quickPick.dispose();
            });
            quickPick.show();
        },
    );

    // Register Execution Environments refresh command
    const eeRefreshCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.refresh',
        () => {
            eeProvider.refresh();
        },
    );

    // Open EE detail panel
    const eeDetailCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.showDetail',
        (eeName: string) => {
            EEDetailPanel.show(context.extensionUri, eeName);
        },
    );
    context.subscriptions.push(eeDetailCommand);

    // Open package detail panel
    const packageDetailCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.showPackageDetail',
        (eeName: string, packageName: string, packageType: 'python' | 'system') => {
            PackageDetailPanel.show(context.extensionUri, eeName, packageName, packageType);
        },
    );
    context.subscriptions.push(packageDetailCommand);

    // AI Summary Commands - Collections
    const collectionsAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.aiSummary',
        async () => {
            await openChatWithPrompt(buildCollectionsSummaryPrompt());
        },
    );

    const collectionsAiCollectionSummaryCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.aiCollectionSummary',
        async (node: { name: string }) => {
            if (!node.name) {
                return;
            }
            await openChatWithPrompt(buildCollectionSummaryPrompt(node.name));
        },
    );

    const collectionsAiPluginSummaryCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.aiPluginSummary',
        async (node: { fullName: string; pluginType: string }) => {
            if (!node.fullName) {
                return;
            }
            await openChatWithPrompt(buildPluginExplanationPrompt(node.fullName, node.pluginType));
        },
    );

    // AI Summary Commands - Execution Environments
    const eeAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.aiSummary',
        async () => {
            await openChatWithPrompt(buildEESummaryPrompt());
        },
    );

    const eeAiEESummaryCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.aiEESummary',
        async (node: { label: string }) => {
            if (!node.label) {
                return;
            }
            await openChatWithPrompt(buildEEDetailPrompt(node.label));
        },
    );

    // AI Summary Commands - Creator
    const creatorAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleCreator.aiSummary',
        async () => {
            await openChatWithPrompt(buildCreatorOverviewPrompt());
        },
    );

    const creatorAiEntrySummaryCommand = vscode.commands.registerCommand(
        'ansibleCreator.aiEntrySummary',
        async (node: {
            label: string;
            schema: { description?: string };
            commandPath: string[];
        }) => {
            if (node.commandPath.length === 0) {
                return;
            }
            const commandStr = `ansible-creator ${node.commandPath.join(' ')}`;
            const toolName = `ac_${node.commandPath
                .map((p: string) => {
                    const abbr: Record<string, string> = {
                        resource: 'res',
                        execution_environment: 'ee',
                        'execution-environment': 'ee',
                        devcontainer: 'devc',
                        devfile: 'devf',
                        collection: 'coll',
                        plugin: 'plug',
                        project: 'proj',
                        playbook: 'play',
                    };
                    return abbr[p] || p;
                })
                .join('_')}`;

            const prompt = buildCreatorCommandWalkthroughPrompt(
                commandStr,
                toolName,
                node.schema.description,
            );
            await openChatWithPrompt(prompt);
        },
    );

    // Register Creator commands
    const creatorRefreshCommand = vscode.commands.registerCommand('ansibleCreator.refresh', () => {
        creatorProvider.refresh();
    });

    const creatorOpenFormCommand = vscode.commands.registerCommand(
        'ansibleCreator.openForm',
        (arg1: string[] | { commandPath: string[]; schema: unknown }, arg2?: unknown) => {
            if (Array.isArray(arg1)) {
                CreatorFormPanel.show(context.extensionUri, arg1, arg2 as SchemaNode);
            } else {
                CreatorFormPanel.show(
                    context.extensionUri,
                    arg1.commandPath,
                    arg1.schema as SchemaNode,
                );
            }
        },
    );

    // Register Playbooks commands
    const playbooksRefreshCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.refresh',
        () => {
            playbooksProvider.refresh();
        },
    );

    const playbooksEditConfigCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.editConfig',
        (node: { playbook: PlaybookInfo }) => {
            PlaybookConfigPanel.show(context.extensionUri, node.playbook);
        },
    );

    const playbooksEditDefaultsCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.editDefaults',
        () => {
            PlaybookConfigPanel.show(context.extensionUri);
        },
    );

    const playbooksRunCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.run',
        async (node: { playbook: PlaybookInfo }) => {
            const playbooksService = PlaybooksService.getInstance();
            const config = playbooksService.getPlaybookConfig(node.playbook.relativePath);

            // Calculate path relative to the playbook's workspace folder
            const workspaceFolderPath = node.playbook.workspaceFolder.fsPath;
            const playbookRelativePath = path.relative(workspaceFolderPath, node.playbook.path);

            const command = playbooksService.buildCommand(playbookRelativePath, config);

            log(`Running playbook: ${command} in ${workspaceFolderPath}`);

            // Use TerminalService for proper venv activation handling
            // Use the playbook's workspace folder as cwd
            const terminalService = TerminalService.getInstance();
            const managed = await terminalService.createActivatedTerminal({
                name: `ansible-playbook: ${node.playbook.name}`,
                cwd: node.playbook.workspaceFolder,
                show: true,
            });

            log('Terminal ready, sending command...');

            // Fire and forget - user watches terminal output
            void managed.sendCommand(command, { waitForCompletion: false });
        },
    );

    // Run playbook with progress viewer
    const playbooksRunWithProgressCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.runWithProgress',
        async (node: { playbook: PlaybookInfo }) => {
            const playbooksService = PlaybooksService.getInstance();
            const config = playbooksService.getPlaybookConfig(node.playbook.relativePath);

            // Calculate path relative to the playbook's workspace folder
            const workspaceFolderPath = node.playbook.workspaceFolder.fsPath;
            const playbookRelativePath = path.relative(workspaceFolderPath, node.playbook.path);

            const command = playbooksService.buildCommand(playbookRelativePath, config);

            log(`Running playbook with progress: ${command} in ${workspaceFolderPath}`);

            // Show progress panel
            await PlaybookProgressPanel.show(context.extensionUri, {
                playbookPath: node.playbook.path,
                playbookName: node.playbook.name,
                workspaceFolder: node.playbook.workspaceFolder,
                command: command,
                extensionPath: context.extensionPath,
            });
        },
    );

    const playbooksOpenCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.openPlaybook',
        async (arg: PlaybookInfo | { playbook: PlaybookInfo }) => {
            // Handle both direct PlaybookInfo and node wrapper from context menu
            const playbook = 'playbook' in arg ? arg.playbook : arg;
            if (playbook.path) {
                // Use vscode.open command which handles files more robustly
                const uri = vscode.Uri.file(playbook.path);
                await vscode.commands.executeCommand('vscode.open', uri);
            }
        },
    );

    const playbooksGoToPlayCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.goToPlay',
        async (playbook: PlaybookInfo, play: PlaybookPlay) => {
            const uri = vscode.Uri.file(playbook.path);
            const line = play.lineNumber - 1;
            // Use vscode.open with selection option to go to specific line
            await vscode.commands.executeCommand('vscode.open', uri, {
                selection: new vscode.Range(line, 0, line, 0),
            });
        },
    );

    const playbooksAiSummaryCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.aiSummary',
        async (node: { playbook: PlaybookInfo }) => {
            const service = PlaybooksService.getInstance();
            const prompt = service.generateAiPrompt(node.playbook);

            await openChatWithPrompt(prompt);
        },
    );

    // Register Cursor MCP configuration commands
    const configureCursorMcpCommand = vscode.commands.registerCommand(
        'ansible-environments.configureCursorMcp',
        () => {
            void configureCursorMcp(context);
        },
    );

    const showMcpStatusCommand = vscode.commands.registerCommand(
        'ansible-environments.showMcpStatus',
        () => {
            showCursorMcpStatus(context);
        },
    );

    // Register MCP Tools commands
    const mcpToolsRefreshCommand = vscode.commands.registerCommand(
        'ansibleMcpTools.refresh',
        () => {
            mcpToolsProvider.refresh();
        },
    );

    const mcpToolsUseInChatCommand = vscode.commands.registerCommand(
        'ansibleMcpTools.useInChat',
        async (toolInfo: ToolInfo) => {
            await injectToolPromptIntoChat(toolInfo);
        },
    );

    const mcpToolsCopyPromptCommand = vscode.commands.registerCommand(
        'ansibleMcpTools.copyPrompt',
        async (node: { toolInfo: ToolInfo }) => {
            await openChatWithPrompt(node.toolInfo.examplePrompt);
        },
    );

    const mcpToolsConfigureCommand = vscode.commands.registerCommand(
        'ansibleMcpTools.configure',
        async () => {
            await configureCursorMcp(context);
            updateMcpStatusContext();
            mcpToolsProvider.refresh();
        },
    );

    // Register Collection Sources commands
    const collectionSourcesRefreshCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refresh',
        async () => {
            await collectionSourcesProvider.refreshAll();
        },
    );

    const collectionSourcesRefreshSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refreshSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesProvider.refreshSource(node.source);
        },
    );

    const collectionSourcesAddSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.addSource',
        async () => {
            await collectionSourcesProvider.addSource();
        },
    );

    const collectionSourcesInstallCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.install',
        async () => {
            await collectionSourcesProvider.installCollection();
        },
    );

    const collectionSourcesSearchCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.search',
        async () => {
            await collectionSourcesProvider.searchAllSources();
        },
    );

    const collectionSourcesSearchSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.searchSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesProvider.searchSource(node.source);
        },
    );

    const collectionSourcesInstallFromSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.installFromSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesProvider.installFromSource(node.source);
        },
    );

    const collectionSourcesAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.aiSummary',
        () => {
            void collectionSourcesProvider.generateAiSummary();
        },
    );

    const collectionSourcesAiSourceSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.aiSourceSummary',
        (node: { source: CollectionSourceInfo }) => {
            void collectionSourcesProvider.generateSourceAiSummary(node.source);
        },
    );

    const filterGalaxyCollectionsCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.filterGalaxyCollections',
        async () => {
            await collectionSourcesProvider.filterGalaxyCollections();
        },
    );

    const clearGalaxyFilterCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.clearGalaxyFilter',
        () => {
            collectionSourcesProvider.clearGalaxyFilter();
        },
    );

    const installGalaxyCollectionCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.installGalaxyCollection',
        async (node?: { collection: { namespace: string; name: string } }) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a Galaxy collection from the tree view.');
                return;
            }
            await collectionSourcesProvider.installGalaxyCollection(
                node as Parameters<typeof collectionSourcesProvider.installGalaxyCollection>[0],
            );
        },
    );

    const showGalaxyPluginDocCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.showGalaxyPluginDoc',
        async (node?: Parameters<typeof collectionSourcesProvider.showGalaxyPluginDoc>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a Galaxy plugin from the tree view.');
                return;
            }
            await collectionSourcesProvider.showGalaxyPluginDoc(node, context.extensionUri);
        },
    );

    const galaxyPluginAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.galaxyPluginAiSummary',
        async (node?: {
            plugin: { name: string; fullName: string };
            pluginType: string;
            collection: { namespace: string; name: string };
        }) => {
            if (
                !vscode.workspace
                    .getConfiguration('ansibleEnvironments')
                    .get<boolean>('enableAiFeatures', true)
            ) {
                return;
            }
            if (!node) {
                vscode.window.showWarningMessage('Select a Galaxy plugin from the tree view.');
                return;
            }
            const collectionFqcn = `${node.collection.namespace}.${node.collection.name}`;
            const prompt = buildGalaxyPluginExplanationPrompt(
                collectionFqcn,
                node.plugin.name,
                node.pluginType,
            );
            await openChatWithPrompt(prompt);
        },
    );

    const githubPluginAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.githubPluginAiSummary',
        async (node?: {
            plugin: { name: string; fullName: string };
            pluginType: string;
            collection: { namespace: string; name: string; org: string; repository: string };
        }) => {
            if (
                !vscode.workspace
                    .getConfiguration('ansibleEnvironments')
                    .get<boolean>('enableAiFeatures', true)
            ) {
                return;
            }
            if (!node) {
                vscode.window.showWarningMessage('Select a GitHub plugin from the tree view.');
                return;
            }
            const collectionFqcn = `${node.collection.namespace}.${node.collection.name}`;
            const repo = node.collection.repository.split('/').pop() ?? node.collection.repository;
            const prompt = buildScmPluginExplanationPrompt(
                node.collection.org,
                repo,
                collectionFqcn,
                node.plugin.name,
                node.pluginType,
            );
            await openChatWithPrompt(prompt);
        },
    );

    const showGitHubPluginDocCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.showGitHubPluginDoc',
        async (node?: Parameters<typeof collectionSourcesProvider.showGitHubPluginDoc>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a GitHub plugin from the tree view.');
                return;
            }
            await collectionSourcesProvider.showGitHubPluginDoc(node, context.extensionUri);
        },
    );

    const refreshGitHubCollectionCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refreshGitHubCollection',
        (node?: Parameters<typeof collectionSourcesProvider.refreshGitHubCollection>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a GitHub collection from the tree view.');
                return;
            }
            collectionSourcesProvider.refreshGitHubCollection(node);
        },
    );

    // Register Galaxy cache refresh command
    const galaxyCacheRefreshCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.refreshGalaxyCache',
        () => {
            void (async () => {
                vscode.window.showInformationMessage('Refreshing Galaxy collections cache...');
                await galaxyCache.forceRefresh();
                vscode.window.showInformationMessage(
                    `Galaxy cache refreshed: ${String(galaxyCache.getCollections().length)} collections loaded`,
                );
            })();
        },
    );

    const collectionsInstallCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.install',
        () => {
            try {
                const collectionsService = CollectionsService.getInstance();

                // Show quick pick immediately
                const quickPick = vscode.window.createQuickPick();
                quickPick.title = 'Install Ansible Collection';
                quickPick.placeholder = 'Type to search collections...';
                quickPick.matchOnDescription = true;
                quickPick.matchOnDetail = true;
                quickPick.busy = !galaxyCache.isLoaded();

                const updateItems = (query: string) => {
                    if (!galaxyCache.isLoaded()) {
                        const progress = galaxyCache.getProgress();
                        const progressText =
                            progress.total > 0
                                ? `${String(progress.loaded)} of ${String(progress.total)}`
                                : '...';
                        quickPick.items = [
                            {
                                label: `$(sync~spin) Loading collections from Galaxy... ${progressText}`,
                                description: '',
                                alwaysShow: true,
                            },
                        ];
                        return;
                    }

                    const results = galaxyCache.search(query);
                    quickPick.items = results.map((c) => ({
                        label: `${c.namespace}.${c.name}`,
                        description: `v${c.version}`,
                        detail: c.deprecated
                            ? '(deprecated)'
                            : `${c.downloadCount.toLocaleString()} downloads`,
                    }));
                };

                // Initial items
                updateItems('');

                // If cache loads while picker is open, update the list
                const loadListener = galaxyCache.onDidLoad(() => {
                    quickPick.busy = false;
                    updateItems(quickPick.value);
                });

                // Update progress while loading
                const progressListener = galaxyCache.onDidUpdateProgress(() => {
                    if (!galaxyCache.isLoaded()) {
                        updateItems(quickPick.value);
                    }
                });

                quickPick.onDidChangeValue((value) => {
                    updateItems(value);
                });

                // Ensure cache is loading
                if (!galaxyCache.isLoaded() && !galaxyCache.isLoading()) {
                    galaxyCache.startBackgroundLoad();
                }

                quickPick.onDidAccept(() => {
                    const selected = quickPick.selectedItems[0];
                    // Skip if loading placeholder or no selection
                    if (selected.label.startsWith('$(sync~spin)')) {
                        return;
                    }

                    quickPick.hide();

                    const collectionName = selected.label;

                    // Run installation with progress indicator
                    void vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Installing ${collectionName}`,
                            cancellable: false,
                        },
                        async (progress) => {
                            progress.report({ message: 'Running ade install...' });

                            try {
                                const output =
                                    await collectionsService.installCollection(collectionName);
                                vscode.window.showInformationMessage(
                                    `Successfully installed ${collectionName}`,
                                );
                                log(`Collection install output: ${output}`);

                                // Refresh the collections view
                                void collectionsProvider.refresh();
                            } catch (error) {
                                vscode.window.showErrorMessage(
                                    `Failed to install collection: ${formatError(error)}`,
                                );
                            }
                        },
                    );
                });

                quickPick.onDidHide(() => {
                    loadListener.dispose();
                    progressListener.dispose();
                    quickPick.dispose();
                });
                quickPick.show();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install collection: ${formatError(error)}`,
                );
            }
        },
    );

    // Register plugin documentation command
    const showPluginDocCommand = vscode.commands.registerCommand(
        'ansibleDevTools.showPluginDoc',
        (pluginFullName: string, pluginType: string) => {
            PluginDocPanel.show(context.extensionUri, pluginFullName, pluginType);
        },
    );

    // Register plugin documentation command for context menu
    const collectionsShowPluginDocCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.showPluginDoc',
        (node: { fullName: string; pluginType: string }) => {
            PluginDocPanel.show(context.extensionUri, node.fullName, node.pluginType);
        },
    );

    // Register LLM configuration commands
    const selectLlmModelCommand = vscode.commands.registerCommand(
        'ansibleEnvironments.selectLlmModel',
        async () => {
            const llmService = getLlmService();
            await llmService.showModelPicker();
        },
    );

    const showLlmStatusCommand = vscode.commands.registerCommand(
        'ansibleEnvironments.showLlmStatus',
        async () => {
            const llmService = getLlmService();
            await llmService.showStatus();
        },
    );

    // Register Abbenay LLM provider command and status bar item
    const configureLlmProviderCommand = vscode.commands.registerCommand(
        'ansibleEnvironments.configureLlmProvider',
        async () => {
            const ext = vscode.extensions.getExtension('redhat.abbenay-provider');
            if (!ext) {
                vscode.window.showWarningMessage(
                    'Abbenay extension not found. Install it to configure LLM providers.',
                );
                return;
            }
            if (!ext.isActive) {
                await ext.activate();
            }
            await vscode.commands.executeCommand('abbenay.configureProvider');
        },
    );

    context.subscriptions.push(
        refreshCommand,
        installCommand,
        upgradeCommand,
        envManagersRefreshCommand,
        envManagersCreateCommand,
        selectEnvCommand,
        collectionsRefreshCommand,
        collectionsSearchCommand,
        collectionsInstallCommand,
        collectionsAiSummaryCommand,
        collectionsAiCollectionSummaryCommand,
        collectionsAiPluginSummaryCommand,
        collectionsShowPluginDocCommand,
        showPluginDocCommand,
        eeRefreshCommand,
        eeAiSummaryCommand,
        eeAiEESummaryCommand,
        galaxyCacheRefreshCommand,
        creatorRefreshCommand,
        creatorOpenFormCommand,
        creatorAiSummaryCommand,
        creatorAiEntrySummaryCommand,
        playbooksRefreshCommand,
        playbooksEditConfigCommand,
        playbooksEditDefaultsCommand,
        playbooksRunCommand,
        playbooksRunWithProgressCommand,
        playbooksOpenCommand,
        playbooksGoToPlayCommand,
        playbooksAiSummaryCommand,
        configureCursorMcpCommand,
        showMcpStatusCommand,
        mcpToolsRefreshCommand,
        mcpToolsUseInChatCommand,
        mcpToolsCopyPromptCommand,
        mcpToolsConfigureCommand,
        collectionSourcesRefreshCommand,
        collectionSourcesRefreshSourceCommand,
        collectionSourcesAddSourceCommand,
        collectionSourcesInstallCommand,
        collectionSourcesSearchCommand,
        collectionSourcesSearchSourceCommand,
        collectionSourcesInstallFromSourceCommand,
        collectionSourcesAiSummaryCommand,
        collectionSourcesAiSourceSummaryCommand,
        filterGalaxyCollectionsCommand,
        clearGalaxyFilterCommand,
        installGalaxyCollectionCommand,
        showGalaxyPluginDocCommand,
        galaxyPluginAiSummaryCommand,
        githubPluginAiSummaryCommand,
        showGitHubPluginDocCommand,
        refreshGitHubCollectionCommand,
        selectLlmModelCommand,
        showLlmStatusCommand,
        configureLlmProviderCommand,
    );
}

/** Shut down extension logging resources on deactivation. */
export function deactivate(): void {
    _logStream?.end();
    outputChannel.dispose();
}
