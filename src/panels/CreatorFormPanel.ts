import * as vscode from 'vscode';
import { log } from '../extension';
import { TerminalService } from '../services/TerminalService';

interface SchemaNode {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties: Record<string, ParameterSchema>;
        required: string[];
    };
    subcommands?: Record<string, SchemaNode>;
}

interface ParameterSchema {
    type: string;
    description: string;
    default?: unknown;
    enum?: string[];
    aliases?: string[];
}

export class CreatorFormPanel {
    public static currentPanel: CreatorFormPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _commandPath: string[];
    private readonly _schema: SchemaNode;
    private _disposables: vscode.Disposable[] = [];

    public static show(
        extensionUri: vscode.Uri,
        commandPath: string[],
        schema: SchemaNode,
    ): void {
        const column = vscode.ViewColumn.One;

        // Close existing panel
        if (CreatorFormPanel.currentPanel) {
            CreatorFormPanel.currentPanel._panel.dispose();
        }

        const title = `Create: ${commandPath.join(' → ')}`;
        
        const panel = vscode.window.createWebviewPanel(
            'creatorForm',
            title,
            column,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
            },
        );

        CreatorFormPanel.currentPanel = new CreatorFormPanel(
            panel,
            extensionUri,
            commandPath,
            schema,
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        commandPath: string[],
        schema: SchemaNode,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._commandPath = commandPath;
        this._schema = schema;

        this._panel.webview.html = this._getHtml();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'execute':
                        await this._executeCommand(message.values);
                        break;
                    case 'cancel':
                        this._panel.dispose();
                        break;
                    case 'updateSettings': {
                        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
                        if (message.zoom !== undefined) {
                            await config.update('pluginDocZoom', message.zoom, vscode.ConfigurationTarget.Workspace);
                        }
                        if (message.theme !== undefined) {
                            await config.update('pluginDocTheme', message.theme, vscode.ConfigurationTarget.Workspace);
                        }
                        break;
                    }
                }
            },
            null,
            this._disposables,
        );

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    private async _executeCommand(values: Record<string, unknown>): Promise<void> {
        try {
            // Build the command
            const args = this._buildCommandArgs(values);
            const commandStr = `ansible-creator ${this._commandPath.join(' ')} ${args}`;

            log(`CreatorFormPanel: Executing: ${commandStr}`);

            // Use TerminalService for proper venv handling
            const terminalService = TerminalService.getInstance();
            const managed = await terminalService.createActivatedTerminal({
                name: `ansible-creator ${this._commandPath.join(' ')}`,
                show: true,
            });
            managed.sendCommand(commandStr, { waitForCompletion: false });

            // Close the form panel
            this._panel.dispose();

            vscode.window.showInformationMessage(`Running: ansible-creator ${this._commandPath.join(' ')}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
        }
    }

    private _buildCommandArgs(values: Record<string, unknown>): string {
        const args: string[] = [];
        const properties = this._schema.parameters?.properties || {};
        const required = this._schema.parameters?.required || [];

        for (const [key, value] of Object.entries(values)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }

            const prop = properties[key];
            
            // Check if it's a positional argument (required and no aliases)
            const isPositional = required.includes(key) && (!prop?.aliases || prop.aliases.length === 0);
            
            if (isPositional) {
                // Positional arguments are added directly
                args.push(this._quoteIfNeeded(String(value)));
            } else if (prop?.type === 'boolean') {
                // Boolean flags
                if (value === true && prop.aliases) {
                    // Use the long form alias (usually the second one)
                    const flag = prop.aliases.find(a => a.startsWith('--')) || prop.aliases[0];
                    args.push(flag);
                }
            } else if (prop?.aliases) {
                // Optional arguments with values
                const flag = prop.aliases.find(a => a.startsWith('--')) || prop.aliases[0];
                // Clean up flag (remove <placeholder> parts)
                const cleanFlag = flag.split(' ')[0];
                args.push(`${cleanFlag} ${this._quoteIfNeeded(String(value))}`);
            }
        }

        return args.join(' ');
    }

    private _quoteIfNeeded(value: string): string {
        if (value.includes(' ') || value.includes('"') || value.includes("'")) {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    private _getHtml(): string {
        const schemaJson = JSON.stringify(this._schema);
        const commandPathJson = JSON.stringify(this._commandPath);
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || './';
        
        // Get settings
        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const zoom = config.get<number>('pluginDocZoom', 100);
        const themeSetting = config.get<string>('pluginDocTheme', 'auto');
        
        // Resolve 'auto' to actual theme based on VS Code's current theme
        const vscodeThemeKind = vscode.window.activeColorTheme.kind;
        const isVsCodeLight = vscodeThemeKind === vscode.ColorThemeKind.Light || 
                              vscodeThemeKind === vscode.ColorThemeKind.HighContrastLight;
        const resolvedTheme = themeSetting === 'auto' ? (isVsCodeLight ? 'light' : 'dark') : themeSetting;

        return `<!DOCTYPE html>
<html lang="en" data-theme="${resolvedTheme}" data-theme-setting="${themeSetting}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ansible-creator</title>
    <script src="https://unpkg.com/@vscode-elements/elements@1.6.0/dist/bundled.js" type="module"></script>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --input-bg: var(--vscode-input-background);
            --button-bg: var(--vscode-button-background);
            --button-fg: var(--vscode-button-foreground);
            --error: var(--vscode-errorForeground);
            --toolbar-bg: var(--vscode-editor-background);
            --toolbar-border: var(--vscode-panel-border);
            --success: #28a745;
        }
        
        /* Light theme overrides */
        [data-theme="light"] {
            --bg: #ffffff;
            --fg: #1b1f24;
            --border: #d0d7de;
            --input-bg: #f6f8fa;
            --section-bg: #f6f8fa;
            --desc-fg: #656d76;
            --label-fg: #1b1f24;
            --toolbar-bg: rgba(255, 255, 255, 0.95);
        }
        
        /* Dark theme overrides */
        [data-theme="dark"] {
            --bg: #0d1117;
            --fg: #e6edf3;
            --border: #30363d;
            --input-bg: #161b22;
            --section-bg: rgba(128, 128, 128, 0.08);
            --desc-fg: #8b949e;
            --toolbar-bg: rgba(13, 17, 23, 0.95);
        }
        
        * { box-sizing: border-box; }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg);
            background: var(--bg);
            padding: 0;
            margin: 0;
        }
        
        .toolbar {
            position: fixed;
            top: 12px;
            right: 20px;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--toolbar-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 4px;
            backdrop-filter: blur(8px);
        }
        
        .toolbar-btn {
            background: transparent;
            border: none;
            color: var(--fg);
            opacity: 0.7;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            min-width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .toolbar-btn:hover {
            background: var(--input-bg);
            opacity: 1;
        }
        
        .zoom-label {
            font-size: 11px;
            color: var(--fg);
            opacity: 0.7;
            min-width: 40px;
            text-align: center;
        }
        
        .toolbar-divider {
            width: 1px;
            height: 16px;
            background: var(--border);
            margin: 0 4px;
        }
        
        .main-content {
            padding: 20px;
            padding-top: 60px;
            zoom: ${zoom / 100};
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }
        
        .header h1 {
            font-size: 18px;
            margin: 0 0 8px 0;
            font-weight: 600;
        }
        
        .header .command-path {
            font-family: monospace;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            font-size: 12px;
        }
        
        .description {
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            margin-bottom: 24px;
            font-size: 13px;
        }
        
        .section {
            margin-bottom: 24px;
            background: var(--section-bg, rgba(128, 128, 128, 0.08));
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 16px;
        }
        
        .section-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--fg);
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group:last-child {
            margin-bottom: 0;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 13px;
            color: var(--fg);
        }
        
        .form-group .required {
            color: var(--error);
            margin-left: 4px;
        }
        
        .form-group .help-text {
            font-size: 11px;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            margin-top: 6px;
            line-height: 1.4;
        }
        
        .form-group .default-text {
            font-size: 11px;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            font-style: italic;
            margin-top: 4px;
        }
        
        vscode-textfield, vscode-dropdown {
            width: 100%;
        }
        
        vscode-checkbox {
            color: var(--desc-fg, var(--vscode-descriptionForeground));
        }
        
        .button-row {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid var(--border);
        }
        
        .preview-section {
            margin-top: 24px;
        }
        
        .preview-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .preview {
            padding: 12px 16px;
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--border);
            border-radius: 4px;
            font-family: 'SF Mono', Consolas, monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="zoom-out-btn" class="toolbar-btn" title="Zoom out">−</button>
        <span class="zoom-label" id="zoom-level">${zoom}%</span>
        <button id="zoom-in-btn" class="toolbar-btn" title="Zoom in">+</button>
        <div class="toolbar-divider"></div>
        <button id="theme-toggle-btn" class="toolbar-btn" title="Toggle theme">${themeSetting}</button>
    </div>
    <div class="main-content">
    <div class="container">
        <div class="header">
            <h1 id="title">ansible-creator</h1>
            <div class="command-path" id="commandPath"></div>
        </div>
        
        <div class="description" id="description"></div>
        
        <div id="requiredSection" class="section" style="display: none;">
            <div class="section-title">Required Parameters</div>
            <div id="requiredFields"></div>
        </div>
        
        <div id="optionalSection" class="section" style="display: none;">
            <div class="section-title">Optional Parameters</div>
            <div id="optionalFields"></div>
        </div>
        
        <div class="preview-section">
            <div class="preview-label">Command Preview</div>
            <div class="preview" id="preview">ansible-creator</div>
        </div>
        
        <div class="button-row">
            <vscode-button id="cancelBtn" appearance="secondary">Cancel</vscode-button>
            <vscode-button id="executeBtn">Run</vscode-button>
        </div>
    </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        // Zoom functionality
        (function() {
            let currentZoom = ${zoom};
            const minZoom = 50;
            const maxZoom = 200;
            const zoomStep = 10;
            
            const zoomInBtn = document.getElementById('zoom-in-btn');
            const zoomOutBtn = document.getElementById('zoom-out-btn');
            const zoomLevel = document.getElementById('zoom-level');
            const mainContent = document.querySelector('.main-content');
            
            function updateZoom(save) {
                if (mainContent) {
                    mainContent.style.zoom = (currentZoom / 100);
                }
                if (zoomLevel) zoomLevel.textContent = currentZoom + '%';
                if (save) {
                    vscode.postMessage({ command: 'updateSettings', zoom: currentZoom });
                }
            }
            
            if (zoomInBtn) {
                zoomInBtn.onclick = function() {
                    if (currentZoom < maxZoom) {
                        currentZoom += zoomStep;
                        updateZoom(true);
                    }
                };
            }
            
            if (zoomOutBtn) {
                zoomOutBtn.onclick = function() {
                    if (currentZoom > minZoom) {
                        currentZoom -= zoomStep;
                        updateZoom(true);
                    }
                };
            }
        })();
        
        // Theme toggle functionality
        (function() {
            const themeToggleBtn = document.getElementById('theme-toggle-btn');
            const themes = ['auto', 'light', 'dark'];
            let currentThemeSetting = document.documentElement.getAttribute('data-theme-setting') || 'auto';
            
            function updateThemeButton() {
                if (themeToggleBtn) {
                    themeToggleBtn.textContent = currentThemeSetting;
                }
            }
            
            if (themeToggleBtn) {
                themeToggleBtn.onclick = function() {
                    const currentIndex = themes.indexOf(currentThemeSetting);
                    currentThemeSetting = themes[(currentIndex + 1) % themes.length];
                    
                    // For 'auto', we keep the current resolved theme but update the setting
                    const displayTheme = currentThemeSetting === 'auto' ? 'dark' : currentThemeSetting;
                    document.documentElement.setAttribute('data-theme', displayTheme);
                    document.documentElement.setAttribute('data-theme-setting', currentThemeSetting);
                    
                    updateThemeButton();
                    vscode.postMessage({ command: 'updateSettings', theme: currentThemeSetting });
                };
            }
        })();
        const schema = ${schemaJson};
        const commandPath = ${commandPathJson};
        const workspacePath = ${JSON.stringify(workspacePath)};
        
        // Current form values
        const formValues = {};
        
        function init() {
            // Set header
            document.getElementById('title').textContent = formatLabel(schema.name);
            document.getElementById('commandPath').textContent = 'ansible-creator ' + commandPath.join(' ');
            document.getElementById('description').textContent = schema.description || '';
            
            const properties = schema.parameters?.properties || {};
            const required = schema.parameters?.required || [];
            
            const requiredFields = document.getElementById('requiredFields');
            const optionalFields = document.getElementById('optionalFields');
            
            let requiredCount = 0;
            let optionalCount = 0;
            
            // Sort properties: required first, then alphabetically
            const sortedKeys = Object.keys(properties).sort((a, b) => {
                const aReq = required.includes(a);
                const bReq = required.includes(b);
                if (aReq && !bReq) return -1;
                if (!aReq && bReq) return 1;
                return a.localeCompare(b);
            });
            
            for (const key of sortedKeys) {
                const prop = properties[key];
                const isRequired = required.includes(key);
                
                // Skip common/noise parameters
                if (['no_ansi', 'log_file', 'log_level', 'log_append', 'json', 'verbose'].includes(key)) {
                    continue;
                }
                
                const field = createField(key, prop, isRequired);
                
                if (isRequired) {
                    requiredFields.appendChild(field);
                    requiredCount++;
                } else {
                    optionalFields.appendChild(field);
                    optionalCount++;
                }
                
                // Set default value
                if (prop.default !== undefined && prop.default !== null) {
                    formValues[key] = prop.default;
                }
            }
            
            // Show/hide sections
            if (requiredCount > 0) {
                document.getElementById('requiredSection').style.display = 'block';
            }
            if (optionalCount > 0) {
                document.getElementById('optionalSection').style.display = 'block';
            }
            
            // Set up buttons
            document.getElementById('executeBtn').addEventListener('click', execute);
            document.getElementById('cancelBtn').addEventListener('click', cancel);
            
            updatePreview();
            validateForm();
        }
        
        function validateForm() {
            const required = schema.parameters?.required || [];
            let isValid = true;
            
            for (const key of required) {
                const value = formValues[key];
                if (value === undefined || value === null || value === '') {
                    isValid = false;
                    break;
                }
            }
            
            const executeBtn = document.getElementById('executeBtn');
            if (isValid) {
                executeBtn.removeAttribute('disabled');
            } else {
                executeBtn.setAttribute('disabled', '');
            }
        }
        
        function createField(key, prop, isRequired) {
            const group = document.createElement('div');
            group.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = formatLabel(key);
            if (isRequired) {
                const req = document.createElement('span');
                req.className = 'required';
                req.textContent = '*';
                label.appendChild(req);
            }
            group.appendChild(label);
            
            let input;
            
            if (prop.type === 'boolean') {
                input = document.createElement('vscode-checkbox');
                input.textContent = prop.description;
                if (prop.default === true) {
                    input.setAttribute('checked', '');
                }
                input.addEventListener('change', (e) => {
                    formValues[key] = e.target.checked;
                    updatePreview();
                    validateForm();
                });
            } else if (prop.enum) {
                input = document.createElement('vscode-dropdown');
                
                // Add empty option for optional fields
                if (!isRequired) {
                    const emptyOpt = document.createElement('vscode-option');
                    emptyOpt.textContent = '-- Select --';
                    emptyOpt.value = '';
                    input.appendChild(emptyOpt);
                }
                
                for (const choice of prop.enum) {
                    const opt = document.createElement('vscode-option');
                    opt.textContent = choice;
                    opt.value = choice;
                    if (prop.default === choice) {
                        opt.setAttribute('selected', '');
                    }
                    input.appendChild(opt);
                }
                input.addEventListener('change', (e) => {
                    formValues[key] = e.target.value;
                    updatePreview();
                    validateForm();
                });
            } else {
                input = document.createElement('vscode-textfield');
                input.setAttribute('placeholder', prop.description);
                
                // Set default value
                if (prop.default !== undefined && prop.default !== null) {
                    input.value = String(prop.default);
                }
                
                // Special handling for path fields
                if (key === 'path' || key === 'init_path') {
                    input.value = workspacePath;
                    formValues[key] = workspacePath;
                }
                
                input.addEventListener('input', (e) => {
                    formValues[key] = e.target.value;
                    updatePreview();
                    validateForm();
                });
            }
            
            group.appendChild(input);
            
            // Help text
            if (prop.description && prop.type !== 'boolean') {
                const help = document.createElement('div');
                help.className = 'help-text';
                help.textContent = prop.description;
                group.appendChild(help);
            }
            
            // Default indicator
            if (prop.default !== undefined && prop.default !== null && prop.type !== 'boolean') {
                const defaultText = document.createElement('div');
                defaultText.className = 'default-text';
                defaultText.textContent = 'Default: ' + JSON.stringify(prop.default);
                group.appendChild(defaultText);
            }
            
            return group;
        }
        
        function formatLabel(name) {
            return name
                .split(/[_-]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        
        function updatePreview() {
            const properties = schema.parameters?.properties || {};
            const required = schema.parameters?.required || [];
            const args = [];
            
            for (const [key, value] of Object.entries(formValues)) {
                if (value === undefined || value === null || value === '' || value === false) {
                    continue;
                }
                
                const prop = properties[key];
                const isPositional = required.includes(key) && (!prop?.aliases || prop.aliases.length === 0);
                
                if (isPositional) {
                    args.push(quoteIfNeeded(String(value)));
                } else if (prop?.type === 'boolean' && value === true && prop.aliases) {
                    const flag = prop.aliases.find(a => a.startsWith('--')) || prop.aliases[0];
                    args.push(flag);
                } else if (prop?.aliases && value !== prop.default) {
                    const flag = prop.aliases.find(a => a.startsWith('--')) || prop.aliases[0];
                    const cleanFlag = flag.split(' ')[0];
                    args.push(cleanFlag + ' ' + quoteIfNeeded(String(value)));
                }
            }
            
            const preview = 'ansible-creator ' + commandPath.join(' ') + (args.length ? ' ' + args.join(' ') : '');
            document.getElementById('preview').textContent = preview;
        }
        
        function quoteIfNeeded(value) {
            if (value.includes(' ') || value.includes('"') || value.includes("'")) {
                return '"' + value.replace(/"/g, '\\\\"') + '"';
            }
            return value;
        }
        
        function execute() {
            vscode.postMessage({
                command: 'execute',
                values: formValues
            });
        }
        
        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }
        
        // Initialize
        init();
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        CreatorFormPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
