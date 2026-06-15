/**
 * Webview entry point bundled by esbuild into dist/webview.js.
 *
 * This module runs inside the VS Code webview iframe. It reads the
 * data-view and data-props attributes from the root element, selects
 * the appropriate shared React component, provides a VS Code bridge
 * implementation, and mounts the app.
 */
import { createRoot } from 'react-dom/client';
import { BridgeProvider, EEDetailView } from '@ansible/ui';
import { VsCodeBridge } from './bridges/VsCodeBridge';

const vscode = acquireVsCodeApi();
const bridge = new VsCodeBridge(vscode);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const viewName = root.dataset.view;
const props = JSON.parse(root.dataset.props ?? '{}') as Record<string, unknown>;

function App() {
    switch (viewName) {
        case 'ee-detail':
            return (
                <BridgeProvider value={bridge}>
                    <EEDetailView eeName={props.eeName as string} />
                </BridgeProvider>
            );
        default:
            return <div>Unknown view: {viewName}</div>;
    }
}

createRoot(root).render(<App />);
