/** Human-readable MCP tool category labels for NavTree AI Tools section. */
export const MCP_CATEGORY_LABELS: Record<string, string> = {
    getting_started: 'Getting Started',
    discovery: 'Discovery',
    generation: 'Task Generation',
    execution: 'Execution Environments',
    devtools: 'Dev Tools',
    creator: 'Creator',
};

const IDE_DISPLAY_NAMES: Record<string, string> = {
    bob: 'IBM Bob',
    cursor: 'Cursor',
    vscode: 'VS Code Copilot',
};

/**
 * Map a detected IDE id to the label shown in the NavTree AI Tools section.
 * @param ide - Detected IDE key from MCP status
 * @returns Display label (falls back to the raw id)
 */
export function mcpIdeDisplayName(ide: string): string {
    return IDE_DISPLAY_NAMES[ide] ?? ide;
}
