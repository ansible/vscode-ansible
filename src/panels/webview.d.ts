/**
 * Type declarations for the VS Code webview runtime.
 * acquireVsCodeApi() is injected by VS Code into the webview iframe.
 */
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
