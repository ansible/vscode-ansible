import * as vscode from 'vscode';
import { CollectionsService } from '@ansible/core';
import type { PluginOption, PluginReturn, PluginData } from '@ansible/core';

// Helper to normalize string or string[] to string[]
function toArray(value: string | string[] | undefined): string[] {
    if (!value) {return [];}
    if (Array.isArray(value)) {return value;}
    return [value];
}

export class PluginDocPanel {
    private static _panels: Map<string, PluginDocPanel> = new Map();
    public static readonly viewType = 'pluginDocPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _pluginKey: string;
    private _disposables: vscode.Disposable[] = [];

    public static async show(
        extensionUri: vscode.Uri,
        pluginFullName: string,
        pluginType: string
    ) {
        const pluginKey = `${pluginFullName}:${pluginType}`;
        
        // If panel for this plugin already exists, reveal it
        const existingPanel = PluginDocPanel._panels.get(pluginKey);
        if (existingPanel) {
            existingPanel._panel.reveal();
            return;
        }

        // Create new panel in a new tab
        const panel = vscode.window.createWebviewPanel(
            PluginDocPanel.viewType,
            `${pluginFullName}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        const docPanel = new PluginDocPanel(panel, extensionUri, pluginKey);
        PluginDocPanel._panels.set(pluginKey, docPanel);
        await docPanel._loadPluginDoc(pluginFullName, pluginType);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, pluginKey: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._pluginKey = pluginKey;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.type === 'aiPrompt') {
                    // Show info message with the copied prompt
                    vscode.window.showInformationMessage(
                        'AI prompt copied to clipboard. Paste it into an agent chat session.',
                        'Open Chat'
                    ).then(selection => {
                        if (selection === 'Open Chat') {
                            // Try to open the chat panel
                            vscode.commands.executeCommand('workbench.action.chat.open');
                        }
                    });
                } else if (message.type === 'updateSettings') {
                    // Save settings to workspace configuration
                    const config = vscode.workspace.getConfiguration('ansibleEnvironments');
                    if (message.zoom !== undefined) {
                        await config.update('pluginDocZoom', message.zoom, vscode.ConfigurationTarget.Workspace);
                    }
                    if (message.theme !== undefined) {
                        await config.update('pluginDocTheme', message.theme, vscode.ConfigurationTarget.Workspace);
                    }
                }
            },
            null,
            this._disposables
        );
    }

    private async _loadPluginDoc(pluginFullName: string, pluginType: string) {
        this._panel.webview.html = this._getLoadingHtml();

        try {
            const service = CollectionsService.getInstance();
            const pluginData = await service.getPluginDocumentation(pluginFullName, pluginType);

            if (!pluginData || !pluginData.doc) {
                this._panel.webview.html = this._getErrorHtml('Plugin documentation not found');
                return;
            }

            // Get settings
            const config = vscode.workspace.getConfiguration('ansibleEnvironments');
            const zoom = config.get<number>('pluginDocZoom', 100);
            const themeSetting = config.get<string>('pluginDocTheme', 'auto');
            const enableAiFeatures = config.get<boolean>('enableAiFeatures', true);
            
            // Resolve 'auto' to actual theme based on VS Code's current theme
            const vscodeThemeKind = vscode.window.activeColorTheme.kind;
            const isVsCodeLight = vscodeThemeKind === vscode.ColorThemeKind.Light || 
                                  vscodeThemeKind === vscode.ColorThemeKind.HighContrastLight;
            const resolvedTheme = themeSetting === 'auto' 
                ? (isVsCodeLight ? 'light' : 'dark')
                : themeSetting;

            this._panel.webview.html = this._getDocHtml(pluginFullName, pluginType, pluginData, zoom, themeSetting, resolvedTheme, enableAiFeatures);
        } catch (error) {
            this._panel.webview.html = this._getErrorHtml(`Failed to load documentation: ${error}`);
        }
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 40px;
            color: var(--vscode-foreground);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--vscode-editor-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <div>Loading documentation...</div>
    </div>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 40px;
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <h2>Error</h2>
    <p>${this._escapeHtml(message)}</p>
</body>
</html>`;
    }

    private _getDocHtml(pluginFullName: string, pluginType: string, data: PluginData, initialZoom: number = 100, themeSetting: string = 'auto', resolvedTheme: string = 'dark', enableAiFeatures: boolean = true): string {
        const doc = data.doc!;
        const parts = pluginFullName.split('.');
        const namespace = parts[0];
        const collection = parts[1];
        const pluginName = parts.slice(2).join('.');

        return `<!DOCTYPE html>
<html lang="en" data-theme="${resolvedTheme}" data-theme-setting="${themeSetting}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pluginFullName}</title>
    <style>
        /* Dark theme (default) */
        :root, [data-theme="dark"] {
            --bg: #0d0d0d;
            --surface: #161616;
            --surface-light: #1e1e1e;
            --border: #333;
            --text: #e0e0e0;
            --text-muted: #888;
            --text-dim: #666;
            --accent: #fff;
            --code-bg: #0a0a0a;
            --required: #e57373;
            --success: #81c784;
            /* YAML syntax - dark */
            --yaml-key: #9cdcfe;
            --yaml-string: #ce9178;
            --yaml-number: #b5cea8;
            --yaml-bool: #569cd6;
            --yaml-comment: #6a9955;
            --yaml-anchor: #c586c0;
        }
        
        /* Light theme */
        [data-theme="light"] {
            --bg: #ffffff;
            --surface: #f5f5f5;
            --surface-light: #e8e8e8;
            --border: #ddd;
            --text: #1a1a1a;
            --text-muted: #555;
            --text-dim: #777;
            --accent: #000;
            --code-bg: #f8f8f8;
            --required: #c62828;
            --success: #2e7d32;
            /* YAML syntax - light (higher contrast) */
            --yaml-key: #0451a5;
            --yaml-string: #a31515;
            --yaml-number: #098658;
            --yaml-bool: #0000ff;
            --yaml-comment: #008000;
            --yaml-anchor: #800080;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            background: var(--bg);
            color: var(--text);
            line-height: 1.5;
        }
        
        .container { max-width: 960px; margin: 0 auto; padding: 16px; }
        
        /* Breadcrumb */
        .breadcrumb {
            font-size: 11px;
            color: var(--text-dim);
            margin-bottom: 12px;
        }
        .breadcrumb-separator { margin: 0 4px; }
        
        /* Header */
        .header {
            border-bottom: 1px solid var(--border);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-title h1 {
            font-size: 18px;
            font-weight: 600;
            font-family: 'SFMono-Regular', Consolas, monospace;
        }
        .plugin-type-badge {
            background: var(--surface-light);
            border: 1px solid var(--border);
            color: var(--text-muted);
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .short-desc {
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 6px;
        }
        .version-info {
            font-size: 11px;
            color: var(--text-dim);
            margin-top: 4px;
        }
        
        /* Navigation tabs */
        .nav-tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--border);
            margin-bottom: 16px;
        }
        .nav-tab {
            padding: 8px 14px;
            font-size: 12px;
            color: var(--text-muted);
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            cursor: pointer;
        }
        .nav-tab:hover { color: var(--text); }
        .nav-tab.active {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }
        
        /* Sections */
        .section { margin-bottom: 20px; }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--text);
        }
        
        /* Synopsis */
        .synopsis {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            font-size: 12px;
        }
        .synopsis ul { margin: 0; padding-left: 16px; }
        .synopsis li { margin-bottom: 4px; }
        
        /* Parameters - Tree Style */
        .param-tree { font-size: 12px; }
        
        .param-item {
            border-bottom: 1px solid var(--border);
            padding: 8px 0;
        }
        .param-item:last-child { border-bottom: none; }
        
        .param-header {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        .param-toggle {
            width: 14px;
            height: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: var(--text-dim);
            flex-shrink: 0;
            margin-top: 2px;
        }
        .param-toggle:empty { visibility: hidden; }
        
        .param-name {
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-weight: 600;
            color: var(--text);
        }
        .param-type {
            font-size: 11px;
            color: var(--text-dim);
            font-family: monospace;
        }
        .param-required {
            color: var(--required);
            font-size: 10px;
            font-weight: 600;
        }
        
        .param-meta {
            display: flex;
            gap: 12px;
            margin-top: 4px;
            margin-left: 22px;
        }
        .param-desc {
            color: var(--text-muted);
            margin-top: 4px;
            margin-left: 22px;
            font-size: 12px;
        }
        .param-desc p { margin: 0 0 4px 0; }
        
        .param-choices {
            margin-top: 4px;
            margin-left: 22px;
        }
        .param-choice {
            display: inline-block;
            background: var(--code-bg);
            border: 1px solid var(--border);
            padding: 1px 6px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 11px;
            margin-right: 4px;
            margin-bottom: 2px;
        }
        .param-choice.default {
            border-color: var(--success);
            color: var(--success);
        }
        
        .param-default {
            font-size: 11px;
            color: var(--success);
        }
        
        /* Suboptions */
        .suboptions {
            margin-left: 22px;
            margin-top: 8px;
            padding-left: 12px;
            border-left: 1px solid var(--border);
            display: none;
        }
        .suboptions.expanded { display: block; }
        
        /* Notes */
        .notes {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            font-size: 12px;
        }
        .notes ul { margin: 0; padding-left: 16px; }
        .notes li { margin-bottom: 4px; }
        
        /* Examples */
        .example-section {
            margin-bottom: 16px;
        }
        .example-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--surface);
            border: 1px solid var(--border);
            border-bottom: none;
            border-radius: 4px 4px 0 0;
            padding: 8px 12px;
        }
        .example-title {
            font-weight: 600;
            font-size: 12px;
            color: var(--text);
        }
        .example-copy-btn {
            background: var(--surface-light);
            border: 1px solid var(--border);
            color: var(--text-muted);
            padding: 4px 10px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .example-copy-btn:hover {
            background: var(--border);
            color: var(--text);
        }
        .example-copy-btn.copied {
            color: var(--success);
            border-color: var(--success);
        }
        .example-code {
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 0 0 4px 4px;
            padding: 12px;
            overflow-x: auto;
            margin: 0;
        }
        .example-code pre {
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre;
            color: var(--text);
            margin: 0;
        }
        .example-context {
            background: var(--surface);
            border: 1px solid var(--border);
            border-top: none;
            padding: 10px 12px;
            font-size: 11px;
            color: var(--text-dim);
            font-family: 'SFMono-Regular', Consolas, monospace;
            white-space: pre-wrap;
        }
        .example-context:first-of-type {
            border-radius: 4px 4px 0 0;
            border-top: 1px solid var(--border);
        }
        .example-context-label {
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        /* YAML Syntax Highlighting */
        .yaml-key { color: var(--yaml-key); }
        .yaml-string { color: var(--yaml-string); }
        .yaml-number { color: var(--yaml-number); }
        .yaml-bool { color: var(--yaml-bool); }
        .yaml-null { color: var(--yaml-bool); }
        .yaml-comment { color: var(--yaml-comment); font-style: italic; }
        .yaml-comment-dim { color: var(--text-dim); font-style: italic; }
        .yaml-comment-type { color: var(--yaml-bool); font-style: italic; }
        .yaml-comment-required { color: var(--required); font-style: italic; }
        .yaml-comment-optional { color: var(--text-dim); font-style: italic; }
        .yaml-list-marker { color: var(--text-muted); }
        
        /* Examples view toggle */
        .examples-toolbar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 12px;
        }
        .view-toggle {
            display: flex;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 4px;
            overflow: hidden;
        }
        .view-toggle-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 6px 12px;
            font-size: 11px;
            cursor: pointer;
        }
        .view-toggle-btn:hover {
            background: var(--surface-light);
        }
        .view-toggle-btn.active {
            background: var(--border);
            color: var(--text);
        }
        .examples-formatted, .examples-raw {
            display: none;
        }
        .examples-formatted.active, .examples-raw.active {
            display: block;
        }
        .sample-view {
            display: none;
        }
        .sample-view.active {
            display: block;
        }
        .raw-examples {
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
        }
        .raw-examples pre {
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre;
            color: var(--text);
            margin: 0;
        }
        
        /* Return values */
        .return-item {
            border-bottom: 1px solid var(--border);
            padding: 8px 0;
        }
        .return-item:last-child { border-bottom: none; }
        .return-name {
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-weight: 600;
        }
        .return-meta {
            font-size: 11px;
            color: var(--text-dim);
            margin-top: 2px;
        }
        .return-desc {
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 4px;
        }
        .return-sample {
            background: var(--code-bg);
            border: 1px solid var(--border);
            padding: 6px 10px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 11px;
            margin-top: 6px;
            overflow-x: auto;
            white-space: pre;
        }
        
        /* Author */
        .author { color: var(--text-dim); font-size: 12px; }
        
        /* Tab content */
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        /* Toolbar */
        .toolbar {
            position: fixed;
            top: 12px;
            right: 20px;
            display: flex;
            gap: 4px;
            z-index: 100;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 4px;
        }
        .toolbar-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
        }
        .toolbar-btn:hover {
            background: var(--surface-light);
            color: var(--text);
        }
        .toolbar-btn.ai-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 11px;
            font-weight: 700;
            width: auto;
            padding: 0 10px;
        }
        .toolbar-btn.ai-btn:hover {
            opacity: 0.9;
        }
        .toolbar-divider {
            width: 1px;
            background: var(--border);
            margin: 4px 2px;
        }
        .zoom-label {
            font-size: 11px;
            color: var(--text-dim);
            display: flex;
            align-items: center;
            padding: 0 4px;
        }
        
        /* Inline code */
        code {
            background: var(--code-bg);
            padding: 1px 4px;
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 0.9em;
        }
        
        /* Links */
        a { color: var(--text-muted); text-decoration: underline; }
        a:hover { color: var(--text); }
    </style>
</head>
<body>
    <div class="toolbar">
        <button class="toolbar-btn" id="zoom-out-btn" title="Zoom out">−</button>
        <span class="zoom-label" id="zoom-level">${initialZoom}%</span>
        <button class="toolbar-btn" id="zoom-in-btn" title="Zoom in">+</button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" id="theme-btn" title="Toggle theme">${themeSetting}</button>
        ${enableAiFeatures ? `
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn ai-btn" id="ai-prompt-btn" title="Generate AI prompt for task builder">AI</button>
        ` : ''}
    </div>
    
    <div class="container">
        <div class="breadcrumb">
            <span>${namespace}</span>
            <span class="breadcrumb-separator">›</span>
            <span>${collection}</span>
            <span class="breadcrumb-separator">›</span>
            <span>${pluginType}</span>
            <span class="breadcrumb-separator">›</span>
            <strong>${pluginName}</strong>
        </div>
        
        <div class="header">
            <div class="header-title">
                <h1>${pluginName}</h1>
                <span class="plugin-type-badge">${pluginType}</span>
            </div>
            <div class="short-desc">${this._escapeHtml(doc.short_description || '')}</div>
            ${doc.version_added ? `<div class="version-info">Added in version ${doc.version_added}</div>` : ''}
        </div>
        
        <div class="nav-tabs">
            <span class="nav-tab active" data-tab="synopsis">Synopsis</span>
            <span class="nav-tab" data-tab="parameters">Parameters</span>
            <span class="nav-tab" data-tab="sample">Sample Task</span>
            ${doc.notes ? '<span class="nav-tab" data-tab="notes">Notes</span>' : ''}
            ${data.examples ? '<span class="nav-tab" data-tab="examples">Examples</span>' : ''}
            ${data.return ? '<span class="nav-tab" data-tab="return">Return Values</span>' : ''}
        </div>
        
        <div id="synopsis" class="tab-content active">
            <div class="section">
                <h2 class="section-title">Synopsis</h2>
                <div class="synopsis">
                    <ul>
                        ${toArray(doc.description).map(d => `<li>${this._formatText(d)}</li>`).join('')}
                    </ul>
                </div>
            </div>
            
            ${doc.requirements ? `
            <div class="section">
                <h2 class="section-title">Requirements</h2>
                <div class="synopsis">
                    <ul>
                        ${toArray(doc.requirements).map(r => `<li>${this._escapeHtml(r)}</li>`).join('')}
                    </ul>
                </div>
            </div>
            ` : ''}
            
            ${doc.author ? `
            <div class="section">
                <h2 class="section-title">Author</h2>
                <div class="author">
                    ${Array.isArray(doc.author) ? doc.author.join(', ') : doc.author}
                </div>
            </div>
            ` : ''}
        </div>
        
        <div id="parameters" class="tab-content">
            <div class="section">
                <h2 class="section-title">Parameters</h2>
                ${this._renderParameters(doc.options || {})}
            </div>
        </div>
        
        <div id="sample" class="tab-content">
            <div class="section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h2 class="section-title" style="margin-bottom: 0;">Sample Task</h2>
                    <button class="example-copy-btn" id="copy-btn-sample" onclick="copySampleTask()">
                        Copy
                    </button>
                </div>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px;">
                    A template task showing all available parameters with their defaults or example values.
                </p>
                ${this._renderSampleTask(pluginFullName, doc.options || {})}
            </div>
        </div>
        
        ${doc.notes ? `
        <div id="notes" class="tab-content">
            <div class="section">
                <h2 class="section-title">Notes</h2>
                <div class="notes">
                    <ul>
                        ${toArray(doc.notes).map(n => `<li>${this._formatText(n)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${data.examples ? `
        <div id="examples" class="tab-content">
            <div class="section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h2 class="section-title" style="margin-bottom: 0;">Examples</h2>
                    <div class="view-toggle">
                        <button class="view-toggle-btn active" id="btn-formatted" onclick="toggleExamplesView('formatted')">Formatted</button>
                        <button class="view-toggle-btn" id="btn-raw" onclick="toggleExamplesView('raw')">Raw</button>
                    </div>
                </div>
                <div class="examples-formatted active" id="examples-formatted">
                    ${this._renderExamples(data.examples)}
                </div>
                <div class="examples-raw" id="examples-raw">
                    <div class="raw-examples">
                        <pre>${this._highlightYaml(data.examples)}</pre>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${data.return ? `
        <div id="return" class="tab-content">
            <div class="section">
                <h2 class="section-title">Return Values</h2>
                ${this._renderReturnValues(data.return)}
            </div>
        </div>
        ` : ''}
    </div>
    
    <script>
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            });
        });
        
        // Collapsible suboptions
        function toggleSub(id) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.toggle('expanded');
                const header = el.previousElementSibling?.previousElementSibling?.previousElementSibling;
                if (header) {
                    const toggle = header.querySelector('.param-toggle');
                    if (toggle) {
                        toggle.textContent = el.classList.contains('expanded') ? '▼' : '▶';
                    }
                }
            }
        }
        
        // Copy to clipboard
        function copyExample(id) {
            const el = document.getElementById('task-' + id);
            if (el) {
                const text = el.getAttribute('data-raw');
                navigator.clipboard.writeText(text).then(() => {
                    const btn = document.getElementById('copy-btn-' + id);
                    if (btn) {
                        btn.classList.add('copied');
                        btn.innerHTML = '✓ Copied';
                        setTimeout(() => {
                            btn.classList.remove('copied');
                            btn.innerHTML = 'Copy';
                        }, 2000);
                    }
                });
            }
        }
        
        // Toggle between formatted and raw examples view
        function toggleExamplesView(view) {
            const formatted = document.getElementById('examples-formatted');
            const raw = document.getElementById('examples-raw');
            const btnFormatted = document.getElementById('btn-formatted');
            const btnRaw = document.getElementById('btn-raw');
            
            if (view === 'formatted') {
                formatted.classList.add('active');
                raw.classList.remove('active');
                btnFormatted.classList.add('active');
                btnRaw.classList.remove('active');
            } else {
                formatted.classList.remove('active');
                raw.classList.add('active');
                btnFormatted.classList.remove('active');
                btnRaw.classList.add('active');
            }
        }
        
        // Track current sample view
        let currentSampleView = 'optional';
        
        // Switch sample task view
        function switchSampleView(view) {
            currentSampleView = view;
            
            // Update buttons
            document.querySelectorAll('.sample-toolbar .view-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById('btn-no-comments')?.classList.toggle('active', view === 'none');
            document.getElementById('btn-optional')?.classList.toggle('active', view === 'optional');
            document.getElementById('btn-descriptions')?.classList.toggle('active', view === 'descriptions');
            
            // Update visible view
            document.querySelectorAll('.sample-view').forEach(v => v.classList.remove('active'));
            const viewMap = { 'none': 'sample-none', 'optional': 'sample-optional', 'descriptions': 'sample-descriptions' };
            document.getElementById(viewMap[view])?.classList.add('active');
        }
        
        // Copy current sample task to clipboard
        function copySampleTask() {
            const viewMap = { 'none': 'sample-none', 'optional': 'sample-optional', 'descriptions': 'sample-descriptions' };
            const el = document.getElementById(viewMap[currentSampleView]);
            if (el) {
                const text = el.getAttribute('data-raw');
                navigator.clipboard.writeText(text).then(() => {
                    const btn = document.getElementById('copy-btn-sample');
                    if (btn) {
                        btn.classList.add('copied');
                        btn.innerHTML = '✓ Copied';
                        setTimeout(() => {
                            btn.classList.remove('copied');
                            btn.innerHTML = 'Copy';
                        }, 2000);
                    }
                });
            }
        }
        
        // Initialize sample view
        switchSampleView('optional');
        
        // VS Code API for messaging
        const vscode = acquireVsCodeApi();
        
        // Zoom functionality
        (function() {
            let currentZoom = ${initialZoom};
            const minZoom = 50;
            const maxZoom = 200;
            const zoomStep = 10;
            
            const zoomInBtn = document.getElementById('zoom-in-btn');
            const zoomOutBtn = document.getElementById('zoom-out-btn');
            const zoomLevel = document.getElementById('zoom-level');
            const mainContent = document.querySelector('.container');
            
            // Apply initial zoom
            if (mainContent && currentZoom !== 100) {
                mainContent.style.zoom = (currentZoom / 100);
            }
            
            function updateZoom(save = true) {
                if (mainContent) {
                    mainContent.style.zoom = (currentZoom / 100);
                }
                if (zoomLevel) zoomLevel.textContent = currentZoom + '%';
                if (save) {
                    vscode.postMessage({ type: 'updateSettings', zoom: currentZoom });
                }
            }
            
            if (zoomInBtn) {
                zoomInBtn.onclick = function() {
                    if (currentZoom < maxZoom) {
                        currentZoom += zoomStep;
                        updateZoom();
                    }
                };
            }
            
            if (zoomOutBtn) {
                zoomOutBtn.onclick = function() {
                    if (currentZoom > minZoom) {
                        currentZoom -= zoomStep;
                        updateZoom();
                    }
                };
            }
        })();
        
        // Theme toggle functionality
        (function() {
            const themes = ['auto', 'light', 'dark'];
            let currentThemeSetting = '${themeSetting}';
            
            const themeBtn = document.getElementById('theme-btn');
            
            function updateThemeButton() {
                if (themeBtn) {
                    themeBtn.textContent = currentThemeSetting;
                    themeBtn.title = 'Theme: ' + currentThemeSetting + ' (click to cycle)';
                }
            }
            
            if (themeBtn) {
                themeBtn.onclick = function() {
                    const currentIndex = themes.indexOf(currentThemeSetting);
                    currentThemeSetting = themes[(currentIndex + 1) % themes.length];
                    
                    // For auto, we can't resolve here without VS Code - just toggle between light/dark
                    // The next reload will properly resolve 'auto'
                    const displayTheme = currentThemeSetting === 'auto' ? 'dark' : currentThemeSetting;
                    document.documentElement.setAttribute('data-theme', displayTheme);
                    document.documentElement.setAttribute('data-theme-setting', currentThemeSetting);
                    
                    updateThemeButton();
                    vscode.postMessage({ type: 'updateSettings', theme: currentThemeSetting });
                };
            }
        })();
        
        // AI prompt generation (only if AI features enabled)
        const pluginFullName = "${pluginFullName}";
        const pluginType = "${pluginType}";
        const aiBtn = document.getElementById('ai-prompt-btn');
        if (aiBtn) {
            aiBtn.addEventListener('click', function() {
                const prompt = \`Help me create an Ansible task using the \${pluginFullName} \${pluginType}, guiding me through the required and optional parameters. Use the build_ansible_task MCP tool to accomplish this.\`;
                
                // Copy to clipboard
                const btn = this;
                const originalText = btn.innerHTML;
                navigator.clipboard.writeText(prompt).then(() => {
                    btn.innerHTML = '✓';
                    btn.style.background = 'var(--success)';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.background = '';
                    }, 2000);
                });
                
                // Also send message to extension to open chat
                vscode.postMessage({
                    type: 'aiPrompt',
                    prompt: prompt
                });
            });
        }
    </script>
</body>
</html>`;
    }

    private _renderParameters(options: { [key: string]: PluginOption }, depth: number = 0): string {
        if (Object.keys(options).length === 0) {
            return '<p style="color: var(--text-dim);">No parameters</p>';
        }

        const sortedOptions = Object.entries(options).sort((a, b) => a[0].localeCompare(b[0]));
        const items = sortedOptions.map(([name, opt]) => this._renderParamItem(name, opt, depth)).join('');
        
        if (depth === 0) {
            return `<div class="param-tree">${items}</div>`;
        }
        return `<div class="suboptions" id="sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}">${items}</div>`;
    }

    private _renderParamItem(name: string, opt: PluginOption, depth: number): string {
        const typeStr = opt.type || 'str';
        const elementsStr = opt.elements ? `/${opt.elements}` : '';
        const hasSuboptions = opt.suboptions && Object.keys(opt.suboptions).length > 0;
        const subId = `sub-${name}-${depth}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
        <div class="param-item">
            <div class="param-header" ${hasSuboptions ? `onclick="toggleSub('${subId}')"` : ''}>
                <span class="param-toggle">${hasSuboptions ? '▶' : ''}</span>
                <span class="param-name">${name}</span>
                <span class="param-type">(${typeStr}${elementsStr})</span>
                ${opt.required ? '<span class="param-required">required</span>' : ''}
            </div>
            ${this._renderChoicesDefaults(opt, depth)}
            <div class="param-desc">
                ${toArray(opt.description).map(d => `<p>${this._formatText(d)}</p>`).join('')}
            </div>
            ${hasSuboptions ? `<div class="suboptions" id="${subId}">${Object.entries(opt.suboptions!).sort((a, b) => a[0].localeCompare(b[0])).map(([n, o]) => this._renderParamItem(n, o, depth + 1)).join('')}</div>` : ''}
        </div>`;
    }

    private _renderChoicesDefaults(opt: PluginOption, depth: number = 0): string {
        let html = '';
        const marginLeft = depth > 0 ? '' : 'margin-left: 22px;';
        
        if (opt.choices && opt.choices.length > 0) {
            html += `<div class="param-choices" style="${marginLeft}">`;
            html += opt.choices.map(c => {
                const isDefault = opt.default === c;
                return `<span class="param-choice${isDefault ? ' default' : ''}">${this._escapeHtml(String(c))}</span>`;
            }).join('');
            html += '</div>';
        } else if (opt.default !== undefined && opt.default !== null) {
            html += `<div class="param-default" style="${marginLeft}">default: <code>${this._escapeHtml(JSON.stringify(opt.default))}</code></div>`;
        }
        
        return html;
    }

    private _renderReturnValues(returnVals: PluginReturn): string {
        const entries = Object.entries(returnVals);
        if (entries.length === 0) {
            return '<p style="color: var(--text-dim);">No return values documented</p>';
        }

        return `<div class="param-tree">
            ${entries.map(([name, val]) => `
            <div class="return-item">
                <div class="return-name">${name}</div>
                <div class="return-meta">${val.type || 'unknown'} — returned: ${val.returned || 'always'}</div>
                <div class="return-desc">${Array.isArray(val.description) ? val.description.join(' ') : (val.description || '')}</div>
                ${val.sample !== undefined ? `<div class="return-sample">${this._escapeHtml(JSON.stringify(val.sample, null, 2))}</div>` : ''}
            </div>
            `).join('')}
        </div>`;
    }

    private _renderExamples(examples: string): string {
        // Parse examples into sections based on the pattern
        const sections = this._parseExamples(examples);
        
        if (sections.length === 0) {
            // Fallback: just show the raw examples with syntax highlighting
            return `<div class="example-section">
                <div class="example-code">
                    <pre>${this._highlightYaml(examples)}</pre>
                </div>
            </div>`;
        }
        
        return sections.map((section, index) => {
            const taskId = `example-${index}`;
            const escapedRaw = this._escapeHtml(section.task).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            
            let html = `<div class="example-section">`;
            
            // Header with title and copy button
            html += `<div class="example-header">
                <span class="example-title">${this._escapeHtml(section.title)}</span>
                <button class="example-copy-btn" id="copy-btn-${taskId}" onclick="copyExample('${taskId}')">
                    Copy
                </button>
            </div>`;
            
            // Before state context (if present)
            if (section.beforeState) {
                html += `<div class="example-context">
                    <div class="example-context-label">Before state:</div>
${this._escapeHtml(section.beforeState)}</div>`;
            }
            
            // The actual task YAML with syntax highlighting
            html += `<div class="example-code" id="task-${taskId}" data-raw="${escapedRaw}">
                <pre>${this._highlightYaml(section.task)}</pre>
            </div>`;
            
            // Task output context (if present)
            if (section.taskOutput) {
                html += `<div class="example-context">
                    <div class="example-context-label">Task Output:</div>
${this._escapeHtml(section.taskOutput)}</div>`;
            }
            
            // After state context (if present)
            if (section.afterState) {
                html += `<div class="example-context">
                    <div class="example-context-label">After state:</div>
${this._escapeHtml(section.afterState)}</div>`;
            }
            
            html += `</div>`;
            return html;
        }).join('');
    }

    private _parseExamples(examples: string): Array<{
        title: string;
        beforeState?: string;
        task: string;
        taskOutput?: string;
        afterState?: string;
    }> {
        const sections: Array<{
            title: string;
            beforeState?: string;
            task: string;
            taskOutput?: string;
            afterState?: string;
        }> = [];
        
        const lines = examples.split('\n');
        let currentSection: {
            title: string;
            beforeState?: string;
            task: string;
            taskOutput?: string;
            afterState?: string;
        } | null = null;
        
        let currentPart: 'start' | 'before' | 'task' | 'output' | 'after' = 'start';
        let buffer: string[] = [];
        let sectionHeader: string | null = null; // For "# Using merged" style headers
        
        const flushBuffer = () => {
            if (!currentSection) {return;}
            const content = buffer.join('\n').trim();
            if (!content) {
                buffer = [];
                return;
            }
            
            switch (currentPart) {
                case 'before':
                    currentSection.beforeState = content;
                    break;
                case 'task':
                    currentSection.task = (currentSection.task ? currentSection.task + '\n\n' : '') + content;
                    break;
                case 'output':
                    currentSection.taskOutput = content;
                    break;
                case 'after':
                    currentSection.afterState = content;
                    break;
            }
            buffer = [];
        };
        
        const saveCurrentSection = () => {
            if (currentSection) {
                flushBuffer();
                if (currentSection.task) {
                    sections.push(currentSection);
                }
            }
            currentSection = null;
            currentPart = 'start';
        };
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Check for section header (# Using merged, # Using replaced, etc.)
            if (/^#\s*Using\s+\w+/.test(trimmedLine)) {
                saveCurrentSection();
                sectionHeader = trimmedLine.replace(/^#\s*/, '');
                continue;
            }
            
            // Check for state markers
            if (/^#\s*Before\s+state:?\s*$/i.test(trimmedLine)) {
                flushBuffer();
                currentPart = 'before';
                continue;
            }
            
            if (/^#\s*Task\s+[Oo]utput:?\s*$/i.test(trimmedLine)) {
                flushBuffer();
                currentPart = 'output';
                continue;
            }
            
            if (/^#\s*After\s+state:?\s*$/i.test(trimmedLine)) {
                flushBuffer();
                currentPart = 'after';
                continue;
            }
            
            // Check if this is a new task (starts with "- name:")
            if (trimmedLine.startsWith('- name:')) {
                // Save previous section if we have one
                saveCurrentSection();
                
                // Extract task name for title and capitalize it
                const rawTaskName = trimmedLine.replace(/^-\s*name:\s*/, '').replace(/^["']|["']$/g, '');
                const taskName = this._capitalizeTitle(rawTaskName);
                
                // Start new section
                currentSection = {
                    title: sectionHeader ? `${sectionHeader}: ${taskName}` : taskName,
                    task: ''
                };
                sectionHeader = null; // Clear header after use
                currentPart = 'task';
                buffer = [line];
                continue;
            }
            
            // If we're in a task and hit a comment line after yaml content, check if it's output/after
            if (currentPart === 'task' && trimmedLine.startsWith('#') && buffer.length > 0) {
                // Check if the previous lines look like YAML (not all comments)
                const hasYaml = buffer.some(l => !l.trim().startsWith('#') && l.trim().length > 0);
                if (hasYaml) {
                    // Skip divider lines
                    if (/^#\s*-+\s*$/.test(trimmedLine)) {
                        continue;
                    }
                    flushBuffer();
                    currentPart = 'output';
                    buffer = [line];
                    continue;
                }
            }
            
            // Add line to current buffer if we have an active section
            if (currentSection) {
                buffer.push(line);
            }
        }
        
        // Save final section
        saveCurrentSection();
        
        return sections;
    }

    private _capitalizeTitle(text: string): string {
        if (!text) {return text;}
        // Capitalize first letter of each word
        return text
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private _renderSampleTask(pluginFullName: string, options: { [key: string]: PluginOption }): string {
        const yamlNoComments = this._generateSampleYaml(pluginFullName, options, 'none');
        const yamlOptionalComments = this._generateSampleYaml(pluginFullName, options, 'optional');
        const yamlDescComments = this._generateSampleYaml(pluginFullName, options, 'descriptions');
        
        return `
        <div class="sample-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div class="view-toggle">
                <button class="view-toggle-btn" id="btn-no-comments" onclick="switchSampleView('none')">No Comments</button>
                <button class="view-toggle-btn active" id="btn-optional" onclick="switchSampleView('optional')">Minimal</button>
                <button class="view-toggle-btn" id="btn-descriptions" onclick="switchSampleView('descriptions')">Documented</button>
            </div>
            <button class="example-copy-btn" id="copy-btn-sample" onclick="copySampleTask()">
                Copy
            </button>
        </div>
        
        <div class="sample-view active" id="sample-none" data-raw="${this._escapeAttr(yamlNoComments)}">
            <div class="example-code">
                <pre>${this._highlightYaml(yamlNoComments)}</pre>
            </div>
        </div>
        
        <div class="sample-view" id="sample-optional" data-raw="${this._escapeAttr(yamlOptionalComments)}">
            <div class="example-code">
                <pre>${this._highlightYaml(yamlOptionalComments)}</pre>
            </div>
        </div>
        
        <div class="sample-view" id="sample-descriptions" data-raw="${this._escapeAttr(yamlDescComments)}">
            <div class="example-code">
                <pre>${this._highlightYaml(yamlDescComments)}</pre>
            </div>
        </div>`;
    }

    private _escapeAttr(text: string): string {
        return text.replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    private _generateSampleYaml(pluginFullName: string, options: { [key: string]: PluginOption }, commentMode: 'none' | 'optional' | 'descriptions'): string {
        const lines: string[] = [];
        const pluginName = pluginFullName.split('.').pop() || pluginFullName;
        
        lines.push(`- name: ${this._capitalizeTitle(pluginName.replace(/_/g, ' '))} task`);
        lines.push(`  ${pluginFullName}:`);
        
        // Sort: required first, then alphabetical
        const sortedOptions = Object.entries(options).sort((a, b) => {
            const aReq = a[1].required ? 0 : 1;
            const bReq = b[1].required ? 0 : 1;
            if (aReq !== bReq) {return aReq - bReq;}
            return a[0].localeCompare(b[0]);
        });
        
        for (const [name, opt] of sortedOptions) {
            this._addParamToYaml(lines, name, opt, 4, false, commentMode);
        }
        
        return lines.join('\n');
    }

    private _addParamToYaml(lines: string[], name: string, opt: PluginOption, indent: number, isFirstInList: boolean = false, commentMode: 'none' | 'optional' | 'descriptions' = 'optional'): void {
        const spaces = ' '.repeat(indent);
        
        // Build the comment suffix based on mode
        let comment = '';
        if (commentMode === 'descriptions') {
            const desc = toArray(opt.description)[0] || '';
            // Truncate long descriptions and clean up
            const cleanDesc = desc.replace(/\s+/g, ' ').trim();
            const truncatedDesc = cleanDesc.length > 60 ? cleanDesc.substring(0, 57) + '...' : cleanDesc;
            const typeStr = opt.type || 'str';
            const reqMarker = opt.required ? 'required' : 'optional';
            comment = `  # (${typeStr}, ${reqMarker}) ${truncatedDesc}`;
        } else if (commentMode === 'optional') {
            comment = opt.required ? '' : '  # optional';
        }
        // commentMode === 'none' leaves comment as ''
        
        // If this is the first item in a list, we need to prefix with "- "
        const prefix = isFirstInList ? '- ' : '';
        const prefixSpaces = isFirstInList ? ' '.repeat(indent - 2) : spaces;
        
        // Generate example value based on type and available info
        const value = this._getExampleValue(name, opt);
        
        if (opt.suboptions && Object.keys(opt.suboptions).length > 0) {
            // Sort suboptions: required first
            const sortedSubopts = Object.entries(opt.suboptions).sort((a, b) => {
                const aReq = a[1].required ? 0 : 1;
                const bReq = b[1].required ? 0 : 1;
                if (aReq !== bReq) {return aReq - bReq;}
                return a[0].localeCompare(b[0]);
            });
            
            if (opt.type === 'list') {
                lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);
                
                // First suboption gets the list marker
                let isFirst = true;
                for (const [subName, subOpt] of sortedSubopts) {
                    this._addParamToYaml(lines, subName, subOpt, indent + 4, isFirst, commentMode);
                    isFirst = false;
                }
            } else {
                lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);
                
                for (const [subName, subOpt] of sortedSubopts) {
                    this._addParamToYaml(lines, subName, subOpt, indent + 2, false, commentMode);
                }
            }
        } else if (opt.type === 'list') {
            const elemValue = this._getElementValue(name, opt);
            lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);
            lines.push(`${spaces}  - ${elemValue}`);
        } else {
            lines.push(`${prefixSpaces}${prefix}${name}: ${value}${comment}`);
        }
    }

    private _getExampleValue(name: string, opt: PluginOption): string {
        // If there's a default, use it
        if (opt.default !== undefined && opt.default !== null) {
            return this._formatYamlValue(opt.default);
        }
        
        // If there are choices, use the first one
        if (opt.choices && opt.choices.length > 0) {
            return this._formatYamlValue(opt.choices[0]);
        }
        
        // Generate based on type
        switch (opt.type) {
            case 'bool':
            case 'boolean':
                return 'true';
            case 'int':
            case 'integer':
                return '0';
            case 'float':
                return '0.0';
            case 'path':
                return '"/path/to/file"';
            case 'raw':
            case 'jsonarg':
                return '{}';
            case 'dict':
                return '{}';
            case 'list':
                return '[]';
            case 'str':
            case 'string':
            default:
                // Generate contextual example based on parameter name
                return this._getContextualExample(name);
        }
    }

    private _getElementValue(name: string, opt: PluginOption): string {
        if (opt.elements) {
            switch (opt.elements) {
                case 'dict':
                    return '{}';
                case 'int':
                case 'integer':
                    return '1';
                case 'bool':
                case 'boolean':
                    return 'true';
                case 'str':
                case 'string':
                default:
                    return `"${name}_item"`;
            }
        }
        return `"${name}_item"`;
    }

    private _getContextualExample(name: string): string {
        // Provide contextual examples based on common parameter names
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes('name')) {return '"example_name"';}
        if (lowerName.includes('path') || lowerName.includes('dest') || lowerName.includes('src')) {
            return '"/path/to/file"';
        }
        if (lowerName.includes('host')) {return '"hostname.example.com"';}
        if (lowerName.includes('port')) {return '22';}
        if (lowerName.includes('user')) {return '"admin"';}
        if (lowerName.includes('pass') || lowerName.includes('secret')) {return '"{{ vault_password }}"';}
        if (lowerName.includes('url')) {return '"https://example.com"';}
        if (lowerName.includes('state')) {return '"present"';}
        if (lowerName.includes('mode')) {return '"0644"';}
        if (lowerName.includes('owner')) {return '"root"';}
        if (lowerName.includes('group')) {return '"root"';}
        if (lowerName.includes('text') || lowerName.includes('content') || lowerName.includes('data')) {
            return '"example content"';
        }
        if (lowerName.includes('command') || lowerName.includes('cmd')) {return '"echo hello"';}
        if (lowerName.includes('timeout')) {return '30';}
        if (lowerName.includes('delay')) {return '5';}
        if (lowerName.includes('retries') || lowerName.includes('retry')) {return '3';}
        if (lowerName.includes('regexp') || lowerName.includes('regex') || lowerName.includes('pattern')) {
            return '"^.*$"';
        }
        if (lowerName.includes('line')) {return '"example line"';}
        if (lowerName.includes('key')) {return '"key_name"';}
        if (lowerName.includes('value')) {return '"value"';}
        if (lowerName.includes('version')) {return '"1.0.0"';}
        if (lowerName.includes('interface')) {return '"eth0"';}
        if (lowerName.includes('vlan')) {return '100';}
        if (lowerName.includes('ip') || lowerName.includes('address')) {return '"192.168.1.1"';}
        if (lowerName.includes('network') || lowerName.includes('subnet')) {return '"192.168.1.0/24"';}
        
        return `"${name}_value"`;
    }

    private _formatYamlValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'string') {
            // Check if it needs quoting
            if (value === '' || 
                value.includes(':') || 
                value.includes('#') ||
                value.includes("'") ||
                value.includes('"') ||
                value.includes('\n') ||
                value.startsWith(' ') ||
                value.endsWith(' ') ||
                /^[{[\]|>*&!%@`]/.test(value)) {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            // Quote strings that look like booleans or numbers
            if (/^(true|false|yes|no|on|off|null|~|\d+\.?\d*)$/i.test(value)) {
                return `"${value}"`;
            }
            return value;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {return '[]';}
            return JSON.stringify(value);
        }
        if (typeof value === 'object') {
            if (Object.keys(value).length === 0) {return '{}';}
            return JSON.stringify(value);
        }
        return String(value);
    }

    private _highlightYaml(yaml: string): string {
        const lines = yaml.split('\n');
        return lines.map(line => {
            // Full line comments
            if (line.trim().startsWith('#')) {
                return `<span class="yaml-comment">${this._escapeHtml(line)}</span>`;
            }
            
            // Empty lines
            if (line.trim() === '') {
                return '';
            }
            
            // Check if line has an inline comment
            const commentMatch = line.match(/^(.+?)( {2}# .*)$/);
            let codePart = line;
            let commentPart = '';
            
            if (commentMatch) {
                codePart = commentMatch[1];
                commentPart = commentMatch[2];
            }
            
            let result = this._escapeHtml(codePart);
            
            // List markers with inline key (e.g., "- neighbor_address: value")
            result = result.replace(/^(\s*)(-\s)([a-zA-Z_][a-zA-Z0-9_]*)(:)/, 
                '$1<span class="yaml-list-marker">$2</span><span class="yaml-key">$3</span>$4');
            
            // List markers with string value (e.g., '- "peers_item"')
            result = result.replace(/^(\s*)(-\s)(&quot;[^&]*&quot;|&#039;[^&]*&#039;)(\s*)$/, 
                '$1<span class="yaml-list-marker">$2</span><span class="yaml-string">$3</span>$4');
            
            // List markers with simple value (e.g., '- true', '- 123')
            result = result.replace(/^(\s*)(-\s)([^\s].*)$/, (match, spaces, marker, value) => {
                // Skip if already processed (contains span)
                if (value.includes('<span')) {
                    return match;
                }
                const trimmedValue = value.trim();
                let valueClass = 'yaml-string';
                if (/^(true|false|yes|no|on|off)$/i.test(trimmedValue)) {
                    valueClass = 'yaml-bool';
                } else if (/^(null|~)$/i.test(trimmedValue)) {
                    valueClass = 'yaml-null';
                } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                    valueClass = 'yaml-number';
                }
                return `${spaces}<span class="yaml-list-marker">${marker}</span><span class="${valueClass}">${value}</span>`;
            });
            
            // Regular list markers (no inline value)
            result = result.replace(/^(\s*)(-\s)$/, '$1<span class="yaml-list-marker">$2</span>');
            
            // Key-value pairs (not starting with list marker)
            result = result.replace(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(:)(\s|$)/, 
                '$1<span class="yaml-key">$2</span>$3$4');
            
            // After colon values
            result = result.replace(/:(\s+)(".*?"|'.*?')(\s*)$/, 
                ':$1<span class="yaml-string">$2</span>$3');
            
            // Unquoted strings after colon (simple cases)
            result = result.replace(/:(\s+)(\S.*)$/, (match, space, value) => {
                const trimmedValue = value.trim();
                // Check for booleans
                if (/^(true|false|yes|no|on|off)$/i.test(trimmedValue)) {
                    return `:${space}<span class="yaml-bool">${value}</span>`;
                }
                // Check for null
                if (/^(null|~)$/i.test(trimmedValue)) {
                    return `:${space}<span class="yaml-null">${value}</span>`;
                }
                // Check for numbers
                if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                    return `:${space}<span class="yaml-number">${value}</span>`;
                }
                // String values
                return `:${space}<span class="yaml-string">${value}</span>`;
            });
            
            // Add highlighted comment if present
            if (commentPart) {
                result += this._highlightComment(commentPart);
            }
            
            return result;
        }).join('\n');
    }

    private _highlightComment(comment: string): string {
        // Check for structured comment: # (type, required/optional) description
        const structuredMatch = comment.match(/^( {2}# \()([^,]+)(, )(required|optional)(\) )(.*)$/);
        if (structuredMatch) {
            const [, prefix, type, comma, reqOpt, closeParen, desc] = structuredMatch;
            const reqClass = reqOpt === 'required' ? 'yaml-comment-required' : 'yaml-comment-optional';
            return `<span class="yaml-comment-dim">${this._escapeHtml(prefix)}</span>` +
                   `<span class="yaml-comment-type">${this._escapeHtml(type)}</span>` +
                   `<span class="yaml-comment-dim">${this._escapeHtml(comma)}</span>` +
                   `<span class="${reqClass}">${this._escapeHtml(reqOpt)}</span>` +
                   `<span class="yaml-comment-dim">${this._escapeHtml(closeParen)}${this._escapeHtml(desc)}</span>`;
        }
        
        // Simple comment (# optional)
        return `<span class="yaml-comment-dim">${this._escapeHtml(comment)}</span>`;
    }

    private _formatText(text: string): string {
        // Convert Ansible doc formatting to HTML
        let html = this._escapeHtml(text);
        
        // I(text) -> italic
        html = html.replace(/I\(([^)]+)\)/g, '<em>$1</em>');
        // C(text) -> code
        html = html.replace(/C\(([^)]+)\)/g, '<code>$1</code>');
        // B(text) -> bold
        html = html.replace(/B\(([^)]+)\)/g, '<strong>$1</strong>');
        // U(url) -> link
        html = html.replace(/U\(([^)]+)\)/g, '<a href="$1" target="_blank">$1</a>');
        // :ref:`text <reference>` -> text
        html = html.replace(/:ref:`([^<]+)\s*<[^>]+>`/g, '$1');
        // `text` -> code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        return html;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    public dispose() {
        PluginDocPanel._panels.delete(this._pluginKey);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
