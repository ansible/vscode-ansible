import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError, type IError } from '../errors';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

/**
 * Validates that a path segment is safe — no traversal or absolute paths.
 * @param segment - The path segment to validate.
 * @returns True if the segment is safe to use in file paths.
 */
function isSafePathSegment(segment: string): boolean {
    return (
        segment.length > 0 &&
        !segment.includes('..') &&
        !segment.includes('/') &&
        !segment.includes('\\') &&
        !segment.startsWith('.')
    );
}

/**
 *
 */
export class RoleGenPanel {
    public static currentPanel: RoleGenPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * Create a new RoleGenPanel instance.
     * @param panel - The webview panel to wrap.
     * @param api - Lightspeed API client for generation requests.
     * @param telemetry - Telemetry reporter for event tracking.
     * @param log - Logging function for diagnostic output.
     * @param extensionUri - Root URI of the extension for resolving webview resources.
     */
    private constructor(
        panel: vscode.WebviewPanel,
        private readonly api: LightspeedAPI,
        private readonly telemetry: TelemetryReporter,
        private readonly log: LogFn,
        extensionUri: vscode.Uri,
    ) {
        this._panel = panel;
        this._panel.webview.html = getWebviewHtml(
            extensionUri,
            this._panel.webview,
            'role-generation',
        );

        this._panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this._disposables,
        );
        this._panel.webview.onDidReceiveMessage(
            (msg: unknown) => this._handleMessage(msg as { type?: string; data?: unknown }),
            null,
            this._disposables,
        );
    }

    /**
     * Show an existing panel or create a new one.
     * @param extensionUri - Root URI of the extension for resolving webview resources.
     * @param api - Lightspeed API client for generation requests.
     * @param telemetry - Telemetry reporter for event tracking.
     * @param log - Logging function for diagnostic output.
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        api: LightspeedAPI,
        telemetry: TelemetryReporter,
        log: LogFn,
    ) {
        if (RoleGenPanel.currentPanel) {
            RoleGenPanel.currentPanel._panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lightspeedRoleGen',
            'Generate Ansible Role',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                enableCommandUris: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'packages', 'lightspeed', 'dist'),
                ],
            },
        );

        RoleGenPanel.currentPanel = new RoleGenPanel(panel, api, telemetry, log, extensionUri);
    }

    /**
     * Handle incoming webview messages and dispatch by type.
     * @param message - The message object received from the webview.
     * @param message.type - The message type identifier.
     * @param message.data - The message payload.
     */
    private async _handleMessage(message: { type?: string; data?: unknown }) {
        const type = message.type;
        const data = message.data as Record<string, unknown> | undefined;
        this.log('debug', `[roleGen] Received message: type=${type ?? 'undefined'}`);

        switch (type) {
            case 'generateRole': {
                const text = data?.text as string;
                const outline = data?.outline as string | undefined;
                const name = data?.name as string | undefined;
                if (!text) {
                    this.log('error', '[roleGen] generateRole: no text in data');
                    break;
                }
                const generationId = crypto.randomUUID();
                const createOutline = !outline;
                this.log(
                    'info',
                    `[roleGen] Generating role: textLength=${String(text.length)}, name=${name ?? 'none'}, createOutline=${String(createOutline)}, generationId=${generationId}`,
                );
                this.telemetry.sendEvent(LightspeedEvents.GENERATION_OPEN);

                const result = await this.api.roleGenerationRequest({
                    text,
                    generationId,
                    createOutline,
                    name,
                    ...(outline ? { outline } : {}),
                });

                if (isError(result)) {
                    this.log(
                        'error',
                        `[roleGen] API error: code=${result.code}, message=${result.message ?? 'none'}`,
                    );
                    const userMessage = this._getUserErrorMessage(result);
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: userMessage,
                    });
                } else {
                    this.log(
                        'info',
                        `[roleGen] API success: name=${result.name}, files=${String(result.files.length)}`,
                    );
                    void this._panel.webview.postMessage({
                        type: 'generateRole',
                        data: { ...result, generationId },
                    });
                }
                break;
            }
            case 'openEditor': {
                const content = data?.content as string;
                if (!content) break;
                this.log('info', `[roleGen] Opening editor with ${String(content.length)} chars`);
                const doc = await vscode.workspace.openTextDocument({ content, language: 'yaml' });
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
            case 'writeRoleInWorkspace': {
                const rawFiles = data?.files as [string, string, string][] | undefined;
                const roleName = data?.roleName as string | undefined;
                const collectionName = data?.collectionName as string | undefined;
                if (!rawFiles || !roleName || !collectionName) {
                    this.log(
                        'error',
                        '[roleGen] writeRoleInWorkspace: missing files, roleName, or collectionName',
                    );
                    break;
                }

                if (!isSafePathSegment(roleName)) {
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: `Invalid role name: "${roleName}". Names must not contain path separators or ".."`,
                    });
                    void this._panel.webview.postMessage({
                        type: 'writeRoleInWorkspace',
                        data: [],
                    });
                    break;
                }

                const collParts = collectionName.split('.');
                if (collParts.length !== 2 || !collParts.every(isSafePathSegment)) {
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: `Invalid collection name: "${collectionName}". Use the format "namespace.name".`,
                    });
                    void this._panel.webview.postMessage({
                        type: 'writeRoleInWorkspace',
                        data: [],
                    });
                    break;
                }

                const roleBaseDirUri = await this._getRoleBaseDir(collectionName, roleName);
                if (!roleBaseDirUri) {
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: 'No workspace folder is open. Please open a folder to save the role.',
                    });
                    void this._panel.webview.postMessage({
                        type: 'writeRoleInWorkspace',
                        data: [],
                    });
                    break;
                }

                this.log(
                    'info',
                    `[roleGen] Writing role "${roleName}" in collection "${collectionName}" to ${roleBaseDirUri.fsPath}`,
                );
                const savedEntries: { longPath: string; absolutePath: string; command: string }[] =
                    [];

                for (const [, content, fileType] of rawFiles) {
                    if (!isSafePathSegment(fileType)) {
                        this.log('error', `[roleGen] Invalid fileType: ${fileType}`);
                        continue;
                    }
                    const dirUri = vscode.Uri.joinPath(roleBaseDirUri, `${fileType}s`);
                    const fileUri = vscode.Uri.joinPath(roleBaseDirUri, `${fileType}s`, 'main.yml');

                    await vscode.workspace.fs.createDirectory(dirUri);
                    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));

                    const linkUri = { scheme: 'file', path: fileUri.fsPath, authority: '' };
                    const relativePath = `${collectionName.replace('.', '/')}/roles/${roleName}/${fileType}s/main.yml`;
                    savedEntries.push({
                        longPath: relativePath,
                        absolutePath: fileUri.fsPath,
                        command: `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`,
                    });
                }

                this.log('info', `[roleGen] Wrote ${String(savedEntries.length)} file(s)`);
                void this._panel.webview.postMessage({
                    type: 'writeRoleInWorkspace',
                    data: savedEntries,
                });
                break;
            }
            case 'feedback': {
                const request = data?.request as Record<string, unknown> | undefined;
                this.log('info', `[roleGen] Feedback: ${JSON.stringify(request)}`);
                if (request) {
                    const feedbackResult = await this.api.feedbackRequest(request, true);
                    if (isError(feedbackResult)) {
                        this.log(
                            'error',
                            `[roleGen] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`,
                        );
                    } else {
                        this.log('info', '[roleGen] Feedback API success');
                    }
                }
                break;
            }
            case 'getCollectionList': {
                this.log('info', '[roleGen] Getting collection list from workspace');
                const collections = await this._getCollections();
                this.log('info', `[roleGen] Found ${String(collections.length)} collection(s)`);
                void this._panel.webview.postMessage({
                    type: 'getCollectionList',
                    data: collections,
                });
                break;
            }
            case 'getTelemetryStatus': {
                void this._panel.webview.postMessage({
                    type: 'telemetryStatus',
                    data: { enabled: true },
                });
                break;
            }
            default: {
                this.log(
                    'debug',
                    `[roleGen] Unhandled message: type=${type ?? 'undefined'}, keys=${Object.keys(message).join(',')}`,
                );
            }
        }
    }

    /**
     * Resolve the workspace URI for a role's base directory within a collection.
     * If the collection exists in the workspace, uses its path. Otherwise creates
     * the standard Ansible collection directory structure under the workspace root.
     * @param collectionName - Fully qualified collection name (e.g. "namespace.name").
     * @param roleName - Name of the role to locate.
     * @returns The URI of the role base directory, or undefined if no workspace is open.
     */
    private async _getRoleBaseDir(
        collectionName: string,
        roleName: string,
    ): Promise<vscode.Uri | undefined> {
        const collections = await this._getCollections();
        const match = collections.find((c) => c.fqcn === collectionName);
        if (match) {
            return vscode.Uri.file(`${match.path}/roles/${roleName}`);
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return undefined;

        const parts = collectionName.split('.');
        if (parts.length !== 2) return undefined;

        const [namespace, name] = parts;
        return vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            'collections',
            'ansible_collections',
            namespace,
            name,
            'roles',
            roleName,
        );
    }

    /**
     * Discover writable Ansible collections in the workspace by scanning for galaxy.yml.
     * Only workspace collections are returned — installed system collections are read-only.
     * @returns A sorted list of collection entries with fully qualified names and paths.
     */
    private async _getCollections(): Promise<{ fqcn: string; path: string }[]> {
        const seen = new Set<string>();
        const collections: { fqcn: string; path: string }[] = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return [];

        for (const folder of workspaceFolders) {
            const galaxyFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/galaxy.yml'),
                '**/node_modules/**',
                20,
            );
            for (const uri of galaxyFiles) {
                try {
                    const content = new TextDecoder().decode(
                        await vscode.workspace.fs.readFile(uri),
                    );
                    const nsMatch = /^namespace:\s*(\S+)/m.exec(content);
                    const nameMatch = /^name:\s*(\S+)/m.exec(content);
                    if (nsMatch && nameMatch) {
                        const fqcn = `${nsMatch[1]}.${nameMatch[1]}`;
                        if (!seen.has(fqcn)) {
                            seen.add(fqcn);
                            const collPath = vscode.Uri.joinPath(uri, '..').fsPath;
                            collections.push({ fqcn, path: collPath });
                        }
                    }
                } catch {
                    // skip unreadable files
                }
            }
        }

        collections.sort((a, b) => a.fqcn.localeCompare(b.fqcn));
        return collections;
    }

    /**
     * Maps an API error to a user-friendly message with actionable guidance.
     * @param error - The structured error from the API client.
     * @returns A user-facing error string.
     */
    private _getUserErrorMessage(error: IError): string {
        const code = error.code;
        if (
            code === 'fallback__unauthorized' ||
            code === 'permission_denied__user_not_authenticated' ||
            error.message?.includes('authentication failed') ||
            error.message?.includes('Token refresh failed')
        ) {
            void vscode.window
                .showWarningMessage('Your Ansible Lightspeed session has expired.', 'Sign In')
                .then((selection) => {
                    if (selection === 'Sign In') {
                        void vscode.commands.executeCommand('ansible.lightspeed.oauth');
                    }
                });
            return 'Session expired. Please sign in again using the "Ansible Lightspeed: Sign In" command.';
        }
        if (code === 'fallback__bad_request') {
            return `Request failed: ${error.message ?? 'Bad request. Please check your input and try again.'}`;
        }
        if (code === 'fallback__too_many_requests') {
            return 'Too many requests. Please wait a moment and try again.';
        }
        return (
            error.message ??
            'An unexpected error occurred. Check the Ansible Lightspeed output channel for details.'
        );
    }

    /**
     *
     */
    private dispose() {
        RoleGenPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
