import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError } from '../errors';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

export class RoleGenPanel {
    public static currentPanel: RoleGenPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly api: LightspeedAPI,
        private readonly telemetry: TelemetryReporter,
        private readonly log: LogFn,
        extensionUri: vscode.Uri,
    ) {
        this._panel = panel;
        this._panel.webview.html = getWebviewHtml(extensionUri, this._panel.webview, 'role-generation');

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            null,
            this._disposables,
        );
    }

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

    private async _handleMessage(message: { type?: string; data?: any }) {
        const type = message.type as string | undefined;
        const data = message.data;
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
                this.log('info', `[roleGen] Generating role: text="${text.substring(0, 100)}", name=${name ?? 'none'}, createOutline=${String(createOutline)}, generationId=${generationId}`);
                this.telemetry.sendEvent(LightspeedEvents.GENERATION_OPEN);

                const result = await this.api.roleGenerationRequest({
                    text,
                    generationId,
                    createOutline,
                    name,
                    ...(outline ? { outline } : {}),
                });

                if (isError(result)) {
                    this.log('error', `[roleGen] API error: code=${result.code}, message=${result.message ?? 'none'}`);
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: result.message ?? result.code,
                    });
                } else {
                    this.log('info', `[roleGen] API success: name=${result.name}, files=${result.files?.length ?? 0}`);
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
                this.log('info', `[roleGen] Opening editor with ${content.length} chars`);
                const doc = await vscode.workspace.openTextDocument({ content, language: 'yaml' });
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
            case 'writeRoleInWorkspace': {
                const rawFiles = data?.files as [string, string, string][] | undefined;
                const roleName = data?.roleName as string | undefined;
                const collectionName = data?.collectionName as string | undefined;
                if (!rawFiles || !roleName || !collectionName) {
                    this.log('error', '[roleGen] writeRoleInWorkspace: missing files, roleName, or collectionName');
                    break;
                }

                const roleBaseDirUri = await this._getRoleBaseDir(collectionName, roleName);
                if (!roleBaseDirUri) {
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: `Collection "${collectionName}" not found in workspace.`,
                    });
                    void this._panel.webview.postMessage({ type: 'writeRoleInWorkspace', data: [] });
                    break;
                }

                this.log('info', `[roleGen] Writing role "${roleName}" in collection "${collectionName}" to ${roleBaseDirUri.fsPath}`);
                const savedEntries: { longPath: string; absolutePath: string; command: string }[] = [];

                for (const [filePath, content, fileType] of rawFiles) {
                    const dirUri = vscode.Uri.joinPath(roleBaseDirUri, `${fileType}s`);
                    const fileUri = vscode.Uri.joinPath(roleBaseDirUri, `${fileType}s`, 'main.yml');

                    await vscode.workspace.fs.createDirectory(dirUri);
                    await vscode.workspace.fs.writeFile(
                        fileUri,
                        new TextEncoder().encode(content),
                    );

                    const linkUri = { scheme: 'file', path: fileUri.fsPath, authority: '' };
                    const relativePath = `${collectionName.replace('.', '/')}/roles/${roleName}/${fileType}s/main.yml`;
                    savedEntries.push({
                        longPath: relativePath,
                        absolutePath: fileUri.fsPath,
                        command: `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`,
                    });
                }

                this.log('info', `[roleGen] Wrote ${savedEntries.length} file(s)`);
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
                    const feedbackResult = await this.api.feedbackRequest(
                        request as any,
                        true,
                    );
                    if (isError(feedbackResult)) {
                        this.log('error', `[roleGen] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`);
                    } else {
                        this.log('info', '[roleGen] Feedback API success');
                    }
                }
                break;
            }
            case 'getCollectionList': {
                this.log('info', '[roleGen] Getting collection list from workspace');
                const collections = await this._getCollections();
                this.log('info', `[roleGen] Found ${collections.length} collection(s)`);
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
                this.log('debug', `[roleGen] Unhandled message: type=${type ?? 'undefined'}, keys=${Object.keys(message).join(',')}`);
            }
        }
    }

    private async _getRoleBaseDir(collectionName: string, roleName: string): Promise<vscode.Uri | undefined> {
        const collections = await this._getCollections();
        const match = collections.find((c) => c.fqcn === collectionName);
        if (!match) return undefined;
        return vscode.Uri.file(`${match.path}/roles/${roleName}`);
    }

    private async _getCollections(): Promise<{ fqcn: string; path: string }[]> {
        const seen = new Set<string>();
        const collections: { fqcn: string; path: string }[] = [];

        // 1. Scan workspace for galaxy.yml (collection projects being developed)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders?.length) {
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
                        const nsMatch = content.match(/^namespace:\s*(\S+)/m);
                        const nameMatch = content.match(/^name:\s*(\S+)/m);
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
        }

        // 2. List installed collections via CollectionsService
        try {
            const { CollectionsService } = await import('@ansible/services');
            const svc = CollectionsService.getInstance();
            const installed = await svc.listInstalledCollections();
            for (const col of installed) {
                if (!seen.has(col.name)) {
                    seen.add(col.name);
                    collections.push({ fqcn: col.name, path: col.path ?? '' });
                }
            }
        } catch (e) {
            this.log('debug', `[roleGen] CollectionsService.listInstalledCollections failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        collections.sort((a, b) => a.fqcn.localeCompare(b.fqcn));
        return collections;
    }

    private dispose() {
        RoleGenPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
