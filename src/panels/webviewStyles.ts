/**
 * Shared Webview Styles and Utilities
 * 
 * Centralizes CSS, zoom/theme controls, and common UI patterns
 * to ensure consistency across all webview panels.
 */

/**
 * Base CSS variables used across all webviews
 */
export const BASE_CSS_VARIABLES = `
    :root {
        --bg: var(--vscode-editor-background);
        --fg: var(--vscode-editor-foreground);
        --input-bg: var(--vscode-input-background);
        --input-fg: var(--vscode-input-foreground);
        --input-border: var(--vscode-input-border);
        --button-bg: var(--vscode-button-background);
        --button-fg: var(--vscode-button-foreground);
        --button-hover: var(--vscode-button-hoverBackground);
        --focus: var(--vscode-focusBorder);
        --secondary-bg: var(--vscode-sideBar-background);
        --border: var(--vscode-panel-border);
        --success: var(--vscode-testing-iconPassed);
        --warning: var(--vscode-editorWarning-foreground);
        --error: var(--vscode-errorForeground);
        --link: var(--vscode-textLink-foreground);
    }
`;

/**
 * Base body and typography styles
 */
export const BASE_BODY_STYLES = `
    * { box-sizing: border-box; }
    
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--fg);
        background: var(--bg);
        padding: 16px;
        margin: 0;
        line-height: 1.5;
    }
    
    h1 { font-size: 1.4em; font-weight: 500; margin: 0 0 8px 0; }
    h2 { font-size: 1.2em; font-weight: 500; margin: 16px 0 8px 0; }
    h3 { font-size: 1.1em; font-weight: 500; margin: 12px 0 6px 0; }
    
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    
    .subtitle { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 4px; }
`;

/**
 * Common button styles
 */
export const BUTTON_STYLES = `
    button {
        padding: 6px 12px;
        border: none;
        border-radius: 3px;
        font-size: 0.9em;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    button.primary {
        background: var(--button-bg);
        color: var(--button-fg);
    }
    
    button.primary:hover:not(:disabled) {
        background: var(--button-hover);
    }
    
    button.secondary {
        background: transparent;
        color: var(--fg);
        border: 1px solid var(--input-border);
    }
    
    button.secondary:hover:not(:disabled) {
        background: var(--secondary-bg);
    }
    
    button.small {
        padding: 2px 8px;
        font-size: 0.8em;
    }
    
    button.icon-btn {
        background: transparent;
        border: none;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        padding: 2px 4px;
        font-size: 1em;
    }
    
    button.icon-btn:hover {
        color: var(--fg);
    }
`;

/**
 * Form element styles
 */
export const FORM_STYLES = `
    .form-group {
        margin-bottom: 16px;
    }
    
    label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
    }
    
    input[type="text"],
    input[type="number"],
    textarea,
    select {
        width: 100%;
        padding: 6px 8px;
        background: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 3px;
        font-family: inherit;
        font-size: inherit;
    }
    
    input:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: var(--focus);
    }
    
    textarea {
        resize: vertical;
        min-height: 60px;
    }
    
    .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .checkbox-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: normal;
        cursor: pointer;
    }
    
    .checkbox-item input {
        width: auto;
    }
`;

/**
 * Table styles
 */
export const TABLE_STYLES = `
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9em;
    }
    
    th {
        text-align: left;
        padding: 8px;
        background: var(--secondary-bg);
        border-bottom: 1px solid var(--border);
        font-weight: 500;
    }
    
    td {
        padding: 8px;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
    }
    
    tr:hover {
        background: var(--secondary-bg);
    }
`;

/**
 * Section and card styles
 */
export const SECTION_STYLES = `
    .section {
        background: color-mix(in srgb, var(--secondary-bg) 50%, transparent);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
    }
    
    .section h2:first-child,
    .section h3:first-child {
        margin-top: 0;
    }
    
    .empty-state {
        text-align: center;
        padding: 24px;
        color: var(--vscode-descriptionForeground);
    }
`;

/**
 * Progress bar styles
 */
export const PROGRESS_STYLES = `
    .progress-bar {
        height: 4px;
        background: var(--secondary-bg);
        border-radius: 2px;
        overflow: hidden;
    }
    
    .progress-fill {
        height: 100%;
        background: var(--success);
        transition: width 0.3s;
    }
`;

/**
 * Toolbar styles (including zoom/theme controls)
 */
export const TOOLBAR_STYLES = `
    .toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    
    .toolbar-right {
        margin-left: auto;
        display: flex;
        gap: 4px;
        align-items: center;
    }
    
    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
    }
`;

/**
 * Zoom and theme control styles
 */
export const ZOOM_THEME_STYLES = `
    .view-controls {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    
    .view-controls button {
        background: var(--secondary-bg);
        border: 1px solid var(--border);
        color: var(--fg);
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.9em;
    }
    
    .view-controls button:hover {
        background: var(--input-bg);
    }
    
    .container {
        zoom: 1;
    }
`;

/**
 * Badge/tag styles
 */
export const BADGE_STYLES = `
    .badge {
        display: inline-block;
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--secondary-bg);
    }
    
    .badge.success { background: var(--success); color: white; }
    .badge.warning { background: var(--warning); color: black; }
    .badge.error { background: var(--error); color: white; }
`;

/**
 * Get all common styles combined
 */
export function getCommonStyles(): string {
    return `
        ${BASE_CSS_VARIABLES}
        ${BASE_BODY_STYLES}
        ${BUTTON_STYLES}
        ${FORM_STYLES}
        ${TABLE_STYLES}
        ${SECTION_STYLES}
        ${PROGRESS_STYLES}
        ${TOOLBAR_STYLES}
        ${ZOOM_THEME_STYLES}
        ${BADGE_STYLES}
    `;
}

/**
 * Generate zoom/theme control HTML
 */
export function getZoomThemeControls(): string {
    return `
        <div class="view-controls">
            <button id="zoomOutBtn" title="Zoom out">−</button>
            <button id="zoomInBtn" title="Zoom in">+</button>
            <button id="themeBtn" title="Toggle theme">◐</button>
        </div>
    `;
}

/**
 * Generate zoom/theme control JavaScript
 * @param settingsKey - Unique key for storing settings (e.g., 'pluginDoc', 'creatorForm')
 */
export function getZoomThemeScript(settingsKey: string): string {
    return `
        // Zoom/Theme controls
        (function() {
            const container = document.querySelector('.container') || document.body;
            let currentZoom = 1;
            let currentTheme = 'auto';
            
            // Load saved settings
            const savedZoom = localStorage.getItem('${settingsKey}.zoom');
            const savedTheme = localStorage.getItem('${settingsKey}.theme');
            if (savedZoom) {
                currentZoom = parseFloat(savedZoom);
                container.style.zoom = currentZoom;
            }
            if (savedTheme) {
                currentTheme = savedTheme;
                applyTheme(currentTheme);
            }
            
            function applyTheme(theme) {
                document.body.classList.remove('theme-light', 'theme-dark');
                if (theme === 'light') {
                    document.body.classList.add('theme-light');
                } else if (theme === 'dark') {
                    document.body.classList.add('theme-dark');
                }
                // 'auto' uses VS Code's theme (no class needed)
            }
            
            document.getElementById('zoomInBtn')?.addEventListener('click', () => {
                currentZoom = Math.min(currentZoom + 0.1, 2);
                container.style.zoom = currentZoom;
                localStorage.setItem('${settingsKey}.zoom', currentZoom.toString());
            });
            
            document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
                currentZoom = Math.max(currentZoom - 0.1, 0.5);
                container.style.zoom = currentZoom;
                localStorage.setItem('${settingsKey}.zoom', currentZoom.toString());
            });
            
            document.getElementById('themeBtn')?.addEventListener('click', () => {
                const themes = ['auto', 'light', 'dark'];
                const idx = themes.indexOf(currentTheme);
                currentTheme = themes[(idx + 1) % themes.length];
                applyTheme(currentTheme);
                localStorage.setItem('${settingsKey}.theme', currentTheme);
            });
        })();
    `;
}

/**
 * Theme override CSS (for manual light/dark toggle)
 */
export const THEME_OVERRIDE_STYLES = `
    body.theme-light {
        --bg: #ffffff;
        --fg: #333333;
        --secondary-bg: #f5f5f5;
        --border: #e0e0e0;
        --input-bg: #ffffff;
        --input-fg: #333333;
        --input-border: #cccccc;
    }
    
    body.theme-dark {
        --bg: #1e1e1e;
        --fg: #cccccc;
        --secondary-bg: #252526;
        --border: #3c3c3c;
        --input-bg: #3c3c3c;
        --input-fg: #cccccc;
        --input-border: #5a5a5a;
    }
`;

/**
 * Get complete styles including theme overrides
 */
export function getFullStyles(): string {
    return getCommonStyles() + THEME_OVERRIDE_STYLES;
}

/**
 * Agent Progress Panel CSS
 */
export const AGENT_PROGRESS_STYLES = `
    /* Agent Progress Panel */
    .agent-progress-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        max-height: 70vh;
        background: var(--secondary-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    
    .agent-progress-panel.hidden { display: none; }
    
    .progress-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: var(--input-bg);
        border-bottom: 1px solid var(--border);
    }
    
    .progress-spinner {
        animation: spin 1s linear infinite;
        font-size: 1.2em;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .progress-title {
        font-weight: 500;
        flex-grow: 1;
    }
    
    .progress-log {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px;
        max-height: 400px;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;
        font-size: 0.85em;
    }
    
        .log-entry {
            display: flex;
            padding: 3px 0;
            line-height: 1.4;
            animation: fadeIn 0.2s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(3px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .log-time {
            flex-shrink: 0;
            width: 65px;
            text-align: left;
            color: var(--vscode-descriptionForeground);
            opacity: 0.6;
        }
        
        .log-prefix {
            flex-shrink: 0;
            width: 50px;
            font-weight: 500;
        }
        
        .log-msg {
            flex: 1;
        }
        
        .log-entry.tool_call .log-prefix { color: var(--link); }
        .log-entry.tool_call .log-msg { color: var(--link); }
        .log-entry.tool_result .log-prefix { color: var(--vscode-descriptionForeground); }
        .log-entry.tool_result .log-msg { color: var(--vscode-descriptionForeground); }
        .log-entry.response .log-msg {
            color: var(--fg);
            background: rgba(100, 100, 100, 0.1);
            border-radius: 4px;
            padding: 4px 8px;
            font-style: italic;
        }
        .log-entry.error .log-prefix { color: var(--error); }
        .log-entry.error .log-msg { color: var(--error); }
        .log-entry.parsed .log-prefix { color: var(--success); }
        .log-entry.parsed .log-msg { color: var(--success); }
        .log-entry.info .log-msg { color: var(--fg); opacity: 0.9; }
    
    .agent-progress-panel.complete .progress-spinner { animation: none; }
    .agent-progress-panel.complete .progress-title { color: var(--success); }
    
    /* Backdrop */
    .progress-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 999;
    }
    
    .progress-backdrop.hidden { display: none; }
`;

/**
 * Generate Agent Progress Panel HTML
 * @param title - Title for the progress panel
 * @param showLoading - Whether to show the panel initially
 */
export function getAgentProgressHtml(title: string, showLoading: boolean): string {
    return `
        <div id="progressBackdrop" class="progress-backdrop ${showLoading ? '' : 'hidden'}"></div>
        <div id="agentProgressPanel" class="agent-progress-panel ${showLoading ? '' : 'hidden'}">
            <div class="progress-header">
                <span class="progress-spinner">◐</span>
                <span class="progress-title">${title}</span>
            </div>
            <div class="progress-log" id="progressLog">
                <div class="log-entry info">${new Date().toLocaleTimeString('en-US', { hour12: false })} Starting...</div>
            </div>
        </div>
    `;
}

/**
 * Generate Agent Progress Panel JavaScript
 * Handles 'agentProgress' messages from extension
 * @param completionTitle - Title to show when complete
 * @param autoHideDelay - Delay in ms before auto-hiding (0 to disable)
 */
export function getAgentProgressScript(completionTitle: string, autoHideDelay = 2000): string {
    return `
        // Handle agent progress messages
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'agentProgress') {
                const panel = document.getElementById('agentProgressPanel');
                const backdrop = document.getElementById('progressBackdrop');
                const log = document.getElementById('progressLog');
                const title = panel?.querySelector('.progress-title');
                const spinner = panel?.querySelector('.progress-spinner');
                
                if (!panel || !log) return;
                
                // Show panel
                panel.classList.remove('hidden');
                if (backdrop) backdrop.classList.remove('hidden');
                
                const { status, message: msg, type } = message.data;
                
                // Add log entry at TOP with three-column layout (time | prefix | msg)
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                if (type) entry.classList.add(type);
                const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                // Extract prefix from message (first word)
                const parts = msg.split(' ');
                const prefix = parts[0] || '';
                const rest = parts.slice(1).join(' ');
                
                entry.innerHTML = '<span class="log-time">' + time + '</span><span class="log-prefix">' + prefix + '</span><span class="log-msg">' + rest + '</span>';
                log.insertBefore(entry, log.firstChild);
                
                // Update panel state
                if (status === 'complete') {
                    panel.classList.add('complete');
                    if (title) title.textContent = '${completionTitle}';
                    if (spinner) spinner.textContent = '✓';
                    
                    ${autoHideDelay > 0 ? `
                    // Auto-hide after delay
                    setTimeout(() => {
                        panel.classList.add('hidden');
                        if (backdrop) backdrop.classList.add('hidden');
                    }, ${autoHideDelay});
                    ` : ''}
                } else if (status === 'error') {
                    panel.classList.add('error');
                    if (title) title.textContent = 'Error';
                    if (spinner) spinner.textContent = '✕';
                }
            }
        });
    `;
}

/**
 * Format log message for agent progress
 * Returns "SYMBOL message" where SYMBOL is a Unicode icon
 */
export function formatAgentLogMessage(message: string, type: string): string {
    // Unicode symbols that work well in monospace fonts
    if (type === 'tool_call') {
        const toolMatch = message.match(/Tool call requested: (\w+)/);
        if (toolMatch) {
            return `▶ ${toolMatch[1].replace('ansible_', '')}`;
        }
        return `▶ ${message}`;
    } else if (type === 'tool_result') {
        const resultMatch = message.match(/Tool (\w+) completed/);
        if (resultMatch) {
            return `◀ ${resultMatch[1].replace('ansible_', '')}`;
        }
        return `◀ ${message}`;
    } else if (type === 'error') {
        return `✕ ${message}`;
    } else if (type === 'info') {
        if (message.includes('Executing tool:')) {
            return ''; // Skip, we already show tool_call
        }
        return `· ${message}`;
    } else if (type === 'parsed') {
        return `✓ ${message}`;
    } else if (type === 'prompt') {
        return '↗ Sending to LLM...';
    } else if (type === 'response') {
        return `│ ${message}`;
    }
    return `· ${message}`;
}
