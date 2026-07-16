import { describe, it, expect } from 'vitest';
import {
    buildPlaybookFlags,
    buildPlaybookCommand,
    buildNavigatorCommand,
    buildNavigatorEECommand,
    parsePlaybook,
    mergePlaybookConfig,
    DEFAULT_PLAYBOOK_CONFIG,
} from '../../src/parsers/playbookParser';
import type { PlaybookConfig } from '../../src/types/playbook';

describe('DEFAULT_PLAYBOOK_CONFIG', () => {
    it('has sensible defaults', () => {
        expect(DEFAULT_PLAYBOOK_CONFIG.forks).toBe(5);
        expect(DEFAULT_PLAYBOOK_CONFIG.connection).toBe('ssh');
        expect(DEFAULT_PLAYBOOK_CONFIG.become).toBe(false);
        expect(DEFAULT_PLAYBOOK_CONFIG.check).toBe(false);
        expect(DEFAULT_PLAYBOOK_CONFIG.verbose).toBe(0);
    });
});

describe('buildPlaybookCommand', () => {
    it('returns basic command with just playbook path', () => {
        const cmd = buildPlaybookCommand('site.yml', DEFAULT_PLAYBOOK_CONFIG);
        expect(cmd).toBe('ansible-playbook site.yml');
    });

    it('adds inventory flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts.ini', 'staging/'],
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-i hosts.ini');
        expect(cmd).toContain('-i staging/');
    });

    it('adds limit flag', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, limit: 'web:&prod' };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-l web:&prod');
    });

    it('adds tags and skip-tags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            tags: ['deploy', 'configure'],
            skipTags: ['cleanup'],
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-t deploy');
        expect(cmd).toContain('-t configure');
        expect(cmd).toContain('--skip-tags cleanup');
    });

    it('adds extra vars', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, extraVars: 'env=prod' };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-e env=prod');
    });

    it('adds check and diff flags', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, check: true, diff: true };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--check');
        expect(cmd).toContain('--diff');
    });

    it('adds verbosity flag correctly', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, verbose: 3 };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-vvv');
    });

    it('caps verbosity at 6', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, verbose: 10 };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-vvvvvv');
        expect(cmd).not.toContain('-vvvvvvv');
    });

    it('adds forks only when non-default', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, forks: 20 };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-f 20');
    });

    it('omits forks when default (5)', () => {
        const cmd = buildPlaybookCommand('site.yml', DEFAULT_PLAYBOOK_CONFIG);
        expect(cmd).not.toContain('-f');
    });

    it('adds connection only when non-default', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, connection: 'local' };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-c local');
    });

    it('adds user flag', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, user: 'deploy' };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-u deploy');
    });

    it('adds timeout flag', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, timeout: 30 };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('-T 30');
    });

    it('adds private key flag', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, privateKey: '~/.ssh/id_rsa' };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--private-key ~/.ssh/id_rsa');
    });

    it('adds become flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            become: true,
            becomeMethod: 'doas',
            becomeUser: 'admin',
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--become');
        expect(cmd).toContain('--become-method doas');
        expect(cmd).toContain('--become-user admin');
    });

    it('omits become-method when sudo (default)', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, become: true };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--become');
        expect(cmd).not.toContain('--become-method');
    });

    it('adds vault password file', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            vaultPasswordFile: '.vault_pass',
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--vault-password-file .vault_pass');
    });

    it('adds start-at-task', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            startAtTask: 'Install httpd',
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--start-at-task Install httpd');
    });

    it('adds step flag', () => {
        const config: PlaybookConfig = { ...DEFAULT_PLAYBOOK_CONFIG, step: true };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--step');
    });

    it('adds ask-pass flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            askPass: true,
            askBecomePass: true,
            askVaultPass: true,
        };
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toContain('--ask-pass');
        expect(cmd).toContain('--ask-become-pass');
        expect(cmd).toContain('--ask-vault-pass');
    });

    it('playbook path is always last', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts'],
            check: true,
        };
        const cmd = buildPlaybookCommand('deploy.yml', config);
        expect(cmd).toMatch(/deploy\.yml$/);
    });
});

describe('buildPlaybookFlags', () => {
    it('returns empty array for default config', () => {
        const flags = buildPlaybookFlags(DEFAULT_PLAYBOOK_CONFIG);
        expect(flags).toEqual([]);
    });

    it('returns inventory flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts.ini', 'staging/'],
        };
        const flags = buildPlaybookFlags(config);
        expect(flags).toEqual(['-i', 'hosts.ini', '-i', 'staging/']);
    });

    it('returns all non-default flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            limit: 'web',
            check: true,
            diff: true,
            verbose: 2,
            become: true,
        };
        const flags = buildPlaybookFlags(config);
        expect(flags).toContain('-l');
        expect(flags).toContain('--check');
        expect(flags).toContain('--diff');
        expect(flags).toContain('-vv');
        expect(flags).toContain('--become');
    });

    it('produces identical output to what buildPlaybookCommand embeds', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts'],
            check: true,
            forks: 10,
        };
        const flags = buildPlaybookFlags(config);
        const cmd = buildPlaybookCommand('site.yml', config);
        expect(cmd).toBe(['ansible-playbook', ...flags, 'site.yml'].join(' '));
    });
});

describe('buildNavigatorCommand', () => {
    it('returns basic command with just playbook path', () => {
        const cmd = buildNavigatorCommand('site.yml', DEFAULT_PLAYBOOK_CONFIG);
        expect(cmd).toBe('ansible-navigator run site.yml --mode stdout');
    });

    it('uses -- passthrough for config flags', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts.ini'],
            check: true,
        };
        const cmd = buildNavigatorCommand('site.yml', config);
        expect(cmd).toBe('ansible-navigator run site.yml --mode stdout -- -i hosts.ini --check');
    });

    it('includes all playbook flags after --', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            limit: 'web:&prod',
            tags: ['deploy'],
            become: true,
            becomeMethod: 'doas',
            verbose: 3,
        };
        const cmd = buildNavigatorCommand('deploy.yml', config);
        expect(cmd).toContain('ansible-navigator run deploy.yml --mode stdout --');
        expect(cmd).toContain('-l web:&prod');
        expect(cmd).toContain('-t deploy');
        expect(cmd).toContain('--become');
        expect(cmd).toContain('--become-method doas');
        expect(cmd).toContain('-vvv');
    });

    it('omits -- separator when config has no flags', () => {
        const cmd = buildNavigatorCommand('site.yml', DEFAULT_PLAYBOOK_CONFIG);
        expect(cmd).not.toMatch(/ -- /);
        expect(cmd).toBe('ansible-navigator run site.yml --mode stdout');
    });

    it('playbook path follows run subcommand', () => {
        const cmd = buildNavigatorCommand('deploy/app.yml', DEFAULT_PLAYBOOK_CONFIG);
        expect(cmd).toMatch(/^ansible-navigator run deploy\/app\.yml/);
    });
});

describe('buildNavigatorEECommand', () => {
    it('returns basic command without EE options', () => {
        const cmd = buildNavigatorEECommand('site.yml', DEFAULT_PLAYBOOK_CONFIG, {});
        expect(cmd).toBe('ansible-navigator run site.yml --mode stdout');
    });

    it('adds volume mount flags before -- separator', () => {
        const cmd = buildNavigatorEECommand('site.yml', DEFAULT_PLAYBOOK_CONFIG, {
            volumeMounts: [
                { src: '/host/plugins', dest: '/container/plugins', options: 'ro' },
                { src: '/tmp/sockets', dest: '/tmp/sockets', options: 'Z' },
            ],
        });
        expect(cmd).toContain(
            '--execution-environment-volume-mounts /host/plugins:/container/plugins:ro',
        );
        expect(cmd).toContain('--execution-environment-volume-mounts /tmp/sockets:/tmp/sockets:Z');
    });

    it('adds --senv flags for container env vars', () => {
        const cmd = buildNavigatorEECommand('site.yml', DEFAULT_PLAYBOOK_CONFIG, {
            setEnvVars: {
                ANSIBLE_CALLBACK_PLUGINS: '/container/callback',
                ANSIBLE_CALLBACKS_ENABLED: 'vscode_progress',
            },
        });
        expect(cmd).toContain('--senv ANSIBLE_CALLBACK_PLUGINS=/container/callback');
        expect(cmd).toContain('--senv ANSIBLE_CALLBACKS_ENABLED=vscode_progress');
    });

    it('adds --penv flags for passthrough env vars', () => {
        const cmd = buildNavigatorEECommand('site.yml', DEFAULT_PLAYBOOK_CONFIG, {
            passEnvVars: ['SSH_AUTH_SOCK', 'AWS_PROFILE'],
        });
        expect(cmd).toContain('--penv SSH_AUTH_SOCK');
        expect(cmd).toContain('--penv AWS_PROFILE');
    });

    it('puts EE flags before -- and playbook flags after', () => {
        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: ['hosts.ini'],
            check: true,
        };
        const cmd = buildNavigatorEECommand('site.yml', config, {
            volumeMounts: [{ src: '/a', dest: '/b' }],
            setEnvVars: { FOO: 'bar' },
        });
        const parts = cmd.split(' -- ');
        expect(parts).toHaveLength(2);
        expect(parts[0]).toContain('--execution-environment-volume-mounts /a:/b');
        expect(parts[0]).toContain('--senv FOO=bar');
        expect(parts[1]).toContain('-i hosts.ini');
        expect(parts[1]).toContain('--check');
    });

    it('handles volume mount without options', () => {
        const cmd = buildNavigatorEECommand('site.yml', DEFAULT_PLAYBOOK_CONFIG, {
            volumeMounts: [{ src: '/src', dest: '/dest' }],
        });
        expect(cmd).toContain('--execution-environment-volume-mounts /src:/dest');
        expect(cmd).not.toContain('/src:/dest:');
    });
});

describe('PlaybookConfig.executor', () => {
    it('DEFAULT_PLAYBOOK_CONFIG has ansible-playbook executor', () => {
        expect(DEFAULT_PLAYBOOK_CONFIG.executor).toBe('ansible-playbook');
    });

    it('mergePlaybookConfig preserves executor override', () => {
        const result = mergePlaybookConfig({ executor: 'ansible-navigator' });
        expect(result.executor).toBe('ansible-navigator');
    });

    it('mergePlaybookConfig defaults to ansible-playbook', () => {
        const result = mergePlaybookConfig();
        expect(result.executor).toBe('ansible-playbook');
    });

    it('later executor override wins', () => {
        const result = mergePlaybookConfig(
            { executor: 'ansible-navigator' },
            { executor: 'ansible-playbook' },
        );
        expect(result.executor).toBe('ansible-playbook');
    });
});

describe('parsePlaybook', () => {
    it('parses a single play', () => {
        const content = `---
- name: Deploy web
  hosts: webservers
  tasks:
    - name: Install httpd
      ansible.builtin.dnf:
        name: httpd
`;
        const plays = parsePlaybook(content);
        expect(plays).toHaveLength(1);
        expect(plays[0].name).toBe('Deploy web');
        expect(plays[0].hosts).toBe('webservers');
        expect(plays[0].lineNumber).toBe(2);
    });

    it('parses multiple plays', () => {
        const content = `---
- name: Setup
  hosts: all
  tasks: []

- name: Deploy
  hosts: app_servers
  tasks: []
`;
        const plays = parsePlaybook(content);
        expect(plays).toHaveLength(2);
        expect(plays[0].name).toBe('Setup');
        expect(plays[0].hosts).toBe('all');
        expect(plays[1].name).toBe('Deploy');
        expect(plays[1].hosts).toBe('app_servers');
    });

    it('handles plays without name', () => {
        const content = `---
- hosts: localhost
  tasks: []
`;
        const plays = parsePlaybook(content);
        expect(plays).toHaveLength(1);
        expect(plays[0].name).toBe('Unknown');
        expect(plays[0].hosts).toBe('localhost');
    });

    it('handles quoted names', () => {
        const content = `---
- name: "Deploy app"
  hosts: all
`;
        const plays = parsePlaybook(content);
        expect(plays[0].name).toBe('Deploy app');
    });

    it('returns empty array for non-playbook content', () => {
        const content = `---
some_var: value
another: thing
`;
        const plays = parsePlaybook(content);
        expect(plays).toHaveLength(0);
    });

    it('skips comments and blank lines', () => {
        const content = `---
# This is a comment

- name: Test
  hosts: all
`;
        const plays = parsePlaybook(content);
        expect(plays).toHaveLength(1);
        expect(plays[0].name).toBe('Test');
    });
});

describe('mergePlaybookConfig', () => {
    it('returns defaults when no overrides', () => {
        const result = mergePlaybookConfig();
        expect(result).toEqual(DEFAULT_PLAYBOOK_CONFIG);
    });

    it('merges a single override', () => {
        const result = mergePlaybookConfig({ forks: 10, check: true });
        expect(result.forks).toBe(10);
        expect(result.check).toBe(true);
        expect(result.connection).toBe('ssh');
    });

    it('later configs override earlier ones', () => {
        const result = mergePlaybookConfig({ forks: 10 }, { forks: 20 });
        expect(result.forks).toBe(20);
    });

    it('preserves non-overridden fields', () => {
        const result = mergePlaybookConfig({ user: 'deploy' });
        expect(result.become).toBe(false);
        expect(result.verbose).toBe(0);
        expect(result.user).toBe('deploy');
    });
});
