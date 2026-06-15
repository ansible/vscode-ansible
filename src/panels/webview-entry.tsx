/**
 * Webview entry point bundled by esbuild into dist/webview.js.
 *
 * This module runs inside the VS Code webview iframe. It reads the
 * data-view and data-props attributes from the root element, selects
 * the appropriate shared React component, provides a VS Code bridge
 * implementation, and mounts the app.
 */
import { createRoot } from 'react-dom/client';
import {
    BridgeProvider,
    EEDetailView,
    PythonPackageDetailView,
    SystemPackageDetailView,
} from '@ansible/ui';
import { VsCodeBridge } from './bridges/VsCodeBridge';
// esbuild imports CSS as text via loader config; inject at runtime
import tokensCss from '@ansible/ui/styles/tokens.css';

const style = document.createElement('style');
style.textContent = tokensCss;
document.head.appendChild(style);

const vscode = acquireVsCodeApi();
const bridge = new VsCodeBridge(vscode);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const viewName = root.dataset.view;
const props = JSON.parse(root.dataset.props ?? '{}') as Record<string, unknown>;

function App() {
    const content = (() => {
        switch (viewName) {
            case 'ee-detail':
                return <EEDetailView eeName={props.eeName as string} />;
            case 'python-package-detail':
                return (
                    <PythonPackageDetailView
                        eeName={props.eeName as string}
                        packageName={props.packageName as string}
                    />
                );
            case 'system-package-detail':
                return (
                    <SystemPackageDetailView
                        eeName={props.eeName as string}
                        packageName={props.packageName as string}
                    />
                );
            default:
                return <div>Unknown view: {viewName}</div>;
        }
    })();

    return <BridgeProvider value={bridge}>{content}</BridgeProvider>;
}

createRoot(root).render(<App />);
