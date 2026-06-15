/**
 * Type declarations for the VS Code webview runtime.
 * acquireVsCodeApi() is injected by VS Code into the webview iframe.
 */
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

/** CSS files imported as text strings via esbuild loader config. */
declare module '*.css' {
    const content: string;
    export default content;
}

declare module '@ansible/ui/styles/tokens.css' {
    const content: string;
    export default content;
}
