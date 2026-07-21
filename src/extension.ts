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
import { AnsibleDevToolsController } from '@src/views/AnsibleDevToolsController';
import { EnvironmentManagersController } from '@src/views/EnvironmentManagersController';
import { CollectionsController } from '@src/views/CollectionsController';
import { ExecutionEnvironmentsController } from '@src/views/ExecutionEnvironmentsController';
import { CreatorController } from '@src/views/CreatorController';
import { CreatorFormPanel } from '@src/panels/CreatorFormPanel';
import { PlaybooksController } from '@src/views/PlaybooksController';
import { PlaybookConfigPanel } from '@src/panels/PlaybookConfigPanel';
import { PlaybookProgressPanel } from '@src/panels/PlaybookProgressPanel';
import { EEDetailPanel } from '@src/panels/EEDetailPanel';
import { PackageDetailPanel } from '@src/panels/PackageDetailPanel';
import { PlaybooksService, PlaybookInfo, PlaybookPlay } from '@src/services/PlaybooksService';
import { TerminalService } from '@src/services/TerminalService';
import { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import {
    McpToolsController,
    injectToolPromptIntoChat,
    type ToolInfo,
} from '@src/views/McpToolsController';
import { openChatWithPrompt } from '@src/features/chatProvider';
import {
    CollectionSourcesController,
    setCollectionSourcesLogFunction,
    type CollectionSourceInfo,
} from '@src/views/CollectionSourcesController';
import {
    GalaxyCollectionCache,
    GalaxyDocsCache,
    SCMDocsCache,
    CollectionsService,
    setLogFunction as setCollectionsLogFunction,
    DevToolsService,
    ExecutionEnvService,
    cacheSelectedEnvironment,
    getCachedEnvironment,
    getCommandService,
    SkillRegistry,
    isExecutionEnvironmentDefinition,
    planAnsibleBuilderBuild,
    formatAnsibleBuilderShellCommand,
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildGalaxyPluginExplanationPrompt,
    buildScmPluginExplanationPrompt,
    buildEESummaryPrompt,
    buildEEDetailPrompt,
    buildCreatorOverviewPrompt,
    buildCreatorCommandWalkthroughPrompt,
} from '@ansible/developer-services';
import type {
    PythonEnvironment,
    SchemaNode,
    SkillSource,
    SkillEntry,
} from '@ansible/developer-services';
import { SkillsController, openChatWithSkill, copySkillPrompt } from '@src/views/SkillsController';
import {
    registerMcpServerProvider,
    isMcpAvailable,
    registerCursorMcpServer,
    registerBobMcpServer,
    configureCursorMcp,
    showCursorMcpStatus,
    getMcpStatus,
    detectIde,
} from '@src/mcp';
import { getLlmService } from '@src/services/LlmService';
import { registerFileAssociation } from '@src/features/fileAssociation';
import { registerExtensionConflictDetection } from '@src/features/extensionConflicts';
import { registerVaultCommand } from '@src/features/vault';
import { registerLightspeed } from '@src/features/lightspeed/register';
import { registerWalkthroughTelemetry } from '@src/telemetry';
import { registerGettingStarted } from '@src/features/gettingStarted';
import { AnsibleStatusBar } from '@src/statusBar/ansibleStatusBar';
import { DiagnosticsPanel } from '@src/panels/DiagnosticsPanel';
import { TelemetryService } from '@src/services/TelemetryService';
import { emitJourneyOutcome } from '@src/services/journeyTelemetry';
import { TelemetryEvents } from '@ansible/common';
import { AnsibleNavTreeProvider } from '@src/sidebar/AnsibleNavTreeProvider';

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
 * Activate the Ansible extension and register providers and commands.
 * @param context - VS Code extension activation context
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize file-based logging (before anything else so all messages are captured)
    const logFile = _ensureLogFile(context);
    log(`Log file: ${logFile}`);

    outputChannel.show(true);

    // Initialize telemetry (respects redhat.telemetry.enabled + VS Code global consent)
    const telemetry = await TelemetryService.create(context);
    context.subscriptions.push(telemetry);
    telemetry.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);

    registerFileAssociation(context);
    registerExtensionConflictDetection(context);
    registerVaultCommand(context);
    registerWalkthroughTelemetry(context, telemetry);
    registerGettingStarted(context, telemetry);
    registerLightspeed(context, telemetry)
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
    if (ide === 'bob') {
        if (registerBobMcpServer(context)) {
            log('MCP server registered in Bob global config (~/.bob/settings/mcp.json)');
        } else {
            log('Bob MCP auto-registration failed — server binary missing');
        }
    } else if (ide === 'cursor') {
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

    // Settings shortcuts do not require a workspace folder
    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.extension-settings.open', async () => {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:redhat.ansible',
            );
        }),
        vscode.commands.registerCommand('ansible.python-settings.open', async () => {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:ms-python.python',
            );
        }),
    );

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
                    let env = await pythonEnvService.getEnvironment(workspaceFolder);
                    // After NavTree/native select, getEnvironment can lag — resolve from
                    // the env we just cached (cacheSelectedEnvironment on select).
                    if (!env) {
                        const cached = getCachedEnvironment();
                        if (cached?.pythonPath) {
                            const all = await pythonEnvService.getEnvironments('all');
                            env = all.find((e) => e.execInfo.run.executable === cached.pythonPath);
                            if (env) {
                                log(
                                    `packageInstaller: resolved env from cache (${env.displayName})`,
                                );
                            }
                        }
                    }
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

    // Controllers for NavTree hydrate + command handlers (no TreeViews — ADR-025 NavTree-only)
    const envManagersController = new EnvironmentManagersController(pythonEnvService);

    const navTreeProvider = new AnsibleNavTreeProvider(
        context,
        envManagersController,
        pythonEnvService,
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            AnsibleNavTreeProvider.viewType,
            navTreeProvider,
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
        vscode.commands.registerCommand('ansible.sidebar.navTree.open', async () => {
            await vscode.commands.executeCommand('ansibleNavTree.focus');
        }),
    );

    const devToolsController = new AnsibleDevToolsController(pythonEnvService);
    const collectionsController = new CollectionsController(pythonEnvService);
    const eeController = new ExecutionEnvironmentsController();
    const creatorController = new CreatorController();
    const playbooksController = new PlaybooksController();

    const workspaceFoldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        log('Workspace folders changed, refreshing playbooks...');
        playbooksController.refresh();
    });
    context.subscriptions.push(workspaceFoldersListener);

    const mcpToolsController = new McpToolsController(context);
    navTreeProvider.setMcpToolsController(mcpToolsController);

    const collectionSourcesController = new CollectionSourcesController();
    navTreeProvider.setCollectionSourcesController(collectionSourcesController);

    const skillSources =
        vscode.workspace
            .getConfiguration('ansibleEnvironments')
            .get<SkillSource[]>('skillSources') ?? [];
    const skillRegistry = SkillRegistry.getInstance();
    skillRegistry.setSources(skillSources);

    const skillsController = new SkillsController();

    context.subscriptions.push(
        vscode.commands.registerCommand('ansibleSkills.refresh', () => {
            skillsController.refresh();
        }),
        vscode.commands.registerCommand(
            'ansibleSkills.useInChat',
            async (arg: SkillEntry | { skill: SkillEntry }) => {
                const startedAt = Date.now();
                const skill = 'skill' in arg ? arg.skill : arg;
                try {
                    await openChatWithSkill(skill);
                    emitJourneyOutcome(TelemetryEvents.SKILL_USE_IN_CHAT, 'success', {
                        startedAt,
                    });
                } catch (error) {
                    emitJourneyOutcome(TelemetryEvents.SKILL_USE_IN_CHAT, 'error', {
                        startedAt,
                        errorCode: 'chat_inject_failed',
                    });
                    vscode.window.showErrorMessage(
                        `Failed to use skill in chat: ${formatError(error)}`,
                    );
                    throw error;
                }
            },
        ),
        vscode.commands.registerCommand(
            'ansibleSkills.copyPrompt',
            async (arg: SkillEntry | { skill: SkillEntry }) => {
                const startedAt = Date.now();
                const skill = 'skill' in arg ? arg.skill : arg;
                try {
                    await copySkillPrompt(skill);
                    emitJourneyOutcome(TelemetryEvents.SKILL_PROMPT_COPY, 'success', {
                        startedAt,
                    });
                } catch (error) {
                    emitJourneyOutcome(TelemetryEvents.SKILL_PROMPT_COPY, 'error', {
                        startedAt,
                        errorCode: 'copy_failed',
                    });
                    vscode.window.showErrorMessage(
                        `Failed to copy skill prompt: ${formatError(error)}`,
                    );
                    throw error;
                }
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
                skillsController.refresh();
            }
        }),
    );

    // Register sidebar commands
    const refreshCommand = vscode.commands.registerCommand(
        'ansibleDevToolsPackages.refresh',
        () => {
            void devToolsController.refresh();
        },
    );

    const installCommand = vscode.commands.registerCommand(
        'ansibleDevToolsPackages.install',
        async () => {
            try {
                const devToolsService = DevToolsService.getInstance();
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Installing ansible-dev-tools…',
                        cancellable: false,
                    },
                    async () => {
                        await devToolsService.install();
                    },
                );
                if (devToolsService.hasPackages()) {
                    vscode.window.showInformationMessage(
                        'ansible-dev-tools installed in the selected environment.',
                    );
                } else {
                    vscode.window.showWarningMessage(
                        'ansible-dev-tools install finished, but packages were not detected yet. Try Refresh on Ansible Dev Tools.',
                    );
                }
                void devToolsController.refresh();
                // Re-index collections now that ansible-doc / ade exist in the env
                // (ansible.builtin and site-packages collections).
                void collectionsController.forceRefresh();
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
                void collectionsController.forceRefresh();
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
            void envManagersController.refresh();
        },
    );

    const envManagersCreateCommand = vscode.commands.registerCommand(
        'ansibleDevToolsEnvManagers.create',
        async () => {
            const startedAt = Date.now();
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open.');
                    emitJourneyOutcome(TelemetryEvents.ENV_CREATE, 'error', {
                        startedAt,
                        errorCode: 'no_workspace',
                    });
                    return;
                }

                // Ansible-owned create: seed ansible-dev-tools so the new
                // venv is immediately usable (lint, creator, navigator, etc.).
                const environment = await pythonEnvService.createEnvironment(workspaceFolder, {
                    quickCreate: false,
                    additionalPackages: ['ansible-dev-tools'],
                });

                if (environment) {
                    const execPath = environment.execInfo.run.executable;
                    if (execPath) {
                        cacheSelectedEnvironment(execPath, environment.displayName);
                    }
                    vscode.window.showInformationMessage(
                        `Created environment: ${environment.displayName}`,
                    );
                    void envManagersController.refresh();
                    void devToolsController.refresh();
                    void collectionsController.forceRefresh();
                    emitJourneyOutcome(TelemetryEvents.ENV_CREATE, 'success', { startedAt });
                } else {
                    emitJourneyOutcome(TelemetryEvents.ENV_CREATE, 'cancel', { startedAt });
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to create environment: ${formatError(error)}`,
                );
                emitJourneyOutcome(TelemetryEvents.ENV_CREATE, 'error', {
                    startedAt,
                    errorCode: 'create_failed',
                });
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

                // Cache immediately so CommandService/DevTools resolve the new
                // venv bin even if getEnvironment lags behind the API switch.
                const execPath = environment.execInfo.run.executable;
                if (execPath) {
                    cacheSelectedEnvironment(execPath, environment.displayName);
                }

                vscode.window.showInformationMessage(
                    `Selected environment: ${environment.displayName}`,
                );

                void envManagersController.refresh();
                void devToolsController.refresh();
                // Force re-index — soft refresh may reuse an empty cache from
                // before ansible-doc was available in this env.
                void collectionsController.forceRefresh();
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
            void collectionsController.forceRefresh();
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
            eeController.refresh();
        },
    );

    // Build an EE image from an execution-environment.yml definition
    const eeBuildFromDefinitionCommand = vscode.commands.registerCommand(
        'ansibleExecutionEnvironments.buildFromDefinition',
        async (uri?: vscode.Uri) => {
            try {
                let definitionUri = uri;

                if (!definitionUri?.fsPath) {
                    const active = vscode.window.activeTextEditor?.document.uri;
                    if (active && isExecutionEnvironmentDefinition(active.fsPath)) {
                        definitionUri = active;
                    } else {
                        const picked = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            filters: {
                                YAML: ['yml', 'yaml'],
                            },
                            openLabel: 'Build Execution Environment',
                            title: 'Select execution-environment.yml',
                        });
                        definitionUri = picked?.[0];
                    }
                }

                if (!definitionUri?.fsPath) {
                    return;
                }

                if (!isExecutionEnvironmentDefinition(definitionUri.fsPath)) {
                    void vscode.window.showErrorMessage(
                        'Selected file is not an execution-environment.yml definition.',
                    );
                    return;
                }

                const commandService = getCommandService();
                const builderAvailable = await commandService.isToolAvailable('ansible-builder');
                if (!builderAvailable) {
                    const action = await vscode.window.showErrorMessage(
                        'ansible-builder was not found in the active Python environment or PATH.',
                        'Install ansible-dev-tools',
                    );
                    if (action === 'Install ansible-dev-tools') {
                        await vscode.commands.executeCommand('ansibleDevToolsPackages.install');
                    }
                    return;
                }

                const plan = planAnsibleBuilderBuild({ filePath: definitionUri.fsPath });
                const shellCommand = formatAnsibleBuilderShellCommand(plan);
                const cwd = vscode.Uri.file(plan.cwd);

                log(`Building EE: ${shellCommand} in ${plan.cwd}`);
                void vscode.window.showInformationMessage(`Running: ${shellCommand}`);

                const terminalService = TerminalService.getInstance();
                const managed = await terminalService.createActivatedTerminal({
                    name: 'ansible-builder',
                    cwd,
                    show: true,
                });

                // EE builds can take a long time; wait up to 30 minutes for exit code
                const result = await managed.sendCommand(shellCommand, {
                    waitForCompletion: true,
                    timeout: 30 * 60 * 1000,
                });

                if (result.exitCode === 0) {
                    ExecutionEnvService.getInstance().forceRefresh();
                    void vscode.window.showInformationMessage(
                        'Execution environment build completed. Refreshing EE tree…',
                    );
                    return;
                }

                if (result.exitCode === undefined) {
                    // Shell integration unavailable — build may still be running
                    ExecutionEnvService.getInstance().forceRefresh();
                    void vscode.window.showInformationMessage(
                        'ansible-builder completion could not be tracked (shell integration unavailable). Check the terminal; refreshing EE tree in case the image is ready…',
                    );
                    return;
                }

                void vscode.window.showErrorMessage(
                    `Execution environment build failed (exit code ${String(result.exitCode)}).`,
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to build execution environment: ${formatError(error)}`,
                );
            }
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

    const collectionsAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleDevToolsCollections.aiSummary',
        async () => {
            telemetry.sendEvent(TelemetryEvents.AI_SUMMARY_REQUEST, { domain: 'collections' });
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
        creatorController.refresh();
    });

    const creatorOpenFormCommand = vscode.commands.registerCommand(
        'ansibleCreator.openForm',
        (arg1: string[] | { commandPath: string[]; schema: unknown }, arg2?: unknown) => {
            const commandPath = Array.isArray(arg1) ? arg1 : arg1.commandPath;
            telemetry.sendEvent(TelemetryEvents.CREATOR_FORM_OPEN, {
                command: commandPath.join('/'),
            });
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
            playbooksController.refresh();
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

    // Run playbook in terminal (respects configured executor)
    const playbooksRunCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.run',
        async (node: { playbook: PlaybookInfo }) => {
            const startedAt = Date.now();
            try {
                const playbooksService = PlaybooksService.getInstance();
                const config = playbooksService.getPlaybookConfig(node.playbook.relativePath);

                const workspaceFolderPath = node.playbook.workspaceFolder.fsPath;
                const playbookRelativePath = path.relative(workspaceFolderPath, node.playbook.path);

                const useNavigator = config.executor === 'ansible-navigator';
                const command = useNavigator
                    ? playbooksService.buildNavigatorCommand(playbookRelativePath, config)
                    : playbooksService.buildCommand(playbookRelativePath, config);
                const executorLabel = useNavigator ? 'ansible-navigator' : 'ansible-playbook';

                log(`Running playbook: ${command} in ${workspaceFolderPath}`);

                const terminalService = TerminalService.getInstance();
                const managed = await terminalService.createActivatedTerminal({
                    name: `${executorLabel}: ${node.playbook.name}`,
                    cwd: node.playbook.workspaceFolder,
                    show: true,
                });

                log('Terminal ready, sending command...');

                await managed.sendCommand(command, { waitForCompletion: false });
                emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN, 'success', { startedAt });
            } catch (error) {
                emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN, 'error', {
                    startedAt,
                    errorCode: 'launch_failed',
                });
                vscode.window.showErrorMessage(`Failed to run playbook: ${formatError(error)}`);
                throw error;
            }
        },
    );

    // Run playbook with progress viewer (respects configured executor)
    const playbooksRunWithProgressCommand = vscode.commands.registerCommand(
        'ansiblePlaybooks.runWithProgress',
        async (node: { playbook: PlaybookInfo }) => {
            const startedAt = Date.now();
            try {
                const playbooksService = PlaybooksService.getInstance();
                const config = playbooksService.getPlaybookConfig(node.playbook.relativePath);

                const workspaceFolderPath = node.playbook.workspaceFolder.fsPath;
                const playbookRelativePath = path.relative(workspaceFolderPath, node.playbook.path);

                const useNavigator = config.executor === 'ansible-navigator';
                const command = useNavigator
                    ? playbooksService.buildNavigatorCommand(playbookRelativePath, config)
                    : playbooksService.buildCommand(playbookRelativePath, config);

                log(`Running playbook with progress: ${command} in ${workspaceFolderPath}`);

                await PlaybookProgressPanel.show(context.extensionUri, {
                    playbookPath: node.playbook.path,
                    playbookName: node.playbook.name,
                    workspaceFolder: node.playbook.workspaceFolder,
                    command: command,
                    extensionPath: context.extensionPath,
                    executor: config.executor,
                    telemetryStartedAt: startedAt,
                });
            } catch (error) {
                emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN_WITH_PROGRESS, 'error', {
                    startedAt,
                    errorCode: 'launch_failed',
                });
                vscode.window.showErrorMessage(
                    `Failed to run playbook with progress: ${formatError(error)}`,
                );
                throw error;
            }
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
            mcpToolsController.refresh();
        },
    );

    const mcpToolsUseInChatCommand = vscode.commands.registerCommand(
        'ansibleMcpTools.useInChat',
        async (toolInfo: ToolInfo) => {
            const startedAt = Date.now();
            try {
                await injectToolPromptIntoChat(toolInfo);
                emitJourneyOutcome(TelemetryEvents.MCP_TOOL_USE_IN_CHAT, 'success', {
                    startedAt,
                    extra: { toolName: toolInfo.tool.name },
                });
            } catch (error) {
                emitJourneyOutcome(TelemetryEvents.MCP_TOOL_USE_IN_CHAT, 'error', {
                    startedAt,
                    errorCode: 'chat_inject_failed',
                    extra: { toolName: toolInfo.tool.name },
                });
                vscode.window.showErrorMessage(
                    `Failed to use MCP tool in chat: ${formatError(error)}`,
                );
                throw error;
            }
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
            const currentIde = detectIde();
            if (currentIde === 'bob') {
                if (registerBobMcpServer(context)) {
                    vscode.window.showInformationMessage(
                        'Ansible MCP server configured for IBM Bob.',
                    );
                } else {
                    vscode.window.showErrorMessage(
                        'Failed to configure MCP server — server binary not found.',
                    );
                }
            } else {
                await configureCursorMcp(context);
            }
            updateMcpStatusContext();
            mcpToolsController.refresh();
        },
    );

    // Register Collection Sources commands
    const collectionSourcesRefreshCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refresh',
        async () => {
            await collectionSourcesController.refreshAll();
        },
    );

    const collectionSourcesRefreshSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refreshSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesController.refreshSource(node.source);
        },
    );

    const collectionSourcesAddSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.addSource',
        async () => {
            await collectionSourcesController.addSource();
        },
    );

    const collectionSourcesInstallCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.install',
        async () => {
            await collectionSourcesController.installCollection();
        },
    );

    const collectionSourcesSearchCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.search',
        async () => {
            await collectionSourcesController.searchAllSources();
        },
    );

    const collectionSourcesSearchSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.searchSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesController.searchSource(node.source);
        },
    );

    const collectionSourcesInstallFromSourceCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.installFromSource',
        async (node: { source: CollectionSourceInfo }) => {
            await collectionSourcesController.installFromSource(node.source);
        },
    );

    const collectionSourcesAiSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.aiSummary',
        () => {
            void collectionSourcesController.generateAiSummary();
        },
    );

    const collectionSourcesAiSourceSummaryCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.aiSourceSummary',
        (node: { source: CollectionSourceInfo }) => {
            void collectionSourcesController.generateSourceAiSummary(node.source);
        },
    );

    const filterGalaxyCollectionsCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.filterGalaxyCollections',
        async () => {
            await collectionSourcesController.filterGalaxyCollections();
        },
    );

    const clearGalaxyFilterCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.clearGalaxyFilter',
        () => {
            collectionSourcesController.clearGalaxyFilter();
        },
    );

    const installGalaxyCollectionCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.installGalaxyCollection',
        async (node?: { collection: { namespace: string; name: string } }) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a Galaxy collection from the tree view.');
                return;
            }
            await collectionSourcesController.installGalaxyCollection(node);
        },
    );

    const showGalaxyPluginDocCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.showGalaxyPluginDoc',
        async (node?: Parameters<typeof collectionSourcesController.showGalaxyPluginDoc>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a Galaxy plugin from the tree view.');
                return;
            }
            await collectionSourcesController.showGalaxyPluginDoc(node, context.extensionUri);
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
        async (node?: Parameters<typeof collectionSourcesController.showGitHubPluginDoc>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a GitHub plugin from the tree view.');
                return;
            }
            await collectionSourcesController.showGitHubPluginDoc(node, context.extensionUri);
        },
    );

    const refreshGitHubCollectionCommand = vscode.commands.registerCommand(
        'ansibleCollectionSources.refreshGitHubCollection',
        (node?: Parameters<typeof collectionSourcesController.refreshGitHubCollection>[0]) => {
            if (!node) {
                vscode.window.showWarningMessage('Select a GitHub collection from the tree view.');
                return;
            }
            collectionSourcesController.refreshGitHubCollection(node);
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
            const startedAt = Date.now();
            let accepted = false;
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
                    // Skip if loading placeholder
                    if (selected.label.startsWith('$(sync~spin)')) {
                        return;
                    }

                    accepted = true;
                    quickPick.hide();

                    // Run installation with progress indicator (no FQCN in telemetry)
                    void vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Installing ${selected.label}`,
                            cancellable: false,
                        },
                        async (progress) => {
                            progress.report({ message: 'Running ade install...' });

                            try {
                                const output = await collectionsService.installCollection(
                                    selected.label,
                                );
                                vscode.window.showInformationMessage(
                                    `Successfully installed ${selected.label}`,
                                );
                                log(`Collection install output: ${output}`);

                                // Refresh the collections view
                                void collectionsController.refresh();
                                emitJourneyOutcome(TelemetryEvents.COLLECTION_INSTALL, 'success', {
                                    startedAt,
                                });
                            } catch (error) {
                                vscode.window.showErrorMessage(
                                    `Failed to install collection: ${formatError(error)}`,
                                );
                                emitJourneyOutcome(TelemetryEvents.COLLECTION_INSTALL, 'error', {
                                    startedAt,
                                    errorCode: 'install_failed',
                                });
                            }
                        },
                    );
                });

                quickPick.onDidHide(() => {
                    if (!accepted) {
                        emitJourneyOutcome(TelemetryEvents.COLLECTION_INSTALL, 'cancel', {
                            startedAt,
                        });
                    }
                    loadListener.dispose();
                    progressListener.dispose();
                    quickPick.dispose();
                });
                quickPick.show();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install collection: ${formatError(error)}`,
                );
                emitJourneyOutcome(TelemetryEvents.COLLECTION_INSTALL, 'error', {
                    startedAt,
                    errorCode: 'picker_failed',
                });
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
            telemetry.sendEvent(TelemetryEvents.LLM_MODEL_SELECT);
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
        eeBuildFromDefinitionCommand,
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
