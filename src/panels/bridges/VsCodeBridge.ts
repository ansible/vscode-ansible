import type {
    EEBridge,
    EEInfo,
    EECollection,
    EEPythonPackage,
    EEPackage,
    PythonPackageDetail,
    SystemPackageDetail,
    PluginDocBridge,
    PluginData,
    CreatorBridge,
    ExecutionStartedEvent,
    ExecutionFinishedEvent,
} from '@ansible/ui';

type VsCodeApi = {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

/**
 * Bridge implementation for VS Code webviews.
 *
 * Uses postMessage with correlation IDs for request/response RPC.
 * The extension host panel class handles the other side of the
 * message channel.
 */
/** Timeout for RPC requests in milliseconds. */
const RPC_TIMEOUT_MS = 30_000;

export class VsCodeBridge implements EEBridge, PluginDocBridge, CreatorBridge {
    enableAiFeatures = false;
    workspacePath = '';
    private _nextId = 1;
    private _pending = new Map<
        number,
        { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();
    private _executionStartedListeners = new Set<(e: ExecutionStartedEvent) => void>();
    private _executionFinishedListeners = new Set<(e: ExecutionFinishedEvent) => void>();

    constructor(private _vscode: VsCodeApi) {
        window.addEventListener('message', (event: MessageEvent) => {
            const msg = event.data as {
                id?: number;
                result?: unknown;
                error?: string;
                method?: string;
                params?: Record<string, unknown>;
            };

            // RPC responses
            if (msg.id !== undefined && this._pending.has(msg.id)) {
                const handler = this._pending.get(msg.id)!;
                clearTimeout(handler.timer);
                this._pending.delete(msg.id);
                if (msg.error) {
                    handler.reject(new Error(msg.error));
                } else {
                    handler.resolve(msg.result);
                }
                return;
            }

            // Push notifications from extension
            if (msg.method === 'executionStarted') {
                const params = msg.params as unknown as ExecutionStartedEvent;
                for (const cb of this._executionStartedListeners) cb(params);
            } else if (msg.method === 'executionFinished') {
                const params = msg.params as unknown as ExecutionFinishedEvent;
                for (const cb of this._executionFinishedListeners) cb(params);
            }
        });
    }

    private _request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
        const id = this._nextId++;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`RPC timeout: ${method} (${String(RPC_TIMEOUT_MS)}ms)`));
            }, RPC_TIMEOUT_MS);

            this._pending.set(id, {
                resolve: resolve as (v: unknown) => void,
                reject,
                timer,
            });
            this._vscode.postMessage({ id, method, params });
        });
    }

    async openFile(path: string): Promise<void> {
        return this._request('openFile', { path });
    }

    showToast(message: string): void {
        this._vscode.postMessage({ method: 'showToast', params: { message } });
    }

    getResolvedTheme(): 'light' | 'dark' {
        const el = document.documentElement;
        return el.classList.contains('vscode-light') ? 'light' : 'dark';
    }

    async saveViewSettings(settings: { zoom?: number; theme?: string }): Promise<void> {
        return this._request('saveViewSettings', settings);
    }

    async getInfo(eeName: string): Promise<EEInfo> {
        return this._request('getInfo', { eeName });
    }

    async getCollections(eeName: string): Promise<EECollection[]> {
        return this._request('getCollections', { eeName });
    }

    async getPythonPackages(eeName: string): Promise<EEPythonPackage[]> {
        return this._request('getPythonPackages', { eeName });
    }

    async getSystemPackages(eeName: string): Promise<EEPackage[]> {
        return this._request('getSystemPackages', { eeName });
    }

    async getPythonPackageDetail(
        eeName: string,
        packageName: string,
    ): Promise<PythonPackageDetail | undefined> {
        return this._request('getPythonPackageDetail', { eeName, packageName });
    }

    async getSystemPackageDetail(
        eeName: string,
        packageName: string,
    ): Promise<SystemPackageDetail | undefined> {
        return this._request('getSystemPackageDetail', { eeName, packageName });
    }

    openPackageDetail(eeName: string, packageName: string, packageType: 'python' | 'system'): void {
        this._vscode.postMessage({
            method: 'openPackageDetail',
            params: { eeName, packageName, packageType },
        });
    }

    async getPluginDoc(fqcn: string, pluginType: string): Promise<PluginData | null> {
        return this._request('getPluginDoc', { fqcn, pluginType });
    }

    async copyToClipboard(text: string): Promise<void> {
        return this._request('copyToClipboard', { text });
    }

    async openChat(prompt?: string): Promise<void> {
        this._vscode.postMessage({ method: 'openChat', params: { prompt } });
    }

    async execute(commandPath: string[], values: Record<string, unknown>): Promise<void> {
        return this._request('execute', { commandPath, values });
    }

    onExecutionStarted(cb: (event: ExecutionStartedEvent) => void): () => void {
        this._executionStartedListeners.add(cb);
        return () => { this._executionStartedListeners.delete(cb); };
    }

    onExecutionFinished(cb: (event: ExecutionFinishedEvent) => void): () => void {
        this._executionFinishedListeners.add(cb);
        return () => { this._executionFinishedListeners.delete(cb); };
    }

    cancel(): void {
        this._vscode.postMessage({ method: 'cancel' });
    }
}
