/**
 * Base bridge interface for host-agnostic UI components.
 *
 * Every shared view needs at least these capabilities from its host
 * environment. Consumer-specific bridge implementations (VS Code
 * postMessage, Electron IPC, REST API) satisfy this contract.
 */
export interface HostBridgeCore {
    openFile(path: string): Promise<void>;
    showToast(message: string): void;
    getResolvedTheme(): 'light' | 'dark';
    saveViewSettings(settings: { zoom?: number; theme?: string }): Promise<void>;
}

export type Disposable = () => void;
