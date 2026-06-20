import * as vscode from 'vscode';
import { LightspeedAPI, type LightspeedApiConfig } from './api';
import { LightSpeedAuthenticationProvider, type OAuthProviderConfig } from './oauth/provider';
import { LightspeedCommands, WCA_API_ENDPOINT_DEFAULT, LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT } from './definitions';
import { getUserTypeLabel, ANSIBLE_LIGHTSPEED_AUTH_ID } from './utils/webUtils';
import type { TelemetryReporter } from './telemetry';
import { isError } from './errors';
import { LightspeedViewProvider } from './views/lightspeedView';
import { registerGenerationCommands } from './commands/generation';
import { registerExplanationCommands } from './commands/explanation';
import { registerInlineSuggestions } from './commands/inlineSuggestions';

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ansible.lightspeed');
}

function getApiEndpoint(): string {
    return getConfig().get<string>('URL', WCA_API_ENDPOINT_DEFAULT);
}

export async function activate(
    context: vscode.ExtensionContext,
    telemetry: TelemetryReporter,
): Promise<vscode.Disposable> {
    const channel = vscode.window.createOutputChannel('Ansible Lightspeed', { log: true });
    context.subscriptions.push(channel);

    const log = (level: 'info' | 'debug' | 'error', message: string) => {
        if (level === 'error') channel.error(message);
        else if (level === 'debug') channel.debug(message);
        else channel.info(message);
    };

    log('info', 'Ansible Lightspeed activating...');

    const oauthConfig: OAuthProviderConfig = { getApiEndpoint, log };
    const authProvider = new LightSpeedAuthenticationProvider(context, oauthConfig);
    authProvider.initialize();
    log('info', `API endpoint: ${getApiEndpoint()}`);

    let currentSession: vscode.AuthenticationSession | undefined;

    async function getAccessToken(): Promise<string | undefined> {
        if (process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
            return process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
        }
        if (!currentSession) {
            return undefined;
        }
        return authProvider.refreshAccessToken(currentSession);
    }

    const apiConfig: LightspeedApiConfig = {
        getAccessToken,
        isAuthenticated: async () => !!currentSession,
        orgOptOutTelemetry: async () => false,
        getApiEndpoint,
        getExtensionVersion: () =>
            (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
        log,
        showInfo: (msg) => void vscode.window.showInformationMessage(msg),
        showError: (msg) => void vscode.window.showErrorMessage(msg),
    };

    const api = new LightspeedAPI(apiConfig);

    const viewProvider = new LightspeedViewProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('ansibleLightspeed', viewProvider),
    );

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = LightspeedCommands.LIGHTSPEED_STATUS_BAR_CLICK;
    statusBar.text = LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT;
    context.subscriptions.push(statusBar);

    async function updateStatusBar() {
        if (
            vscode.window.activeTextEditor?.document.languageId !== 'ansible' ||
            !getConfig().get<boolean>('enabled', false)
        ) {
            statusBar.hide();
            return;
        }
        if (currentSession) {
            statusBar.text = `Lightspeed (${getUserTypeLabel(true).toLowerCase()})`;
        } else {
            statusBar.text = LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT;
        }
        statusBar.show();
    }

    context.subscriptions.push(
        vscode.commands.registerCommand(LightspeedCommands.LIGHTSPEED_AUTH_REQUEST, async () => {
            try {
                log('info', 'Sign-in requested...');
                currentSession = await vscode.authentication.getSession(
                    ANSIBLE_LIGHTSPEED_AUTH_ID,
                    [],
                    { createIfNone: true },
                );
                log('info', `Sign-in ${currentSession ? 'successful' : 'failed'}: ${currentSession?.account.label ?? 'no session'}`);
                viewProvider.refresh(!!currentSession);
                await updateStatusBar();
            } catch (e) {
                vscode.window.showErrorMessage(
                    `Lightspeed sign-in failed: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }),
    );

    registerGenerationCommands(context, api, telemetry, log);
    registerExplanationCommands(context, api, telemetry, log);
    registerInlineSuggestions(context, api, telemetry, log);

    context.subscriptions.push(
        vscode.commands.registerCommand(LightspeedCommands.LIGHTSPEED_STATUS_BAR_CLICK, async () => {
            if (!currentSession) {
                vscode.commands.executeCommand(LightspeedCommands.LIGHTSPEED_AUTH_REQUEST);
            }
        }),
    );

    context.subscriptions.push(
        vscode.authentication.onDidChangeSessions(async (e) => {
            if (e.provider.id === ANSIBLE_LIGHTSPEED_AUTH_ID) {
                await refreshSession();
            }
        }),
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            void updateStatusBar();
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ansible.lightspeed')) {
                void updateStatusBar();
            }
        }),
    );

    async function refreshSession() {
        try {
            currentSession = await vscode.authentication.getSession(
                ANSIBLE_LIGHTSPEED_AUTH_ID,
                [],
                { createIfNone: false },
            );
            log('debug', `Session refresh: ${currentSession ? 'authenticated as ' + currentSession.account.label : 'not authenticated'}`);
        } catch {
            currentSession = undefined;
            log('debug', 'Session refresh: no session found');
        }
        viewProvider.refresh(!!currentSession);
        await updateStatusBar();
    }

    if (context.extensionMode !== vscode.ExtensionMode.Production) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'ansible.lightspeed.mockSession',
                async (session: { accessToken: string; accountId: string; accountLabel: string }) => {
                    log('info', `[mock] Injecting mock session: ${session.accountLabel}`);
                    currentSession = {
                        id: session.accountId,
                        accessToken: session.accessToken,
                        account: { label: session.accountLabel, id: session.accountId },
                        scopes: [],
                    };
                    viewProvider.refresh(true);
                    await updateStatusBar();
                },
            ),
        );
    }

    await refreshSession();
    log('info', 'Ansible Lightspeed activated successfully');

    return new vscode.Disposable(() => {
        void authProvider.dispose();
        statusBar.dispose();
    });
}
