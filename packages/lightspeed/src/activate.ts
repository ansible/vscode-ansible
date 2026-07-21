import * as vscode from 'vscode';
import { LightspeedAPI, type LightspeedApiConfig } from './api';
import { LightSpeedAuthenticationProvider, type OAuthProviderConfig } from './oauth/provider';
import {
    LightspeedCommands,
    WCA_API_ENDPOINT_DEFAULT,
    LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT,
} from './definitions';
import { getUserTypeLabel, ANSIBLE_LIGHTSPEED_AUTH_ID } from './utils/webUtils';
import type { TelemetryReporter } from './telemetry';
import { registerGenerationCommands } from './commands/generation';
import { registerExplanationCommands } from './commands/explanation';
import { registerInlineSuggestions } from './commands/inlineSuggestions';

/**
 * Retrieves the Ansible Lightspeed workspace configuration.
 * @returns The workspace configuration for ansible.lightspeed
 */
function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ansible.lightspeed');
}

/**
 * Retrieves the configured Lightspeed API endpoint URL.
 * @returns The API endpoint URL string, falling back to the default
 */
function getApiEndpoint(): string {
    return getConfig().get<string>('URL', WCA_API_ENDPOINT_DEFAULT);
}

/**
 * Activates the Ansible Lightspeed extension and registers all commands and providers.
 * @param context The VS Code extension context
 * @param telemetry The telemetry service for tracking events
 * @returns A disposable that cleans up Lightspeed resources
 */
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

    /**
     * Retrieves the current access token for Lightspeed API authentication.
     * Clears the session and updates the sidebar if the token refresh fails.
     * @returns The access token string, or undefined if not authenticated.
     */
    async function getAccessToken(): Promise<string | undefined> {
        if (process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
            return process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
        }
        if (!currentSession) {
            return undefined;
        }
        try {
            return await authProvider.refreshAccessToken(currentSession);
        } catch (e: unknown) {
            log('error', `Session expired: ${e instanceof Error ? e.message : String(e)}`);
            const expiredSessionId = currentSession.id;
            currentSession = undefined;
            updateStatusBar();
            await authProvider.removeSession(expiredSessionId);
            log('info', 'Expired session removed from storage');
            return undefined;
        }
    }

    const apiConfig: LightspeedApiConfig = {
        getAccessToken,
        isAuthenticated: () => Promise.resolve(!!currentSession),
        orgOptOutTelemetry: () => Promise.resolve(false),
        getApiEndpoint,
        getExtensionVersion: () =>
            (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
        log,
        showInfo: (msg) => void vscode.window.showInformationMessage(msg),
        showError: (msg) => void vscode.window.showErrorMessage(msg),
    };

    const api = new LightspeedAPI(apiConfig);

    // Lightspeed Activity Bar tree removed — features live in the Ansible sidebar (ADR-025).

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = LightspeedCommands.LIGHTSPEED_STATUS_BAR_CLICK;
    statusBar.text = LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT;
    context.subscriptions.push(statusBar);

    /**
     * Updates the status bar item based on the current session and editor state.
     */
    function updateStatusBar() {
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
                log('info', `Sign-in successful: ${currentSession.account.label}`);
                updateStatusBar();
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
        vscode.commands.registerCommand(LightspeedCommands.LIGHTSPEED_STATUS_BAR_CLICK, () => {
            if (!currentSession) {
                void vscode.commands.executeCommand(LightspeedCommands.LIGHTSPEED_AUTH_REQUEST);
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
            updateStatusBar();
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ansible.lightspeed')) {
                updateStatusBar();
            }
        }),
    );

    /**
     *
     */
    async function refreshSession() {
        try {
            currentSession = await vscode.authentication.getSession(
                ANSIBLE_LIGHTSPEED_AUTH_ID,
                [],
                { createIfNone: false },
            );
            log(
                'debug',
                `Session refresh: ${currentSession ? 'authenticated as ' + currentSession.account.label : 'not authenticated'}`,
            );
        } catch {
            currentSession = undefined;
            log('debug', 'Session refresh: no session found');
        }
        updateStatusBar();
    }

    if (context.extensionMode !== vscode.ExtensionMode.Production) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'ansible.lightspeed.mockSession',
                (session: { accessToken: string; accountId: string; accountLabel: string }) => {
                    log('info', `[mock] Injecting mock session: ${session.accountLabel}`);
                    currentSession = {
                        id: session.accountId,
                        accessToken: session.accessToken,
                        account: { label: session.accountLabel, id: session.accountId },
                        scopes: [],
                    };
                    updateStatusBar();
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
