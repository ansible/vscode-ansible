import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverPlaybooks } from '../../src/PlaybookDiscovery';

describe('discoverPlaybooks', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-discover-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    /**
     * Write a file relative to the temp directory.
     * @param relPath - Path relative to tmpDir
     * @param content - File content to write
     */
    function writeFile(relPath: string, content: string): void {
        const full = path.join(tmpDir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }

    const VALID_PLAYBOOK = `---
- name: Test play
  hosts: localhost
  tasks:
    - name: Say hello
      debug:
        msg: hello
`;

    const ROLE_TASKS = `---
- name: Install package
  yum:
    name: httpd
`;

    const VARS_FILE = `---
http_port: 80
max_clients: 200
`;

    it('discovers a valid playbook', async () => {
        writeFile('site.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('site');
        expect(results[0].relativePath).toBe('site.yml');
        expect(results[0].plays).toHaveLength(1);
        expect(results[0].plays[0].hosts).toBe('localhost');
    });

    it('skips variable files (no hosts: key)', async () => {
        writeFile('vars/main.yml', VARS_FILE);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips role task files', async () => {
        writeFile('roles/web/tasks/main.yml', ROLE_TASKS);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips role handlers, defaults, vars, meta, templates, files', async () => {
        for (const sub of ['handlers', 'defaults', 'vars', 'meta', 'templates', 'files']) {
            writeFile(`roles/web/${sub}/main.yml`, VALID_PLAYBOOK);
        }
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips hidden directories', async () => {
        writeFile('.hidden/playbook.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips node_modules', async () => {
        writeFile('node_modules/some-pkg/playbook.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips venv and .venv', async () => {
        writeFile('venv/lib/playbook.yml', VALID_PLAYBOOK);
        writeFile('.venv/lib/playbook.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips __pycache__', async () => {
        writeFile('__pycache__/playbook.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('skips collections directory', async () => {
        writeFile('collections/ansible_collections/ns/coll/playbooks/main.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('discovers nested playbooks', async () => {
        writeFile('deploy/app.yml', VALID_PLAYBOOK);
        writeFile('deploy/db.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.relativePath)).toEqual(['deploy/app.yml', 'deploy/db.yml']);
    });

    it('returns results sorted by relativePath', async () => {
        writeFile('z-playbook.yml', VALID_PLAYBOOK);
        writeFile('a-playbook.yml', VALID_PLAYBOOK);
        writeFile('m-playbook.yml', VALID_PLAYBOOK);
        const results = await discoverPlaybooks(tmpDir);
        expect(results.map((r) => r.relativePath)).toEqual([
            'a-playbook.yml',
            'm-playbook.yml',
            'z-playbook.yml',
        ]);
    });

    it('skips non-YAML files', async () => {
        writeFile('README.md', '# Hello');
        writeFile('script.py', 'print("hi")');
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });

    it('handles empty directory', async () => {
        const results = await discoverPlaybooks(tmpDir);
        expect(results).toHaveLength(0);
    });
});
