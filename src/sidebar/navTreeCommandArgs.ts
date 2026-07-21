/**
 * Pure helpers for enriching NavTree webview command args before executeCommand.
 * Keeps {@link AnsibleNavTreeProvider} free of payload-shape logic.
 */

export interface PlaybookCommandPayload {
    playbook: {
        path: string;
        name: string;
        relativePath: string;
        plays: unknown[];
    };
}

const PLAYBOOK_COMMANDS = new Set([
    'ansiblePlaybooks.run',
    'ansiblePlaybooks.runWithProgress',
    'ansiblePlaybooks.openPlaybook',
    'ansiblePlaybooks.editConfig',
    'ansiblePlaybooks.aiSummary',
]);

/**
 * Whether the command needs playbook payload enrichment (workspace folder).
 * @param command - VS Code command id
 * @returns True when the NavTree should attach workspaceFolder
 */
export function isPlaybookCommand(command: string): boolean {
    return PLAYBOOK_COMMANDS.has(command);
}

/**
 * Normalize webview playbook args (including legacy `pb-<path>` node ids).
 * @param args - Raw args from the webview DTO
 * @returns Normalized playbook wrapper, or undefined when not a playbook payload
 */
export function normalizePlaybookPayload(args: unknown[]): PlaybookCommandPayload | undefined {
    let payload: unknown = args[0];

    // Legacy / stale webview sent the tree node id string (pb-<path>)
    if (typeof payload === 'string' && payload.startsWith('pb-')) {
        const filePath = payload.slice(3);
        payload = {
            playbook: {
                name: basename(filePath),
                path: filePath,
                relativePath: filePath,
                plays: [],
            },
        };
    }

    if (!payload || typeof payload !== 'object' || !('playbook' in payload)) {
        return undefined;
    }

    const playbook = payload.playbook;
    if (!playbook || typeof playbook !== 'object') {
        return undefined;
    }
    const fields = playbook as Record<string, unknown>;
    if (typeof fields.path !== 'string') {
        return undefined;
    }
    return {
        playbook: {
            path: fields.path,
            name: typeof fields.name === 'string' ? fields.name : basename(fields.path),
            relativePath:
                typeof fields.relativePath === 'string' ? fields.relativePath : fields.path,
            plays: Array.isArray(fields.plays) ? fields.plays : [],
        },
    };
}

/**
 * Extract envId from selectEnvironment webview args.
 * @param args - Raw args from the webview DTO
 * @returns envId string when present
 */
export function extractSelectEnvironmentId(args: unknown[]): string | undefined {
    const first = args[0];
    if (first && typeof first === 'object' && 'envId' in first) {
        return typeof first.envId === 'string' ? first.envId : undefined;
    }
    return undefined;
}

/**
 * Basename without importing Node path (keeps helper easy to unit-test).
 * @param filePath - Absolute or relative path
 * @returns Final path segment
 */
function basename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || filePath;
}
