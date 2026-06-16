/**
 * Pure-logic playbook configuration service.
 * No VS Code dependency — suitable for MCP server and UI consumers.
 */
import type { PlaybookConfig, PlaybookPlay } from '../types/playbook';

/** Default ansible-playbook run configuration. */
export const DEFAULT_PLAYBOOK_CONFIG: PlaybookConfig = {
    inventory: [],
    limit: '',
    tags: [],
    skipTags: [],
    extraVars: '',
    check: false,
    diff: false,
    verbose: 0,
    forks: 5,
    connection: 'ssh',
    user: '',
    timeout: undefined,
    privateKey: '',
    become: false,
    becomeMethod: 'sudo',
    becomeUser: 'root',
    vaultPasswordFile: '',
    startAtTask: '',
    step: false,
    askPass: false,
    askBecomePass: false,
    askVaultPass: false,
};

/**
 * Build an ansible-playbook CLI command string from configuration.
 *
 * @param playbookPath - Path to the playbook file (appended last).
 * @param config - Effective run settings.
 * @returns Space-joined ansible-playbook command.
 */
export function buildPlaybookCommand(playbookPath: string, config: PlaybookConfig): string {
    const args: string[] = ['ansible-playbook'];

    if (config.inventory && config.inventory.length > 0) {
        for (const inv of config.inventory) {
            if (inv) {
                args.push('-i', inv);
            }
        }
    }

    if (config.limit) {
        args.push('-l', config.limit);
    }

    if (config.tags && config.tags.length > 0) {
        for (const tag of config.tags) {
            if (tag) {
                args.push('-t', tag);
            }
        }
    }

    if (config.skipTags && config.skipTags.length > 0) {
        for (const tag of config.skipTags) {
            if (tag) {
                args.push('--skip-tags', tag);
            }
        }
    }

    if (config.extraVars) {
        args.push('-e', config.extraVars);
    }

    if (config.check) {
        args.push('--check');
    }

    if (config.diff) {
        args.push('--diff');
    }

    if (config.verbose && config.verbose > 0) {
        args.push('-' + 'v'.repeat(Math.min(config.verbose, 6)));
    }

    if (config.forks && config.forks !== 5) {
        args.push('-f', String(config.forks));
    }

    if (config.connection && config.connection !== 'ssh') {
        args.push('-c', config.connection);
    }

    if (config.user) {
        args.push('-u', config.user);
    }

    if (config.timeout) {
        args.push('-T', String(config.timeout));
    }

    if (config.privateKey) {
        args.push('--private-key', config.privateKey);
    }

    if (config.become) {
        args.push('--become');
    }

    if (config.becomeMethod && config.becomeMethod !== 'sudo') {
        args.push('--become-method', config.becomeMethod);
    }

    if (config.becomeUser && config.becomeUser !== 'root') {
        args.push('--become-user', config.becomeUser);
    }

    if (config.vaultPasswordFile) {
        args.push('--vault-password-file', config.vaultPasswordFile);
    }

    if (config.startAtTask) {
        args.push('--start-at-task', config.startAtTask);
    }

    if (config.step) {
        args.push('--step');
    }

    if (config.askPass) {
        args.push('--ask-pass');
    }

    if (config.askBecomePass) {
        args.push('--ask-become-pass');
    }

    if (config.askVaultPass) {
        args.push('--ask-vault-pass');
    }

    args.push(playbookPath);

    return args.join(' ');
}

/**
 * Parse playbook YAML content into play summaries using line-based heuristics.
 * Not a full YAML parser — scans for top-level list items with `hosts:`.
 *
 * @param content - Raw playbook file content.
 * @returns Parsed plays with names, hosts, and line numbers.
 */
export function parsePlaybook(content: string): PlaybookPlay[] {
    const plays: PlaybookPlay[] = [];
    const lines = content.split('\n');

    let currentPlay: Partial<PlaybookPlay> | null = null;
    let inPlay = false;
    let playIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('#') || trimmed === '') {
            continue;
        }

        const listMatch = /^(\s*)-\s*/.exec(line);
        if (listMatch) {
            if (currentPlay?.hosts) {
                plays.push({
                    name: currentPlay.name ?? 'Unknown',
                    hosts: currentPlay.hosts,
                    lineNumber: currentPlay.lineNumber ?? 0,
                });
            }

            currentPlay = { lineNumber: i + 1 };
            inPlay = true;
            playIndent = listMatch[1].length;

            const restOfLine = line.substring(listMatch[0].length);
            if (restOfLine.startsWith('hosts:')) {
                const hostsMatch = /^hosts:\s*(.+)/.exec(restOfLine);
                if (hostsMatch) {
                    currentPlay.hosts = hostsMatch[1].trim();
                }
            } else if (restOfLine.startsWith('name:')) {
                const nameMatch = /^name:\s*(.+)/.exec(restOfLine);
                if (nameMatch) {
                    currentPlay.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
                }
            }
            continue;
        }

        if (inPlay && currentPlay) {
            const indent = /^(\s*)/.exec(line)?.[1].length ?? 0;

            if (indent <= playIndent && trimmed !== '' && !trimmed.startsWith('#')) {
                if (!/^\s*-\s/.exec(line)) {
                    // Not a list item — still in play content
                }
            }

            if (trimmed.startsWith('hosts:')) {
                const hostsMatch = /^hosts:\s*(.+)/.exec(trimmed);
                if (hostsMatch) {
                    currentPlay.hosts = hostsMatch[1].trim();
                }
            } else if (trimmed.startsWith('name:')) {
                const nameMatch = /^name:\s*(.+)/.exec(trimmed);
                if (nameMatch) {
                    currentPlay.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
                }
            }
        }
    }

    if (currentPlay?.hosts) {
        plays.push({
            name: currentPlay.name ?? 'Unknown',
            hosts: currentPlay.hosts,
            lineNumber: currentPlay.lineNumber ?? 0,
        });
    }

    return plays;
}

/**
 * Merge multiple partial configs into one effective config.
 * Later arguments override earlier ones (spread order).
 *
 * @param configs - Partial configs to merge (default → global → per-playbook).
 * @returns Fully merged playbook configuration.
 */
export function mergePlaybookConfig(...configs: Partial<PlaybookConfig>[]): PlaybookConfig {
    let result: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG };
    for (const partial of configs) {
        result = { ...result, ...partial };
    }
    return result;
}
