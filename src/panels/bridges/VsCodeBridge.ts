import type {
    EEBridge,
    EEInfo,
    EECollection,
    EEPythonPackage,
    EEPackage,
    PythonPackageDetail,
    SystemPackageDetail,
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

export class VsCodeBridge implements EEBridge {
    private _nextId = 1;
    private _pending = new Map<
        number,
        { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();

    constructor(private _vscode: VsCodeApi) {
        window.addEventListener('message', (event: MessageEvent) => {
            const msg = event.data as { id?: number; result?: unknown; error?: string };
            if (msg.id !== undefined && this._pending.has(msg.id)) {
                const handler = this._pending.get(msg.id)!;
                clearTimeout(handler.timer);
                this._pending.delete(msg.id);
                if (msg.error) {
                    handler.reject(new Error(msg.error));
                } else {
                    handler.resolve(msg.result);
                }
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
}
