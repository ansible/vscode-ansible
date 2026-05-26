import * as vscode from 'vscode';
import { PlaybooksService, PlaybookInfo, PlaybookConfig } from '../services/PlaybooksService';
import { TerminalService } from '../services/TerminalService';
import { log } from '../extension';

export class PlaybookConfigPanel {
    public static currentPanel: PlaybookConfigPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _playbook: PlaybookInfo;
    private readonly _isGlobal: boolean;
    private _disposables: vscode.Disposable[] = [];

    public static show(
        extensionUri: vscode.Uri,
        playbook?: PlaybookInfo,
    ): void {
        const isGlobal = !playbook;
        const title = isGlobal ? 'Playbook Defaults' : `Config: ${playbook!.name}`;

        // Close existing panel
        if (PlaybookConfigPanel.currentPanel) {
            PlaybookConfigPanel.currentPanel._panel.dispose();
        }

        const panel = vscode.window.createWebviewPanel(
            'playbookConfig',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true,
            },
        );

        PlaybookConfigPanel.currentPanel = new PlaybookConfigPanel(
            panel,
            extensionUri,
            playbook,
            isGlobal,
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        playbook: PlaybookInfo | undefined,
        isGlobal: boolean,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._playbook = playbook || { 
            name: 'Global Defaults', 
            path: '', 
            relativePath: '', 
            workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file('/'),
            plays: [] 
        };
        this._isGlobal = isGlobal;

        this._panel.webview.html = this._getHtml();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                const service = PlaybooksService.getInstance();
                
                switch (message.command) {
                    case 'save':
                        if (this._isGlobal) {
                            service.saveGlobalConfig(message.config);
                            vscode.window.showInformationMessage('Global playbook defaults saved.');
                        } else {
                            service.savePlaybookConfig(this._playbook.relativePath, message.config);
                            vscode.window.showInformationMessage(`Configuration saved for ${this._playbook.name}.`);
                        }
                        break;
                    case 'run':
                        if (!this._isGlobal) {
                            await this._runPlaybook(message.config);
                        }
                        break;
                    case 'resetToDefaults':
                        // Reload with global defaults
                        this._panel.webview.html = this._getHtml();
                        break;
                    case 'updateSettings': {
                        const vsConfig = vscode.workspace.getConfiguration('ansibleEnvironments');
                        if (message.zoom !== undefined) {
                            await vsConfig.update('pluginDocZoom', message.zoom, vscode.ConfigurationTarget.Workspace);
                        }
                        if (message.theme !== undefined) {
                            await vsConfig.update('pluginDocTheme', message.theme, vscode.ConfigurationTarget.Workspace);
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

    private async _runPlaybook(config: PlaybookConfig): Promise<void> {
        try {
            const service = PlaybooksService.getInstance();
            const command = service.buildCommand(this._playbook.relativePath, config);

            log(`PlaybookConfigPanel: Running: ${command}`);

            // Use TerminalService for proper venv handling
            const terminalService = TerminalService.getInstance();
            const managed = await terminalService.createActivatedTerminal({
                name: `ansible-playbook: ${this._playbook.name}`,
                show: true,
            });
            managed.sendCommand(command, { waitForCompletion: false });
            this._panel.dispose();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run playbook: ${error}`);
        }
    }

    private _getHtml(): string {
        const service = PlaybooksService.getInstance();
        const config = this._isGlobal 
            ? service.getGlobalConfig() 
            : service.getPlaybookConfig(this._playbook.relativePath);
        
        const configJson = JSON.stringify(config);

        // Get view settings
        const vsConfig = vscode.workspace.getConfiguration('ansibleEnvironments');
        const zoom = vsConfig.get<number>('pluginDocZoom', 100);
        const themeSetting = vsConfig.get<string>('pluginDocTheme', 'auto');
        
        const vscodeThemeKind = vscode.window.activeColorTheme.kind;
        const isVsCodeLight = vscodeThemeKind === vscode.ColorThemeKind.Light || 
                              vscodeThemeKind === vscode.ColorThemeKind.HighContrastLight;
        const resolvedTheme = themeSetting === 'auto' ? (isVsCodeLight ? 'light' : 'dark') : themeSetting;

        return `<!DOCTYPE html>
<html lang="en" data-theme="${resolvedTheme}" data-theme-setting="${themeSetting}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Playbook Configuration</title>
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
            --success: #28a745;
        }
        
        [data-theme="light"] {
            --bg: #ffffff;
            --fg: #1b1f24;
            --border: #d0d7de;
            --input-bg: #f6f8fa;
            --section-bg: #f6f8fa;
            --desc-fg: #656d76;
            --toolbar-bg: rgba(255, 255, 255, 0.95);
        }
        
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
            max-width: 700px;
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
            color: var(--fg);
        }
        
        .header .subtitle {
            font-family: monospace;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            font-size: 12px;
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
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }
        
        .form-group {
            margin-bottom: 16px;
        }
        
        .form-group:last-child {
            margin-bottom: 0;
        }
        
        .form-group.full-width {
            grid-column: 1 / -1;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 13px;
            color: var(--fg);
        }
        
        .form-group .help-text {
            font-size: 11px;
            color: var(--desc-fg, var(--vscode-descriptionForeground));
            margin-top: 4px;
        }
        
        vscode-textfield, vscode-dropdown, vscode-text-area, select {
            width: 100%;
        }
        
        select {
            background: var(--vscode-input-background);
            color: var(--fg);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 6px 8px;
            font-family: inherit;
            font-size: inherit;
        }
        
        select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        vscode-checkbox {
            color: var(--desc-fg, var(--vscode-descriptionForeground));
        }
        
        .checkbox-row {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
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
        
        .button-row {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid var(--border);
        }
        
        .button-row-left {
            margin-right: auto;
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
            <h1>${this._isGlobal ? 'Playbook Default Configuration' : this._playbook.name}</h1>
            <div class="subtitle">${this._isGlobal ? 'These settings apply to all playbooks unless overridden' : this._playbook.relativePath}</div>
        </div>
        
        <div class="section">
            <div class="section-title">Inventory & Targeting</div>
            <div class="form-group">
                <label>Inventory (-i)</label>
                <vscode-textfield id="inventory" placeholder="Path to inventory file or comma-separated hosts"></vscode-textfield>
                <div class="help-text">Specify inventory host path or comma separated host list</div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Limit (-l)</label>
                    <vscode-textfield id="limit" placeholder="host pattern"></vscode-textfield>
                    <div class="help-text">Further limit selected hosts</div>
                </div>
                <div class="form-group">
                    <label>Forks (-f)</label>
                    <vscode-textfield id="forks" type="number" placeholder="5"></vscode-textfield>
                    <div class="help-text">Number of parallel processes</div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tags (-t)</label>
                    <vscode-textfield id="tags" placeholder="tag1,tag2"></vscode-textfield>
                    <div class="help-text">Only run tasks with these tags</div>
                </div>
                <div class="form-group">
                    <label>Skip Tags</label>
                    <vscode-textfield id="skipTags" placeholder="tag1,tag2"></vscode-textfield>
                    <div class="help-text">Skip tasks with these tags</div>
                </div>
            </div>
            <div class="form-group">
                <label>Extra Variables (-e)</label>
                <vscode-textfield id="extraVars" placeholder="key=value or @file.yml"></vscode-textfield>
                <div class="help-text">Variables as key=value, JSON, or @filename</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Connection</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Connection Type (-c)</label>
                    <select id="connection">
                        <option value="ssh">ssh</option>
                        <option value="local">local</option>
                        <option value="docker">docker</option>
                        <option value="paramiko_ssh">paramiko_ssh</option>
                        <option value="winrm">winrm</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Remote User (-u)</label>
                    <vscode-textfield id="user" placeholder="username"></vscode-textfield>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Timeout (-T)</label>
                    <vscode-textfield id="timeout" type="number" placeholder="seconds"></vscode-textfield>
                </div>
                <div class="form-group">
                    <label>Private Key</label>
                    <vscode-textfield id="privateKey" placeholder="path to key file"></vscode-textfield>
                </div>
            </div>
            <div class="form-group">
                <vscode-checkbox id="askPass">Prompt for connection password (-k)</vscode-checkbox>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Privilege Escalation</div>
            <div class="form-group">
                <vscode-checkbox id="become">Enable become (-b)</vscode-checkbox>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Become Method</label>
                    <select id="becomeMethod">
                        <option value="sudo">sudo</option>
                        <option value="su">su</option>
                        <option value="pbrun">pbrun</option>
                        <option value="pfexec">pfexec</option>
                        <option value="doas">doas</option>
                        <option value="dzdo">dzdo</option>
                        <option value="ksu">ksu</option>
                        <option value="runas">runas</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Become User</label>
                    <vscode-textfield id="becomeUser" placeholder="root"></vscode-textfield>
                </div>
            </div>
            <div class="form-group">
                <vscode-checkbox id="askBecomePass">Prompt for become password (-K)</vscode-checkbox>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Vault</div>
            <div class="form-group">
                <label>Vault Password File</label>
                <vscode-textfield id="vaultPasswordFile" placeholder="path to vault password file"></vscode-textfield>
            </div>
            <div class="form-group">
                <vscode-checkbox id="askVaultPass">Prompt for vault password (-J)</vscode-checkbox>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Execution Options</div>
            <div class="checkbox-row">
                <vscode-checkbox id="check">Check mode (--check)</vscode-checkbox>
                <vscode-checkbox id="diff">Show diff (--diff)</vscode-checkbox>
                <vscode-checkbox id="step">Step through tasks (--step)</vscode-checkbox>
            </div>
            <div class="form-row" style="margin-top: 16px;">
                <div class="form-group">
                    <label>Verbosity</label>
                    <select id="verbose">
                        <option value="0">Normal</option>
                        <option value="1">-v</option>
                        <option value="2">-vv</option>
                        <option value="3">-vvv</option>
                        <option value="4">-vvvv</option>
                        <option value="5">-vvvvv</option>
                        <option value="6">-vvvvvv</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Start at Task</label>
                    <vscode-textfield id="startAtTask" placeholder="task name"></vscode-textfield>
                </div>
            </div>
        </div>
        
        <div class="preview-section">
            <div class="preview-label">Command Preview</div>
            <div class="preview" id="preview">ansible-playbook ${this._isGlobal ? '[playbook]' : this._playbook.relativePath}</div>
        </div>
        
        <div class="button-row">
            ${!this._isGlobal ? '<vscode-button id="resetBtn" appearance="secondary" class="button-row-left">Reset to Defaults</vscode-button>' : ''}
            <vscode-button id="saveBtn" appearance="secondary">Save</vscode-button>
            ${!this._isGlobal ? '<vscode-button id="runBtn">Run Playbook</vscode-button>' : ''}
        </div>
    </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const initialConfig = ${configJson};
        const isGlobal = ${this._isGlobal};
        const playbookPath = ${JSON.stringify(this._isGlobal ? '[playbook]' : this._playbook.relativePath)};
        
        // Form elements
        const fields = {
            inventory: document.getElementById('inventory'),
            limit: document.getElementById('limit'),
            tags: document.getElementById('tags'),
            skipTags: document.getElementById('skipTags'),
            extraVars: document.getElementById('extraVars'),
            forks: document.getElementById('forks'),
            connection: document.getElementById('connection'),
            user: document.getElementById('user'),
            timeout: document.getElementById('timeout'),
            privateKey: document.getElementById('privateKey'),
            askPass: document.getElementById('askPass'),
            become: document.getElementById('become'),
            becomeMethod: document.getElementById('becomeMethod'),
            becomeUser: document.getElementById('becomeUser'),
            askBecomePass: document.getElementById('askBecomePass'),
            vaultPasswordFile: document.getElementById('vaultPasswordFile'),
            askVaultPass: document.getElementById('askVaultPass'),
            check: document.getElementById('check'),
            diff: document.getElementById('diff'),
            step: document.getElementById('step'),
            verbose: document.getElementById('verbose'),
            startAtTask: document.getElementById('startAtTask'),
        };
        
        // Initialize form with config
        function loadConfig(config) {
            fields.inventory.value = (config.inventory || []).join(',');
            fields.limit.value = config.limit || '';
            fields.tags.value = (config.tags || []).join(',');
            fields.skipTags.value = (config.skipTags || []).join(',');
            fields.extraVars.value = config.extraVars ? (typeof config.extraVars === 'string' ? config.extraVars : Object.entries(config.extraVars).map(([k, v]) => k + '=' + v).join(' ')) : '';
            fields.forks.value = config.forks || '';
            fields.connection.value = config.connection || 'ssh';
            fields.user.value = config.user || '';
            fields.timeout.value = config.timeout || '';
            fields.privateKey.value = config.privateKey || '';
            fields.askPass.checked = config.askPass || false;
            fields.become.checked = config.become || false;
            fields.becomeMethod.value = config.becomeMethod || 'sudo';
            fields.becomeUser.value = config.becomeUser || '';
            fields.askBecomePass.checked = config.askBecomePass || false;
            fields.vaultPasswordFile.value = config.vaultPasswordFile || '';
            fields.askVaultPass.checked = config.askVaultPass || false;
            fields.check.checked = config.check || false;
            fields.diff.checked = config.diff || false;
            fields.step.checked = config.step || false;
            fields.verbose.value = String(config.verbose || 0);
            fields.startAtTask.value = config.startAtTask || '';
        }
        
        // Get current config from form
        function getConfig() {
            return {
                inventory: fields.inventory.value ? fields.inventory.value.split(',').map(s => s.trim()).filter(s => s) : [],
                limit: fields.limit.value || '',
                tags: fields.tags.value ? fields.tags.value.split(',').map(s => s.trim()).filter(s => s) : [],
                skipTags: fields.skipTags.value ? fields.skipTags.value.split(',').map(s => s.trim()).filter(s => s) : [],
                extraVars: fields.extraVars.value || '',
                forks: fields.forks.value ? parseInt(fields.forks.value) : 5,
                connection: fields.connection.value || 'ssh',
                user: fields.user.value || '',
                timeout: fields.timeout.value ? parseInt(fields.timeout.value) : undefined,
                privateKey: fields.privateKey.value || '',
                askPass: fields.askPass.checked,
                become: fields.become.checked,
                becomeMethod: fields.becomeMethod.value || 'sudo',
                becomeUser: fields.becomeUser.value || '',
                askBecomePass: fields.askBecomePass.checked,
                vaultPasswordFile: fields.vaultPasswordFile.value || '',
                askVaultPass: fields.askVaultPass.checked,
                check: fields.check.checked,
                diff: fields.diff.checked,
                step: fields.step.checked,
                verbose: parseInt(fields.verbose.value) || 0,
                startAtTask: fields.startAtTask.value || '',
            };
        }
        
        // Build command preview
        function updatePreview() {
            const config = getConfig();
            const args = ['ansible-playbook'];
            
            if (config.inventory.length > 0) {
                for (const inv of config.inventory) {
                    args.push('-i', inv);
                }
            }
            if (config.limit) args.push('-l', config.limit);
            for (const tag of config.tags) {
                args.push('-t', tag);
            }
            for (const tag of config.skipTags) {
                args.push('--skip-tags', tag);
            }
            if (config.extraVars) {
                args.push('-e', config.extraVars);
            }
            if (config.check) args.push('--check');
            if (config.diff) args.push('--diff');
            if (config.verbose > 0) args.push('-' + 'v'.repeat(config.verbose));
            if (config.forks && config.forks !== 5) args.push('-f', String(config.forks));
            if (config.connection && config.connection !== 'ssh') args.push('-c', config.connection);
            if (config.user) args.push('-u', config.user);
            if (config.timeout) args.push('-T', String(config.timeout));
            if (config.privateKey) args.push('--private-key', config.privateKey);
            if (config.become) args.push('--become');
            if (config.becomeMethod && config.becomeMethod !== 'sudo') args.push('--become-method', config.becomeMethod);
            if (config.becomeUser && config.becomeUser !== 'root') args.push('--become-user', config.becomeUser);
            if (config.vaultPasswordFile) args.push('--vault-password-file', config.vaultPasswordFile);
            if (config.startAtTask) args.push('--start-at-task', config.startAtTask);
            if (config.step) args.push('--step');
            if (config.askPass) args.push('--ask-pass');
            if (config.askBecomePass) args.push('--ask-become-pass');
            if (config.askVaultPass) args.push('--ask-vault-pass');
            
            args.push(playbookPath);
            
            document.getElementById('preview').textContent = args.join(' ');
        }
        
        // Add change listeners to all fields
        Object.values(fields).forEach(field => {
            if (field) {
                field.addEventListener('input', updatePreview);
                field.addEventListener('change', updatePreview);
            }
        });
        
        // Button handlers
        document.getElementById('saveBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'save', config: getConfig() });
        });
        
        document.getElementById('runBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'run', config: getConfig() });
        });
        
        document.getElementById('resetBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'resetToDefaults' });
        });
        
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
                if (mainContent) mainContent.style.zoom = (currentZoom / 100);
                if (zoomLevel) zoomLevel.textContent = currentZoom + '%';
                if (save) vscode.postMessage({ command: 'updateSettings', zoom: currentZoom });
            }
            
            if (zoomInBtn) {
                zoomInBtn.onclick = function() {
                    if (currentZoom < maxZoom) { currentZoom += zoomStep; updateZoom(true); }
                };
            }
            if (zoomOutBtn) {
                zoomOutBtn.onclick = function() {
                    if (currentZoom > minZoom) { currentZoom -= zoomStep; updateZoom(true); }
                };
            }
        })();
        
        // Theme toggle
        (function() {
            const themeToggleBtn = document.getElementById('theme-toggle-btn');
            const themes = ['auto', 'light', 'dark'];
            let currentThemeSetting = document.documentElement.getAttribute('data-theme-setting') || 'auto';
            
            if (themeToggleBtn) {
                themeToggleBtn.onclick = function() {
                    const currentIndex = themes.indexOf(currentThemeSetting);
                    currentThemeSetting = themes[(currentIndex + 1) % themes.length];
                    const displayTheme = currentThemeSetting === 'auto' ? 'dark' : currentThemeSetting;
                    document.documentElement.setAttribute('data-theme', displayTheme);
                    document.documentElement.setAttribute('data-theme-setting', currentThemeSetting);
                    themeToggleBtn.textContent = currentThemeSetting;
                    vscode.postMessage({ command: 'updateSettings', theme: currentThemeSetting });
                };
            }
        })();
        
        // Initialize
        loadConfig(initialConfig);
        updatePreview();
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        PlaybookConfigPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
