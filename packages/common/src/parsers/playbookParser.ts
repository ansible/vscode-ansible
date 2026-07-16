/**
 * Pure-logic playbook configuration service.
 * No VS Code dependency — suitable for MCP server and UI consumers.
 */
import type { PlaybookConfig, PlaybookPlay } from '../types/playbook';

/** Default playbook run configuration. */
export const DEFAULT_PLAYBOOK_CONFIG: PlaybookConfig = {
    executor: 'ansible-playbook',
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
 * Build ansible-playbook CLI flags from configuration (no executable or playbook path).
 *
 * Shared by both `buildPlaybookCommand` and `buildNavigatorCommand` to avoid
 * duplicating flag translation logic.
 *
 * @param config - Effective run settings.
 * @returns Array of CLI flag strings.
 */
export function buildPlaybookFlags(config: PlaybookConfig): string[] {
    const flags: string[] = [];

    if (config.inventory && config.inventory.length > 0) {
        for (const inv of config.inventory) {
            if (inv) {
                flags.push('-i', inv);
            }
        }
    }

    if (config.limit) {
        flags.push('-l', config.limit);
    }

    if (config.tags && config.tags.length > 0) {
        for (const tag of config.tags) {
            if (tag) {
                flags.push('-t', tag);
            }
        }
    }

    if (config.skipTags && config.skipTags.length > 0) {
        for (const tag of config.skipTags) {
            if (tag) {
                flags.push('--skip-tags', tag);
            }
        }
    }

    if (config.extraVars) {
        flags.push('-e', config.extraVars);
    }

    if (config.check) {
        flags.push('--check');
    }

    if (config.diff) {
        flags.push('--diff');
    }

    if (config.verbose && config.verbose > 0) {
        flags.push('-' + 'v'.repeat(Math.min(config.verbose, 6)));
    }

    if (config.forks && config.forks !== 5) {
        flags.push('-f', String(config.forks));
    }

    if (config.connection && config.connection !== 'ssh') {
        flags.push('-c', config.connection);
    }

    if (config.user) {
        flags.push('-u', config.user);
    }

    if (config.timeout) {
        flags.push('-T', String(config.timeout));
    }

    if (config.privateKey) {
        flags.push('--private-key', config.privateKey);
    }

    if (config.become) {
        flags.push('--become');
    }

    if (config.becomeMethod && config.becomeMethod !== 'sudo') {
        flags.push('--become-method', config.becomeMethod);
    }

    if (config.becomeUser && config.becomeUser !== 'root') {
        flags.push('--become-user', config.becomeUser);
    }

    if (config.vaultPasswordFile) {
        flags.push('--vault-password-file', config.vaultPasswordFile);
    }

    if (config.startAtTask) {
        flags.push('--start-at-task', config.startAtTask);
    }

    if (config.step) {
        flags.push('--step');
    }

    if (config.askPass) {
        flags.push('--ask-pass');
    }

    if (config.askBecomePass) {
        flags.push('--ask-become-pass');
    }

    if (config.askVaultPass) {
        flags.push('--ask-vault-pass');
    }

    return flags;
}

/**
 * Build an ansible-playbook CLI command string from configuration.
 *
 * @param playbookPath - Path to the playbook file (appended last).
 * @param config - Effective run settings.
 * @returns Space-joined ansible-playbook command.
 */
export function buildPlaybookCommand(playbookPath: string, config: PlaybookConfig): string {
    return ['ansible-playbook', ...buildPlaybookFlags(config), playbookPath].join(' ');
}

/**
 * Build an ansible-navigator run command string from playbook configuration.
 *
 * Uses `--mode stdout` for predictable output in VS Code's integrated terminal.
 * Playbook flags are passed after `--` so ansible-navigator forwards them to
 * the underlying ansible-playbook invocation.
 *
 * @param playbookPath - Path to the playbook file.
 * @param config - Effective run settings.
 * @returns Space-joined ansible-navigator run command.
 */
export function buildNavigatorCommand(playbookPath: string, config: PlaybookConfig): string {
    const args: string[] = ['ansible-navigator', 'run', playbookPath, '--mode', 'stdout'];

    const passthroughFlags = buildPlaybookFlags(config);
    if (passthroughFlags.length > 0) {
        args.push('--', ...passthroughFlags);
    }

    return args.join(' ');
}

/** Options for ansible-navigator execution environment integration. */
export interface NavigatorEEVolumeMount {
    src: string;
    dest: string;
    options?: string;
}

export interface NavigatorEEOptions {
    volumeMounts?: NavigatorEEVolumeMount[];
    setEnvVars?: Record<string, string>;
    passEnvVars?: string[];
}

/**
 * Build an ansible-navigator run command with EE volume mounts and env vars.
 *
 * Injects `--execution-environment-volume-mounts` and `--senv` flags before the
 * `--` passthrough separator so the callback plugin and Unix socket are accessible
 * inside the execution environment container.
 *
 * @param playbookPath - Path to the playbook file.
 * @param config - Effective run settings.
 * @param eeOptions - Volume mounts and env vars for the EE container.
 * @returns Space-joined ansible-navigator run command with EE flags.
 */
export function buildNavigatorEECommand(
    playbookPath: string,
    config: PlaybookConfig,
    eeOptions: NavigatorEEOptions,
): string {
    const args: string[] = ['ansible-navigator', 'run', playbookPath, '--mode', 'stdout'];

    for (const mount of eeOptions.volumeMounts ?? []) {
        const mountStr = mount.options
            ? `${mount.src}:${mount.dest}:${mount.options}`
            : `${mount.src}:${mount.dest}`;
        args.push('--execution-environment-volume-mounts', mountStr);
    }
    for (const [key, value] of Object.entries(eeOptions.setEnvVars ?? {})) {
        args.push('--senv', `${key}=${value}`);
    }
    for (const varName of eeOptions.passEnvVars ?? []) {
        args.push('--penv', varName);
    }

    const passthroughFlags = buildPlaybookFlags(config);
    if (passthroughFlags.length > 0) {
        args.push('--', ...passthroughFlags);
    }

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
