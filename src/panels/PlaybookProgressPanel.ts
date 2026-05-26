/**
 * Playbook Progress Panel
 * 
 * Real-time playbook execution progress viewer with hierarchical tree
 * and detail panel for task results.
 */

import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { log } from '../extension';
import { getZoomThemeScript } from './webviewStyles';

export interface PlaybookRunOptions {
    playbookPath: string;
    playbookName: string;
    workspaceFolder: vscode.Uri;
    command: string;
    extensionPath: string;
}

interface ProgressEvent {
    type: string;
    timestamp: string;
    data: Record<string, unknown>;
}

export class PlaybookProgressPanel {
    private static _currentPanel: PlaybookProgressPanel | undefined;
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _socketServer: net.Server | undefined;
    private _socketPath: string | undefined;
    private _events: ProgressEvent[] = [];
    private _isRunning: boolean = false;
    private _terminal: vscode.Terminal | undefined;

    public static async show(
        extensionUri: vscode.Uri,
        options: PlaybookRunOptions
    ): Promise<PlaybookProgressPanel> {
        // Reuse existing panel or create new
        if (PlaybookProgressPanel._currentPanel) {
            PlaybookProgressPanel._currentPanel._panel.reveal();
            await PlaybookProgressPanel._currentPanel._startRun(options);
            return PlaybookProgressPanel._currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'playbookProgress',
            `Playbook: ${options.playbookName}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri],
            }
        );

        const progressPanel = new PlaybookProgressPanel(panel, extensionUri);
        PlaybookProgressPanel._currentPanel = progressPanel;
        
        await progressPanel._startRun(options);
        return progressPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'toggleTerminal':
                        if (this._terminal) {
                            // Check if terminal is currently visible
                            const activeTerminal = vscode.window.activeTerminal;
                            if (activeTerminal === this._terminal) {
                                // Terminal is active/visible, hide it
                                this._terminal.hide();
                            } else {
                                // Terminal is hidden or different terminal is active, show ours
                                this._terminal.show();
                            }
                        }
                        break;
                    case 'stop':
                        if (this._terminal && this._isRunning) {
                            // Send Ctrl+C to interrupt the playbook
                            this._terminal.sendText('\x03', false);
                            this._isRunning = false;
                            // Notify webview that we're stopping
                            this._panel.webview.postMessage({ command: 'stopped' });
                        }
                        break;
                    case 'rerun':
                        // TODO: Implement rerun functionality
                        break;
                    case 'aiAnalyze':
                        this._generateAiPrompt(message.data);
                        break;
                    case 'editSource':
                        this._openSource(message.path);
                        break;
                }
            },
            null,
            this._disposables
        );

        this._updateHtml();
    }

    private async _startRun(options: PlaybookRunOptions): Promise<void> {
        this._events = [];
        this._isRunning = true;
        this._panel.title = `Playbook: ${options.playbookName}`;
        
        // Clean up previous socket if any
        if (this._socketServer) {
            this._socketServer.close();
            this._socketServer = undefined;
        }
        if (this._socketPath) {
            try {
                fs.unlinkSync(this._socketPath);
            } catch {
                // Ignore
            }
        }
        
        // Create socket server
        await this._createSocketServer();
        
        // Reset the webview state for new run
        this._panel.webview.postMessage({ command: 'reset' });
        
        const callbackPath = path.join(options.extensionPath, 'resources', 'callback_plugins');

        log(`PlaybookProgress: Starting with socket ${this._socketPath}`);
        log(`PlaybookProgress: Callback plugins path: ${callbackPath}`);

        // Run the playbook command in a hidden terminal
        const { TerminalService } = await import('../services/TerminalService');
        const terminalService = TerminalService.getInstance();
        
        const managed = await terminalService.createActivatedTerminal({
            name: `ansible-playbook: ${options.playbookName}`,
            cwd: options.workspaceFolder,
            show: false, // Hidden by default, user can show via button
        });

        // Store terminal reference for "Show Terminal" button
        this._terminal = managed.terminal;

        // Send command with our environment variables
        managed.terminal.sendText(
            `ANSIBLE_CALLBACK_PLUGINS="${callbackPath}" ` +
            `ANSIBLE_CALLBACKS_ENABLED=vscode_progress ` +
            `ANSIBLE_ENV_SOCKET="${this._socketPath}" ` +
            options.command
        );
    }

    private async _createSocketServer(): Promise<void> {
        // Clean up existing server
        if (this._socketServer) {
            this._socketServer.close();
        }

        // Create unique socket path
        this._socketPath = path.join(os.tmpdir(), `ansible-env-${Date.now()}.sock`);
        
        // Remove socket file if exists
        try {
            if (fs.existsSync(this._socketPath)) {
                fs.unlinkSync(this._socketPath);
            }
        } catch {
            // Ignore
        }

        return new Promise((resolve, reject) => {
            this._socketServer = net.createServer((socket) => {
                let buffer = '';
                
                socket.on('data', (data) => {
                    buffer += data.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const event = JSON.parse(line) as ProgressEvent;
                                this._handleEvent(event);
                            } catch (e) {
                                log(`PlaybookProgress: Failed to parse event: ${e}`);
                            }
                        }
                    }
                });

                socket.on('error', (err) => {
                    log(`PlaybookProgress: Socket error: ${err}`);
                });
            });

            this._socketServer.on('error', (err) => {
                log(`PlaybookProgress: Server error: ${err}`);
                reject(err);
            });

            this._socketServer.listen(this._socketPath, () => {
                log(`PlaybookProgress: Socket server listening on ${this._socketPath}`);
                resolve();
            });
        });
    }

    private _handleEvent(event: ProgressEvent): void {
        this._events.push(event);
        
        // Check for completion
        if (event.type === 'playbook_complete') {
            this._isRunning = false;
        }

        // Send to webview
        this._panel.webview.postMessage({
            command: 'event',
            event: event,
        });
    }

    private _updateHtml(): void {
        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const themeSetting = config.get<string>('pluginDocTheme', 'auto');
        const vscodeThemeKind = vscode.window.activeColorTheme.kind;
        const isVsCodeLight = vscodeThemeKind === vscode.ColorThemeKind.Light || 
                              vscodeThemeKind === vscode.ColorThemeKind.HighContrastLight;
        const resolvedTheme = themeSetting === 'auto' 
            ? (isVsCodeLight ? 'light' : 'dark')
            : themeSetting;

        this._panel.webview.html = this._getHtml(resolvedTheme);
    }

    private _getHtml(theme: string): string {
        const isDark = theme === 'dark';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Playbook Progress</title>
    <style>
        :root {
            --bg: ${isDark ? '#1e1e1e' : '#ffffff'};
            --fg: ${isDark ? '#d4d4d4' : '#1b1f24'};
            --bg-secondary: ${isDark ? '#252526' : '#f5f5f5'};
            --bg-tertiary: ${isDark ? '#2d2d2d' : '#e8e8e8'};
            --border: ${isDark ? '#3c3c3c' : '#d0d0d0'};
            --accent: ${isDark ? '#0078d4' : '#0066b8'};
            --success: ${isDark ? '#4ec9b0' : '#16825d'};
            --warning: ${isDark ? '#dcdcaa' : '#795e26'};
            --error: ${isDark ? '#f14c4c' : '#cd3131'};
            --changed: ${isDark ? '#ce9178' : '#a31515'};
            --skipped: ${isDark ? '#808080' : '#717171'};
            --text-dim: ${isDark ? '#808080' : '#6e7681'};
            
            /* YAML highlighting */
            --yaml-key: ${isDark ? '#9cdcfe' : '#0451a5'};
            --yaml-string: ${isDark ? '#ce9178' : '#a31515'};
            --yaml-number: ${isDark ? '#b5cea8' : '#098658'};
            --yaml-bool: ${isDark ? '#569cd6' : '#0000ff'};
            --yaml-null: ${isDark ? '#569cd6' : '#0000ff'};
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            background: var(--bg);
            color: var(--fg);
            height: 100vh;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            display: flex;
            align-items: center;
            padding: 8px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            gap: 12px;
        }

        .header-title {
            font-weight: 600;
            flex: 1;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }

        .header-btn {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 4px 10px;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .header-btn:hover {
            background: var(--bg-tertiary);
            border-color: var(--text-dim);
        }

        .header-btn.danger {
            border-color: var(--error);
            color: var(--error);
        }

        .header-btn.danger:hover {
            background: var(--error);
            color: white;
        }

        .header-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .header-btn:disabled:hover {
            background: transparent;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--skipped);
        }

        .status-dot.running {
            background: var(--accent);
            animation: pulse 1.5s infinite;
        }

        .status-dot.complete { background: var(--success); }
        .status-dot.changed { background: var(--changed); }
        .status-dot.failed { background: var(--error); }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .main {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        .tree-panel {
            width: 320px;
            min-width: 150px;
            max-width: 70%;
            overflow-y: auto;
            background: var(--bg);
            flex-shrink: 0;
        }

        .resize-handle {
            width: 4px;
            background: var(--border);
            cursor: col-resize;
            flex-shrink: 0;
            transition: background 0.15s;
        }

        .resize-handle:hover,
        .resize-handle.dragging {
            background: var(--accent);
        }

        .detail-panel {
            flex: 1;
            min-width: 200px;
            overflow-y: auto;
            padding: 16px;
            background: var(--bg-secondary);
        }

        /* Tree Styles */
        .tree-node {
            user-select: none;
        }

        .tree-item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            cursor: pointer;
            gap: 6px;
        }

        .tree-item:hover {
            background: var(--bg-tertiary);
        }

        .tree-item.selected {
            background: ${isDark ? '#094771' : '#d6ebff'};
        }

        .tree-item.playbook {
            font-weight: 600;
            padding-left: 4px;
            font-size: 14px;
        }

        .tree-item.play {
            font-weight: 500;
            padding-left: 20px;
        }

        .tree-item.task {
            padding-left: 36px;
        }

        .tree-item.host {
            padding-left: 52px;
            font-size: 12px;
        }

        .tree-item.collapsed + .tree-children {
            display: none;
        }

        .tree-children {
            display: block;
        }

        .expand-icon {
            width: 12px;
            font-size: 10px;
            text-align: center;
            flex-shrink: 0;
            color: var(--text-dim);
        }

        .status-icon {
            width: 14px;
            text-align: center;
            flex-shrink: 0;
        }

        .status-icon.ok { color: var(--success); }
        .status-icon.changed { color: var(--changed); }
        .status-icon.failed { color: var(--error); }
        .status-icon.skipped { color: var(--skipped); }
        .status-icon.unreachable { color: var(--error); }
        .status-icon.running { color: var(--accent); }
        .status-icon.complete { color: var(--success); }

        .tree-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tree-label.ok { color: var(--success); }
        .tree-label.changed { color: var(--changed); }
        .tree-label.failed { color: var(--error); }

        .tree-duration {
            font-size: 11px;
            color: var(--text-dim);
        }

        /* Detail Panel Styles */
        .detail-empty {
            color: var(--text-dim);
            text-align: center;
            padding: 40px;
        }

        .detail-header {
            margin-bottom: 16px;
            position: relative;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border);
        }

        .detail-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .detail-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 24px;
            font-size: 12px;
            color: var(--text-dim);
        }

        .detail-meta-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .detail-ai-btn {
            background: transparent;
            border: 1px solid var(--accent);
            color: var(--accent);
            padding: 4px 10px;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .detail-ai-btn:hover {
            background: var(--accent);
            color: white;
        }

        .result-section {
            margin-top: 16px;
        }

        .result-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-dim);
            margin-bottom: 8px;
        }

        /* Tabs */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--border);
            margin-bottom: 0;
            gap: 0;
        }

        .tab {
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-dim);
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            margin-bottom: -1px;
        }

        .tab:hover {
            color: var(--fg);
            background: var(--bg-tertiary);
        }

        .tab.active {
            color: var(--fg);
            border-bottom-color: var(--accent);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .tab-panel {
            margin-top: 12px;
        }

        /* Loop item selector */
        .item-selector {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            font-size: 12px;
        }

        .item-selector label {
            color: var(--text-dim);
        }

        .item-selector select {
            flex: 1;
            padding: 4px 8px;
            background: var(--bg);
            color: var(--fg);
            border: 1px solid var(--border);
            border-radius: 3px;
            font-size: 12px;
        }

        .result-content {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            line-height: 1.5;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }

        /* Summary table */
        .summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }

        .summary-table th, .summary-table td {
            padding: 6px 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }

        .summary-table th {
            font-weight: 600;
            color: var(--text-dim);
            text-transform: uppercase;
            font-size: 11px;
        }

        .summary-table td.count {
            text-align: right;
            font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
        }

        .summary-table .ok { color: var(--success); }
        .summary-table .changed { color: var(--changed); }
        .summary-table .failed { color: var(--error); }
        .summary-table .skipped { color: var(--skipped); }
        .summary-table .unreachable { color: var(--error); }

        /* YAML Highlighting */
        .yaml-key { color: var(--yaml-key); }
        .yaml-string { color: var(--yaml-string); }
        .yaml-number { color: var(--yaml-number); }
        .yaml-bool { color: var(--yaml-bool); }
        .yaml-null { color: var(--yaml-null); }

        /* Stats Footer */
        .stats-bar {
            padding: 8px 16px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            display: flex;
            gap: 16px;
            font-size: 12px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .stat-count { font-weight: 600; }
        .stat-ok .stat-count { color: var(--success); }
        .stat-changed .stat-count { color: var(--changed); }
        .stat-failed .stat-count { color: var(--error); }
        .stat-skipped .stat-count { color: var(--skipped); }
        
        .view-controls {
            display: flex;
            gap: 4px;
            align-items: center;
            margin-left: 8px;
        }
        
        .view-controls button {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.9em;
        }
        
        .view-controls button:hover {
            background: var(--bg-hover);
        }
        
        body.theme-light {
            --bg: #ffffff;
            --fg: #333333;
            --bg-secondary: #f5f5f5;
            --border: #e0e0e0;
        }
        
        body.theme-dark {
            --bg: #1e1e1e;
            --fg: #cccccc;
            --bg-secondary: #252526;
            --border: #3c3c3c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-title" id="playbook-title">Waiting for playbook...</div>
            <button class="header-btn danger" id="stop-btn" title="Stop playbook execution" disabled>Stop</button>
            <button class="header-btn" id="show-terminal-btn" title="Toggle terminal output">Terminal</button>
            <div class="view-controls">
                <button id="zoomOutBtn" title="Zoom out">−</button>
                <button id="zoomInBtn" title="Zoom in">+</button>
                <button id="themeBtn" title="Toggle theme">◐</button>
            </div>
            <div class="status-indicator">
                <span class="status-dot" id="status-dot"></span>
                <span id="status-text">Idle</span>
            </div>
        </div>
        
        <div class="main" id="main">
            <div class="tree-panel" id="tree-panel">
                <div class="detail-empty" id="tree-empty">
                    Waiting for playbook execution...
                </div>
            </div>
            
            <div class="resize-handle" id="resize-handle"></div>
            
            <div class="detail-panel" id="detail-panel">
                <div class="detail-empty">
                    Select a playbook, play, task, or host to view details
                </div>
            </div>
        </div>
        
        <div class="stats-bar" id="stats-bar" style="display: none;">
            <div class="stat-item stat-ok">
                <span class="stat-count" id="stat-ok">0</span>
                <span>ok</span>
            </div>
            <div class="stat-item stat-changed">
                <span class="stat-count" id="stat-changed">0</span>
                <span>changed</span>
            </div>
            <div class="stat-item stat-failed">
                <span class="stat-count" id="stat-failed">0</span>
                <span>failed</span>
            </div>
            <div class="stat-item stat-skipped">
                <span class="stat-count" id="stat-skipped">0</span>
                <span>skipped</span>
            </div>
            <div class="stat-item">
                <span class="stat-count" id="stat-duration">0.0s</span>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // State
        let playbookInfo = null;
        let plays = [];
        let currentPlayIdx = -1;
        let currentTaskIdx = -1;
        let stats = { ok: 0, changed: 0, failed: 0, skipped: 0 };
        let finalStats = null;
        let duration = 0;
        let expandedNodes = new Set(['playbook']); // Track expanded nodes
        
        // Elements
        const treePanel = document.getElementById('tree-panel');
        const treeEmpty = document.getElementById('tree-empty');
        const detailPanel = document.getElementById('detail-panel');
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const playbookTitle = document.getElementById('playbook-title');
        const statsBar = document.getElementById('stats-bar');
        const showTerminalBtn = document.getElementById('show-terminal-btn');
        const stopBtn = document.getElementById('stop-btn');

        // Toggle Terminal button
        showTerminalBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'toggleTerminal' });
        });

        // Stop button
        stopBtn.addEventListener('click', () => {
            if (!stopBtn.disabled) {
                vscode.postMessage({ command: 'stop' });
                stopBtn.disabled = true;
            }
        });

        // YAML highlighting
        function highlightYaml(obj, indent = 0) {
            if (obj === null || obj === undefined) {
                return '<span class="yaml-null">null</span>';
            }
            if (typeof obj === 'boolean') {
                return '<span class="yaml-bool">' + obj + '</span>';
            }
            if (typeof obj === 'number') {
                return '<span class="yaml-number">' + obj + '</span>';
            }
            if (typeof obj === 'string') {
                if (obj.includes('\\n')) {
                    return '|\\n' + obj.split('\\n').map(l => '  '.repeat(indent + 1) + escapeHtml(l)).join('\\n');
                }
                return '<span class="yaml-string">' + escapeHtml(obj) + '</span>';
            }
            if (Array.isArray(obj)) {
                if (obj.length === 0) return '[]';
                return obj.map((item, i) => {
                    const prefix = i === 0 ? '' : '  '.repeat(indent);
                    return prefix + '- ' + highlightYaml(item, indent + 1);
                }).join('\\n');
            }
            if (typeof obj === 'object') {
                const keys = Object.keys(obj);
                if (keys.length === 0) return '{}';
                return keys.map((key, i) => {
                    const prefix = i === 0 ? '' : '  '.repeat(indent);
                    const value = obj[key];
                    if (typeof value === 'object' && value !== null) {
                        return prefix + '<span class="yaml-key">' + key + '</span>:\\n' + 
                               '  '.repeat(indent + 1) + highlightYaml(value, indent + 1);
                    }
                    return prefix + '<span class="yaml-key">' + key + '</span>: ' + highlightYaml(value, indent);
                }).join('\\n');
            }
            return String(obj);
        }

        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // Reset state for new run
        function resetState() {
            playbookInfo = null;
            plays = [];
            currentPlayIdx = -1;
            currentTaskIdx = -1;
            stats = { ok: 0, changed: 0, failed: 0, skipped: 0 };
            finalStats = null;
            duration = 0;
            expandedNodes = new Set(['playbook']);
            detailPanel.innerHTML = '<div class="detail-empty">Select a playbook, play, task, or host to view details</div>';
        }

        function handleEvent(event) {
            const { type, data } = event;

            switch (type) {
                case 'playbook_start':
                    resetState();
                    playbookInfo = { name: data.playbook || 'Playbook', path: data.path, status: 'running' };
                    playbookTitle.textContent = playbookInfo.name;
                    statusDot.className = 'status-dot running';
                    statusText.textContent = 'Running';
                    statsBar.style.display = 'flex';
                    stopBtn.disabled = false;
                    renderTree();
                    break;

                case 'play_start':
                    currentPlayIdx = plays.length;
                    currentTaskIdx = -1;
                    const playId = 'play-' + currentPlayIdx;
                    expandedNodes.add(playId);
                    plays.push({
                        name: data.name || 'Play',
                        uuid: data.uuid,
                        tasks: [],
                        status: 'running'
                    });
                    renderTree();
                    break;

                case 'task_start':
                    if (currentPlayIdx >= 0) {
                        currentTaskIdx = plays[currentPlayIdx].tasks.length;
                        const taskId = 'task-' + currentPlayIdx + '-' + currentTaskIdx;
                        expandedNodes.add(taskId);
                        plays[currentPlayIdx].tasks.push({
                            name: data.name || 'Task',
                            uuid: data.uuid,
                            action: data.action,
                            args: data.args || {},  // Store task args from task_start
                            path: data.path || null,  // Store file:line path
                            isHandler: data.is_handler,
                            hosts: {},
                            status: 'running'
                        });
                        renderTree();
                        scrollToCurrentTask();
                    }
                    break;

                case 'host_task_start':
                    if (currentPlayIdx >= 0 && currentTaskIdx >= 0) {
                        const task = plays[currentPlayIdx].tasks[currentTaskIdx];
                        task.hosts[data.host] = { status: 'running' };
                        renderTree();
                    }
                    break;

                case 'host_ok':
                case 'host_failed':
                case 'host_skipped':
                case 'host_unreachable':
                    if (currentPlayIdx >= 0 && currentTaskIdx >= 0) {
                        const task = plays[currentPlayIdx].tasks[currentTaskIdx];
                        const status = type.replace('host_', '');
                        const finalStatus = status === 'ok' && data.changed ? 'changed' : status;
                        
                        task.hosts[data.host] = {
                            status: finalStatus,
                            changed: data.changed,
                            duration: data.duration,
                            result: data.result
                        };
                        
                        const taskId = 'task-' + currentPlayIdx + '-' + currentTaskIdx;
                        updateTaskStatus(task, taskId);
                        updatePlayStatus(plays[currentPlayIdx]);
                        updatePlaybookStatus();
                        
                        if (finalStatus === 'ok') stats.ok++;
                        else if (finalStatus === 'changed') stats.changed++;
                        else if (finalStatus === 'failed') stats.failed++;
                        else if (finalStatus === 'skipped') stats.skipped++;
                        
                        updateStats();
                        renderTree();
                    }
                    break;

                case 'playbook_complete':
                    finalStats = data.stats;
                    duration = data.duration;
                    document.getElementById('stat-duration').textContent = duration + 's';
                    
                    plays.forEach((p, pIdx) => {
                        if (p.status === 'running') updatePlayStatus(p);
                        p.tasks.forEach((t, tIdx) => {
                            const taskId = 'task-' + pIdx + '-' + tIdx;
                            if (t.status === 'running') {
                                t.status = 'ok';
                                expandedNodes.delete(taskId);
                            }
                            // Expand failed tasks so user can see what went wrong
                            if (t.status === 'failed') {
                                expandedNodes.add(taskId);
                                // Also expand the parent play
                                expandedNodes.add('play-' + pIdx);
                            }
                        });
                    });
                    
                    updatePlaybookStatus();
                    if (playbookInfo) {
                        playbookInfo.status = stats.failed > 0 ? 'failed' : (stats.changed > 0 ? 'changed' : 'complete');
                    }
                    
                    statusDot.className = 'status-dot ' + (playbookInfo ? playbookInfo.status : 'complete');
                    statusText.textContent = stats.failed > 0 ? 'Failed' : (stats.changed > 0 ? 'Changed' : 'Complete');
                    stopBtn.disabled = true;
                    renderTree();
                    break;
            }
        }

        // Handle stopped message from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'stopped') {
                statusDot.className = 'status-dot failed';
                statusText.textContent = 'Stopped';
                stopBtn.disabled = true;
                if (playbookInfo) {
                    playbookInfo.status = 'failed';
                }
                renderTree();
            } else if (message.command === 'event') {
                handleEvent(message.event);
            } else if (message.command === 'reset') {
                resetState();
                stopBtn.disabled = true;
                treePanel.innerHTML = '<div class="detail-empty" id="tree-empty">Waiting for playbook execution...</div>';
                playbookTitle.textContent = 'Waiting for playbook...';
                statusDot.className = 'status-dot';
                statusText.textContent = 'Idle';
                statsBar.style.display = 'none';
            }
        });

        function updateTaskStatus(task, taskId) {
            const statuses = Object.values(task.hosts).map(h => h.status);
            const wasRunning = task.status === 'running';
            
            if (statuses.includes('failed') || statuses.includes('unreachable')) {
                task.status = 'failed';
            } else if (statuses.includes('changed')) {
                task.status = 'changed';
            } else if (statuses.every(s => s === 'skipped')) {
                task.status = 'skipped';
            } else if (statuses.includes('running')) {
                task.status = 'running';
            } else {
                task.status = 'ok';
            }
            
            // Auto-collapse task when it completes (no longer running)
            if (wasRunning && task.status !== 'running' && taskId) {
                expandedNodes.delete(taskId);
            }
        }

        function updatePlayStatus(play) {
            const statuses = play.tasks.map(t => t.status);
            if (statuses.includes('failed')) {
                play.status = 'failed';
            } else if (statuses.includes('changed')) {
                play.status = 'changed';
            } else if (statuses.includes('running')) {
                play.status = 'running';
            } else if (statuses.every(s => s === 'skipped')) {
                play.status = 'skipped';
            } else {
                play.status = 'ok';
            }
        }

        function updatePlaybookStatus() {
            if (!playbookInfo) return;
            const statuses = plays.map(p => p.status);
            if (statuses.includes('failed')) {
                playbookInfo.status = 'failed';
            } else if (statuses.includes('changed')) {
                playbookInfo.status = 'changed';
            } else if (statuses.includes('running')) {
                playbookInfo.status = 'running';
            } else {
                playbookInfo.status = 'ok';
            }
        }

        function updateStats() {
            document.getElementById('stat-ok').textContent = stats.ok;
            document.getElementById('stat-changed').textContent = stats.changed;
            document.getElementById('stat-failed').textContent = stats.failed;
            document.getElementById('stat-skipped').textContent = stats.skipped;
        }

        function getStatusIcon(status) {
            switch (status) {
                case 'ok': return '✓';
                case 'complete': return '✓';
                case 'changed': return '⟳';
                case 'failed': return '✗';
                case 'skipped': return '−';
                case 'unreachable': return '⊘';
                case 'running': return '◐';
                default: return '○';
            }
        }

        function toggleNode(nodeId, event) {
            event.stopPropagation();
            if (expandedNodes.has(nodeId)) {
                expandedNodes.delete(nodeId);
            } else {
                expandedNodes.add(nodeId);
            }
            renderTree();
        }

        function renderTree() {
            if (!playbookInfo) {
                treePanel.innerHTML = '<div class="detail-empty">Waiting for playbook execution...</div>';
                return;
            }

            let html = '';
            const playbookExpanded = expandedNodes.has('playbook');
            const statusClass = playbookInfo.status || 'running';
            
            // Playbook node
            html += '<div class="tree-node">';
            html += '<div class="tree-item playbook' + (playbookExpanded ? '' : ' collapsed') + '" data-type="playbook" data-node-id="playbook">';
            html += '<span class="expand-icon">' + (playbookExpanded ? '▼' : '▶') + '</span>';
            html += '<span class="status-icon ' + statusClass + '">' + getStatusIcon(statusClass) + '</span>';
            html += '<span class="tree-label ' + statusClass + '">' + escapeHtml(playbookInfo.name) + '</span>';
            if (duration > 0) {
                html += '<span class="tree-duration">' + duration + 's</span>';
            }
            html += '</div>';
            
            if (playbookExpanded) {
                html += '<div class="tree-children">';
                
                plays.forEach((play, playIdx) => {
                    const playId = 'play-' + playIdx;
                    const playExpanded = expandedNodes.has(playId);
                    
                    html += '<div class="tree-node">';
                    html += '<div class="tree-item play' + (playExpanded ? '' : ' collapsed') + '" data-type="play" data-play="' + playIdx + '" data-node-id="' + playId + '">';
                    html += '<span class="expand-icon">' + (play.tasks.length > 0 ? (playExpanded ? '▼' : '▶') : ' ') + '</span>';
                    html += '<span class="status-icon ' + play.status + '">' + getStatusIcon(play.status) + '</span>';
                    html += '<span class="tree-label">' + escapeHtml(play.name) + '</span>';
                    html += '</div>';
                    
                    if (playExpanded && play.tasks.length > 0) {
                        html += '<div class="tree-children">';
                        
                        play.tasks.forEach((task, taskIdx) => {
                            const taskId = 'task-' + playIdx + '-' + taskIdx;
                            const taskExpanded = expandedNodes.has(taskId);
                            const hostCount = Object.keys(task.hosts).length;
                            
                            html += '<div class="tree-node">';
                            html += '<div class="tree-item task' + (taskExpanded ? '' : ' collapsed') + '" data-type="task" data-play="' + playIdx + '" data-task="' + taskIdx + '" data-node-id="' + taskId + '">';
                            html += '<span class="expand-icon">' + (hostCount > 0 ? (taskExpanded ? '▼' : '▶') : ' ') + '</span>';
                            html += '<span class="status-icon ' + task.status + '">' + getStatusIcon(task.status) + '</span>';
                            html += '<span class="tree-label">' + escapeHtml(task.name) + '</span>';
                            html += '</div>';
                            
                            if (taskExpanded && hostCount > 0) {
                                html += '<div class="tree-children">';
                                
                                Object.entries(task.hosts).forEach(([host, hostData]) => {
                                    html += '<div class="tree-item host" data-type="host" data-play="' + playIdx + '" data-task="' + taskIdx + '" data-host="' + host + '">';
                                    html += '<span class="expand-icon"> </span>';
                                    html += '<span class="status-icon ' + hostData.status + '">' + getStatusIcon(hostData.status) + '</span>';
                                    html += '<span class="tree-label">' + escapeHtml(host) + '</span>';
                                    if (hostData.duration) {
                                        html += '<span class="tree-duration">' + hostData.duration + 's</span>';
                                    }
                                    html += '</div>';
                                });
                                
                                html += '</div>';
                            }
                            html += '</div>';
                        });
                        
                        html += '</div>';
                    }
                    html += '</div>';
                });
                
                html += '</div>';
            }
            html += '</div>';
            
            treePanel.innerHTML = html;
            
            // Add click handlers
            treePanel.querySelectorAll('.tree-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const nodeId = item.dataset.nodeId;
                    if (nodeId && item.querySelector('.expand-icon').textContent.trim()) {
                        toggleNode(nodeId, e);
                    }
                    selectNode(item);
                });
            });
        }

        function selectNode(item) {
            treePanel.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            
            const type = item.dataset.type;
            const playIdx = parseInt(item.dataset.play);
            const taskIdx = parseInt(item.dataset.task);
            const host = item.dataset.host;
            
            if (type === 'playbook') {
                showPlaybookSummary();
            } else if (type === 'host' && !isNaN(taskIdx)) {
                const task = plays[playIdx].tasks[taskIdx];
                const hostData = task.hosts[host];
                showHostDetail(task, host, hostData);
            } else if (type === 'task') {
                const task = plays[playIdx].tasks[taskIdx];
                showTaskDetail(task);
            } else if (type === 'play') {
                const play = plays[playIdx];
                showPlayDetail(play);
            }
        }

        function showPlaybookSummary() {
            let html = '<div class="detail-header">';
            html += '<div class="detail-title">' + escapeHtml(playbookInfo.name) + '</div>';
            html += '<div class="detail-meta">';
            html += '<div class="detail-meta-item"><strong>Status:</strong> <span class="status-icon ' + playbookInfo.status + '">' + (playbookInfo.status === 'running' ? 'Running' : playbookInfo.status) + '</span></div>';
            html += '<div class="detail-meta-item"><strong>Plays:</strong> ' + plays.length + '</div>';
            const totalTasks = plays.reduce((sum, p) => sum + p.tasks.length, 0);
            html += '<div class="detail-meta-item"><strong>Tasks:</strong> ' + totalTasks + '</div>';
            if (duration > 0) {
                html += '<div class="detail-meta-item"><strong>Duration:</strong> ' + duration + 's</div>';
            }
            html += '</div></div>';
            
            // Stats summary
            html += '<div class="result-section">';
            html += '<div class="result-label">Execution Summary</div>';
            html += '<table class="summary-table">';
            html += '<tr><th>Metric</th><th style="text-align:right">Count</th></tr>';
            html += '<tr><td class="ok">OK</td><td class="count ok">' + stats.ok + '</td></tr>';
            html += '<tr><td class="changed">Changed</td><td class="count changed">' + stats.changed + '</td></tr>';
            html += '<tr><td class="failed">Failed</td><td class="count failed">' + stats.failed + '</td></tr>';
            html += '<tr><td class="skipped">Skipped</td><td class="count skipped">' + stats.skipped + '</td></tr>';
            html += '</table>';
            html += '</div>';
            
            // Host summary if available
            if (finalStats) {
                html += '<div class="result-section">';
                html += '<div class="result-label">Host Summary</div>';
                html += '<table class="summary-table">';
                html += '<tr><th>Host</th><th>OK</th><th>Changed</th><th>Failed</th><th>Skipped</th></tr>';
                Object.entries(finalStats).forEach(([host, s]) => {
                    html += '<tr>';
                    html += '<td>' + escapeHtml(host) + '</td>';
                    html += '<td class="count ok">' + (s.ok || 0) + '</td>';
                    html += '<td class="count changed">' + (s.changed || 0) + '</td>';
                    html += '<td class="count ' + (s.failures > 0 ? 'failed' : '') + '">' + (s.failures || 0) + '</td>';
                    html += '<td class="count skipped">' + (s.skipped || 0) + '</td>';
                    html += '</tr>';
                });
                html += '</table>';
                html += '</div>';
            }
            
            detailPanel.innerHTML = html;
        }

        // Helper to extract clean result data (without invocation and internal keys)
        function extractResultData(result) {
            const resultData = {};
            const skipKeys = ['invocation', 'results', '_ansible_no_log', '_ansible_verbose_always', '_ansible_verbose_override', 'ansible_loop_var', '_ansible_item_label'];
            Object.keys(result).forEach(key => {
                if (!skipKeys.includes(key) && !key.startsWith('_ansible_')) {
                    resultData[key] = result[key];
                }
            });
            return resultData;
        }

        // Helper to extract clean invocation args
        function extractInvocationArgs(invocation) {
            if (!invocation || !invocation.module_args) return null;
            const args = {};
            Object.entries(invocation.module_args).forEach(([key, value]) => {
                if (value !== null && value !== '' && !key.startsWith('_')) {
                    args[key] = value;
                }
            });
            return Object.keys(args).length > 0 ? args : null;
        }

        function showHostDetail(task, host, hostData) {
            // Store current context for AI prompt generation
            window._currentTask = task;
            window._currentHost = host;
            window._currentHostData = hostData;
            
            let html = '<div class="detail-header">';
            // Buttons container
            html += '<div style="position:absolute;top:0;right:0;display:flex;gap:6px;">';
            if (task.path) {
                html += '<button class="detail-ai-btn" id="edit-source-btn" title="Edit task source" style="border-color:var(--text-dim);color:var(--fg);">Edit</button>';
            }
            html += '<button class="detail-ai-btn" id="ai-analyze-btn" title="Analyze with AI">✦ Analyze</button>';
            html += '</div>';
            html += '<div class="detail-title">' + escapeHtml(task.name) + '</div>';
            html += '<div class="detail-meta">';
            html += '<div class="detail-meta-item"><strong>Host:</strong> ' + escapeHtml(host) + '</div>';
            html += '<div class="detail-meta-item"><strong>Module:</strong> ' + escapeHtml(task.action || 'unknown') + '</div>';
            html += '<div class="detail-meta-item"><strong>Status:</strong> <span class="status-icon ' + hostData.status + '">' + hostData.status + '</span></div>';
            if (hostData.duration) {
                html += '<div class="detail-meta-item"><strong>Duration:</strong> ' + hostData.duration + 's</div>';
            }
            html += '</div></div>';
            
            if (hostData.result) {
                const result = hostData.result;
                const hasLoopResults = Array.isArray(result.results) && result.results.length > 0;
                
                if (hasLoopResults) {
                    // Loop results - show item selector and tabs
                    const loopResults = result.results;
                    
                    // Item selector dropdown
                    html += '<div class="item-selector">';
                    html += '<label>Loop Item:</label>';
                    html += '<select id="loop-item-select">';
                    loopResults.forEach((item, idx) => {
                        const label = item.item || item._ansible_item_label || ('Item ' + (idx + 1));
                        const status = item.failed ? 'failed' : (item.changed ? 'changed' : 'ok');
                        html += '<option value="' + idx + '">' + escapeHtml(String(label)) + ' (' + status + ')</option>';
                    });
                    html += '</select>';
                    html += '</div>';
                    
                    // Tabs
                    html += '<div class="tabs">';
                    html += '<button class="tab active" data-tab="result">Result</button>';
                    html += '<button class="tab" data-tab="invocation">Invocation</button>';
                    html += '</div>';
                    
                    // Tab content containers (will be populated by JS)
                    html += '<div class="tab-panel">';
                    html += '<div id="tab-result" class="tab-content active"></div>';
                    html += '<div id="tab-invocation" class="tab-content"></div>';
                    html += '</div>';
                    
                    // Also show summary if present
                    const summaryData = extractResultData(result);
                    if (Object.keys(summaryData).length > 0) {
                        html += '<div class="result-section" style="margin-top:16px;">';
                        html += '<div class="result-label">Summary</div>';
                        html += '<div class="result-content">' + highlightYaml(summaryData) + '</div>';
                        html += '</div>';
                    }
                    
                    detailPanel.innerHTML = html;
                    
                    // Store loop results and task args for JS access
                    window._loopResults = loopResults;
                    window._taskArgs = task.args || {};
                    
                    // Initialize tabs and item selector
                    initLoopResultsUI();
                } else {
                    // Single result - show tabs
                    const resultData = extractResultData(result);
                    
                    // Use task.args from task_start as invocation (always available)
                    const taskArgs = task.args || {};
                    const hasInvocation = Object.keys(taskArgs).length > 0;
                    
                    // Tabs
                    html += '<div class="tabs">';
                    html += '<button class="tab active" data-tab="result">Result</button>';
                    html += '<button class="tab" data-tab="invocation">Invocation</button>';
                    html += '</div>';
                    
                    // Tab content
                    html += '<div class="tab-panel">';
                    html += '<div id="tab-result" class="tab-content active">';
                    if (Object.keys(resultData).length > 0) {
                        html += '<div class="result-content">' + highlightYaml(resultData) + '</div>';
                    } else {
                        html += '<div class="detail-empty">No result data</div>';
                    }
                    html += '</div>';
                    
                    html += '<div id="tab-invocation" class="tab-content">';
                    if (hasInvocation) {
                        html += '<div class="result-content">' + highlightYaml(taskArgs) + '</div>';
                    } else {
                        html += '<div class="detail-empty">No invocation data</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                    
                    detailPanel.innerHTML = html;
                    initTabsUI();
                }
            } else {
                detailPanel.innerHTML = html;
                initAiButton();
            }
        }

        function initTabsUI() {
            detailPanel.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    detailPanel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    detailPanel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const tabId = 'tab-' + tab.dataset.tab;
                    document.getElementById(tabId).classList.add('active');
                });
            });
            
            // Initialize AI analyze button
            initAiButton();
        }

        function initAiButton() {
            const aiBtn = document.getElementById('ai-analyze-btn');
            if (aiBtn) {
                aiBtn.addEventListener('click', () => {
                    const task = window._currentTask;
                    const host = window._currentHost;
                    const hostData = window._currentHostData;
                    
                    if (task && hostData) {
                        vscode.postMessage({
                            command: 'aiAnalyze',
                            data: {
                                taskName: task.name,
                                module: task.action,
                                host: host,
                                status: hostData.status,
                                args: task.args || {},
                                result: hostData.result || {},
                                path: task.path || null
                            }
                        });
                    }
                });
            }
            
            // Edit source button
            const editBtn = document.getElementById('edit-source-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const task = window._currentTask;
                    if (task && task.path) {
                        vscode.postMessage({
                            command: 'editSource',
                            path: task.path
                        });
                    }
                });
            }
        }

        function initLoopResultsUI() {
            const select = document.getElementById('loop-item-select');
            const resultTab = document.getElementById('tab-result');
            const invocationTab = document.getElementById('tab-invocation');
            
            // Use task.args for invocation (same for all loop items)
            const taskArgs = window._taskArgs || {};
            const hasTaskArgs = Object.keys(taskArgs).length > 0;
            
            // Set invocation once (same for all loop items)
            invocationTab.innerHTML = hasTaskArgs
                ? '<div class="result-content">' + highlightYaml(taskArgs) + '</div>'
                : '<div class="detail-empty">No invocation data</div>';
            
            function updateLoopItem(idx) {
                const item = window._loopResults[idx];
                if (!item) return;
                
                const resultData = extractResultData(item);
                
                resultTab.innerHTML = Object.keys(resultData).length > 0
                    ? '<div class="result-content">' + highlightYaml(resultData) + '</div>'
                    : '<div class="detail-empty">No result data</div>';
            }
            
            select.addEventListener('change', () => updateLoopItem(parseInt(select.value)));
            updateLoopItem(0);
            initTabsUI();
        }

        function showTaskDetail(task) {
            let html = '<div class="detail-header">';
            html += '<div class="detail-title">' + escapeHtml(task.name) + '</div>';
            html += '<div class="detail-meta">';
            html += '<div class="detail-meta-item"><strong>Module:</strong> ' + escapeHtml(task.action || 'unknown') + '</div>';
            html += '<div class="detail-meta-item"><strong>Hosts:</strong> ' + Object.keys(task.hosts).length + '</div>';
            html += '<div class="detail-meta-item"><strong>Status:</strong> <span class="status-icon ' + task.status + '">' + task.status + '</span></div>';
            html += '</div></div>';
            
            const hostSummary = {};
            Object.entries(task.hosts).forEach(([host, data]) => {
                hostSummary[host] = data.status;
            });
            
            html += '<div class="result-section">';
            html += '<div class="result-label">Host Status</div>';
            html += '<div class="result-content">' + highlightYaml(hostSummary) + '</div>';
            html += '</div>';
            
            detailPanel.innerHTML = html;
        }

        function showPlayDetail(play) {
            let html = '<div class="detail-header">';
            html += '<div class="detail-title">' + escapeHtml(play.name) + '</div>';
            html += '<div class="detail-meta">';
            html += '<div class="detail-meta-item"><strong>Tasks:</strong> ' + play.tasks.length + '</div>';
            html += '<div class="detail-meta-item"><strong>Status:</strong> <span class="status-icon ' + play.status + '">' + play.status + '</span></div>';
            html += '</div></div>';
            
            // Task summary
            if (play.tasks.length > 0) {
                const taskStats = { ok: 0, changed: 0, failed: 0, skipped: 0 };
                play.tasks.forEach(t => {
                    if (t.status === 'ok' || t.status === 'complete') taskStats.ok++;
                    else if (t.status === 'changed') taskStats.changed++;
                    else if (t.status === 'failed') taskStats.failed++;
                    else if (t.status === 'skipped') taskStats.skipped++;
                });
                
                html += '<div class="result-section">';
                html += '<div class="result-label">Task Summary</div>';
                html += '<table class="summary-table">';
                html += '<tr><td class="ok">OK</td><td class="count ok">' + taskStats.ok + '</td></tr>';
                html += '<tr><td class="changed">Changed</td><td class="count changed">' + taskStats.changed + '</td></tr>';
                html += '<tr><td class="failed">Failed</td><td class="count failed">' + taskStats.failed + '</td></tr>';
                html += '<tr><td class="skipped">Skipped</td><td class="count skipped">' + taskStats.skipped + '</td></tr>';
                html += '</table>';
                html += '</div>';
            }
            
            detailPanel.innerHTML = html;
        }

        function scrollToCurrentTask() {
            const runningItems = treePanel.querySelectorAll('.tree-item.task .status-icon.running');
            if (runningItems.length > 0) {
                const item = runningItems[runningItems.length - 1].closest('.tree-item');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        // Resize handle functionality
        (function initResize() {
            const resizeHandle = document.getElementById('resize-handle');
            const main = document.getElementById('main');
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;

            resizeHandle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = treePanel.offsetWidth;
                resizeHandle.classList.add('dragging');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(150, Math.min(startWidth + deltaX, main.offsetWidth * 0.7));
                treePanel.style.width = newWidth + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    resizeHandle.classList.remove('dragging');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        })();
        
        // Zoom/Theme controls
        ${getZoomThemeScript('playbookProgress')}
    </script>
</body>
</html>`;
    }

    private async _openSource(taskPath: string): Promise<void> {
        // taskPath is in format "file.yml:line"
        const match = taskPath.match(/^(.+):(\d+)$/);
        if (match) {
            const [, filePath, lineStr] = match;
            const line = parseInt(lineStr, 10);
            const uri = vscode.Uri.file(filePath);
            await vscode.commands.executeCommand('vscode.open', uri.with({ fragment: `L${line}` }));
        } else {
            // No line number, just open the file
            const uri = vscode.Uri.file(taskPath);
            await vscode.commands.executeCommand('vscode.open', uri);
        }
    }

    private async _generateAiPrompt(data: {
        taskName: string;
        module: string;
        host: string;
        status: string;
        args: Record<string, unknown>;
        result: Record<string, unknown>;
        path: string | null;
    }): Promise<void> {
        const { taskName, module, host, status, args, result, path: taskPath } = data;
        
        // Clean up result for prompt (remove internal keys)
        const cleanResult: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
            if (!key.startsWith('_ansible_') && key !== 'invocation') {
                cleanResult[key] = value;
            }
        }

        const statusText = status === 'failed' ? 'FAILED' : status === 'changed' ? 'CHANGED' : 'OK';
        const sourceInfo = taskPath ? `**Source:** \`${taskPath}\`\n` : '';
        
        const prompt = `Analyze this Ansible task execution result and provide insights:

## Task: ${taskName}
**Module:** \`${module}\`
**Host:** ${host}
**Status:** ${statusText}
${sourceInfo}
## Invocation (Task Arguments)
\`\`\`yaml
${JSON.stringify(args, null, 2)}
\`\`\`

## Result
\`\`\`yaml
${JSON.stringify(cleanResult, null, 2)}
\`\`\`

## Instructions
1. Use the \`get_plugin_doc\` MCP tool to retrieve the documentation for the \`${module}\` module
2. Review the module's parameters, return values, and examples
3. ${taskPath ? `Read the source file at \`${taskPath}\` to understand the task context` : 'Analyze the task in isolation'}
4. Analyze the task result:
   - If FAILED: Explain the likely cause and suggest fixes
   - If CHANGED: Confirm expected behavior or flag any concerns
   - If OK: Verify the task behaved as intended
5. Compare the invocation against the module's best practices
6. Suggest any improvements to the task configuration`;

        // Try to open chat with prompt directly, fall back to clipboard
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
            vscode.window.showInformationMessage('Prompt sent to chat.');
        } catch {
            await vscode.env.clipboard.writeText(prompt);
            const action = await vscode.window.showInformationMessage(
                'AI prompt copied to clipboard. Paste it into an agent chat session.',
                'Open Chat'
            );
            if (action === 'Open Chat') {
                await vscode.commands.executeCommand('workbench.action.chat.open');
            }
        }
    }

    public dispose(): void {
        PlaybookProgressPanel._currentPanel = undefined;

        // Clean up socket
        if (this._socketServer) {
            this._socketServer.close();
        }
        if (this._socketPath) {
            try {
                fs.unlinkSync(this._socketPath);
            } catch {
                // Ignore
            }
        }

        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
