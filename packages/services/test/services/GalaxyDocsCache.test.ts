import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const httpsGetMock = vi.hoisted(() => vi.fn());

vi.mock('https', () => ({
    get: httpsGetMock,
}));

import { GalaxyDocsCache } from '../../src/GalaxyDocsCache';

/** Clears the GalaxyDocsCache singleton so each test starts fresh. */
function resetSingleton(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (GalaxyDocsCache as any)._instance = undefined;
}

/** Configures the mocked HTTPS client to return an HTTP 404. */
function installMock404(): void {
    httpsGetMock.mockImplementation(
        (_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                statusMessage: string;
                resume: () => void;
            };
            res.statusCode = 404;
            res.statusMessage = 'Not Found';
            res.resume = vi.fn();
            const req = new EventEmitter() as EventEmitter & { destroy: () => void };
            req.destroy = vi.fn();
            queueMicrotask(() => {
                cb(res);
            });
            return req as ReturnType<typeof import('https').get>;
        },
    );
}

/** Configures the mocked HTTPS client to return a successful JSON response. */
function installMockSuccess(body: string): void {
    httpsGetMock.mockImplementation(
        (_url: unknown, _options: unknown, cb: (res: EventEmitter) => void) => {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                headers: Record<string, string>;
            };
            res.statusCode = 200;
            res.headers = { 'content-type': 'application/json' };
            const req = new EventEmitter() as EventEmitter & { destroy: () => void };
            req.destroy = vi.fn();
            queueMicrotask(() => {
                cb(res);
                res.emit('data', Buffer.from(body));
                res.emit('end');
            });
            return req as ReturnType<typeof import('https').get>;
        },
    );
}

describe('GalaxyDocsCache', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'galaxy-docs-cache-'));
        resetSingleton();
        httpsGetMock.mockReset();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resetSingleton();
        httpsGetMock.mockReset();
    });

    it('getInstance returns the same singleton', () => {
        expect(GalaxyDocsCache.getInstance()).toBe(GalaxyDocsCache.getInstance());
    });

    it('isCached returns false when nothing is cached', () => {
        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });
        expect(svc.isCached('cisco', 'ios', '1.0.0')).toBe(false);
    });

    it('loads from disk and normalizes array-shaped options into keyed records', () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const cached = {
            formatVersion: 2,
            timestamp: Date.now(),
            namespace: 'test',
            name: 'col',
            version: '1.0.0',
            plugins: {
                module: [
                    { name: 'my_mod', fullName: 'test.col.my_mod', shortDescription: 'A test' },
                ],
            },
            pluginDocs: {
                'test.col.my_mod:module': {
                    doc: {
                        short_description: 'A test module',
                        options: {
                            param_a: { type: 'str', description: 'First param', required: true },
                            param_b: { type: 'int', description: 'Second param' },
                        },
                    },
                    examples: '- test.col.my_mod:\n    param_a: hello',
                    return: {
                        result: { type: 'dict', description: 'The result' },
                    },
                },
            },
        };

        fs.writeFileSync(
            path.join(cacheDir, 'test.col-1.0.0.json'),
            JSON.stringify(cached),
            'utf-8',
        );

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });
        expect(svc.isCached('test', 'col', '1.0.0')).toBe(true);
    });

    it('rejects old format version and returns null from disk', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const stale = {
            formatVersion: 1,
            timestamp: Date.now(),
            namespace: 'old',
            name: 'format',
            version: '1.0.0',
            plugins: {},
            pluginDocs: {},
        };

        fs.writeFileSync(
            path.join(cacheDir, 'old.format-1.0.0.json'),
            JSON.stringify(stale),
            'utf-8',
        );

        installMock404();

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });
        const result = await svc.getPluginTypes('old', 'format', '1.0.0');
        expect(result).toBeNull();
        expect(httpsGetMock).toHaveBeenCalled();
    });

    it('getPluginDoc returns cached doc with properly keyed options', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const cached = {
            formatVersion: 2,
            timestamp: Date.now(),
            namespace: 'ns',
            name: 'col',
            version: '2.0.0',
            plugins: {
                module: [
                    {
                        name: 'widget',
                        fullName: 'ns.col.widget',
                        shortDescription: 'Makes widgets',
                    },
                ],
            },
            pluginDocs: {
                'ns.col.widget:module': {
                    doc: {
                        short_description: 'Makes widgets',
                        options: {
                            size: { type: 'int', description: 'Widget size', required: true },
                            color: { type: 'str', description: 'Widget color' },
                        },
                    },
                    examples: '- ns.col.widget:\n    size: 5',
                },
            },
        };

        fs.writeFileSync(
            path.join(cacheDir, 'ns.col-2.0.0.json'),
            JSON.stringify(cached),
            'utf-8',
        );

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const doc = await svc.getPluginDoc('ns', 'col', '2.0.0', 'ns.col.widget', 'module');
        expect(doc).not.toBeNull();
        expect(doc?.doc?.options).toBeDefined();

        const optionKeys = Object.keys(doc?.doc?.options ?? {});
        expect(optionKeys).toContain('size');
        expect(optionKeys).toContain('color');
        expect(optionKeys.every((k) => isNaN(Number(k)))).toBe(true);
    });

    it('getPluginDoc returns null for nonexistent plugin', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const cached = {
            formatVersion: 2,
            timestamp: Date.now(),
            namespace: 'ns',
            name: 'col',
            version: '1.0.0',
            plugins: {},
            pluginDocs: {},
        };

        fs.writeFileSync(
            path.join(cacheDir, 'ns.col-1.0.0.json'), JSON.stringify(cached), 'utf-8',
        );

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const doc = await svc.getPluginDoc('ns', 'col', '1.0.0', 'ns.col.missing', 'module');
        expect(doc).toBeNull();
    });

    it('getPluginTypes returns plugin type map from disk cache', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const cached = {
            formatVersion: 2,
            timestamp: Date.now(),
            namespace: 'example',
            name: 'net',
            version: '3.0.0',
            plugins: {
                module: [
                    {
                        name: 'router',
                        fullName: 'example.net.router',
                        shortDescription: 'Router config',
                    },
                    {
                        name: 'switch',
                        fullName: 'example.net.switch',
                        shortDescription: 'Switch config',
                    },
                ],
                lookup: [
                    { name: 'dns', fullName: 'example.net.dns', shortDescription: 'DNS lookup' },
                ],
            },
            pluginDocs: {},
        };

        fs.writeFileSync(
            path.join(cacheDir, 'example.net-3.0.0.json'),
            JSON.stringify(cached),
            'utf-8',
        );

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const types = await svc.getPluginTypes('example', 'net', '3.0.0');
        expect(types).not.toBeNull();
        expect(types?.module).toHaveLength(2);
        expect(types?.lookup).toHaveLength(1);
    });

    it('rejects expired cache (older than 30 days)', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });

        const expired = {
            formatVersion: 2,
            timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
            namespace: 'old',
            name: 'expired',
            version: '1.0.0',
            plugins: { module: [] },
            pluginDocs: {},
        };

        fs.writeFileSync(
            path.join(cacheDir, 'old.expired-1.0.0.json'),
            JSON.stringify(expired),
            'utf-8',
        );

        installMock404();

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const types = await svc.getPluginTypes('old', 'expired', '1.0.0');
        expect(types).toBeNull();
        expect(httpsGetMock).toHaveBeenCalled();
    });

    it('handles corrupted JSON on disk gracefully', async () => {
        const cacheDir = path.join(tmpDir, 'galaxy-docs');
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'bad.json-1.0.0.json'), 'not json', 'utf-8');

        installMock404();

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const types = await svc.getPluginTypes('bad', 'json', '1.0.0');
        expect(types).toBeNull();
        expect(httpsGetMock).toHaveBeenCalled();
    });

    it('normalizes array-shaped options into keyed records during fetch', async () => {
        const docsBlob = {
            docs_blob: {
                contents: [
                    {
                        content_name: 'my_mod',
                        content_type: 'module',
                        doc_strings: {
                            doc: {
                                short_description: 'A module',
                                options: [
                                    { name: 'host', type: 'str', description: 'Target host', required: true },
                                    {
                                        name: 'config',
                                        type: 'dict',
                                        description: 'Nested config',
                                        suboptions: [
                                            { name: 'port', type: 'int', description: 'Port number' },
                                            { name: 'tls', type: 'bool', description: 'Use TLS' },
                                        ],
                                    },
                                ],
                            },
                            examples: '- arr.col.my_mod:\n    host: example.com',
                            return: [
                                { name: 'result', type: 'dict', description: 'The result' },
                                { name: 'changed', type: 'bool', description: 'Whether changed' },
                            ],
                        },
                    },
                ],
            },
        };

        installMockSuccess(JSON.stringify(docsBlob));

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const doc = await svc.getPluginDoc('arr', 'col', '1.0.0', 'arr.col.my_mod', 'module');
        expect(doc).not.toBeNull();

        const optionKeys = Object.keys(doc?.doc?.options ?? {});
        expect(optionKeys).toContain('host');
        expect(optionKeys).toContain('config');
        expect(optionKeys.every((k) => isNaN(Number(k)))).toBe(true);

        const hostOpt = doc?.doc?.options?.['host'];
        expect(hostOpt?.required).toBe(true);
        expect(hostOpt?.type).toBe('str');

        const configOpt = doc?.doc?.options?.['config'];
        expect(configOpt?.suboptions).toBeDefined();
        const subKeys = Object.keys(configOpt?.suboptions ?? {});
        expect(subKeys).toContain('port');
        expect(subKeys).toContain('tls');
        expect(subKeys.every((k) => isNaN(Number(k)))).toBe(true);

        const returnKeys = Object.keys(doc?.return ?? {});
        expect(returnKeys).toContain('result');
        expect(returnKeys).toContain('changed');
        expect(returnKeys.every((k) => isNaN(Number(k)))).toBe(true);
    });

    it('fetches from API, parses docs-blob, and persists to disk', async () => {
        const docsBlob = {
            docs_blob: {
                contents: [
                    {
                        content_name: 'alpha',
                        content_type: 'module',
                        doc_strings: {
                            doc: {
                                short_description: 'Alpha module',
                                options: { mode: { type: 'str', description: 'Mode' } },
                            },
                            examples: '- fetch.col.alpha:\n    mode: fast',
                            return: { status: { type: 'str', description: 'Status' } },
                        },
                    },
                    {
                        content_name: 'beta',
                        content_type: 'lookup',
                        doc_strings: {
                            doc: { short_description: 'Beta lookup' },
                        },
                    },
                    {
                        content_name: 'internal_util',
                        content_type: 'module_utils',
                        doc_strings: null,
                    },
                ],
            },
        };

        installMockSuccess(JSON.stringify(docsBlob));

        const svc = GalaxyDocsCache.getInstance();
        svc.setExtensionContext({ globalStorageUri: { fsPath: tmpDir } });

        const types = await svc.getPluginTypes('fetch', 'col', '2.0.0');
        expect(types).not.toBeNull();
        expect(types?.module).toHaveLength(1);
        expect(types?.module[0].name).toBe('alpha');
        expect(types?.module[0].fullName).toBe('fetch.col.alpha');
        expect(types?.lookup).toHaveLength(1);
        expect(types?.lookup[0].name).toBe('beta');
        expect(types?.['module_utils']).toBeUndefined();

        const doc = await svc.getPluginDoc('fetch', 'col', '2.0.0', 'fetch.col.alpha', 'module');
        expect(doc).not.toBeNull();
        expect(doc?.doc?.short_description).toBe('Alpha module');
        expect(doc?.examples).toContain('mode: fast');
        expect(doc?.return?.['status']).toBeDefined();

        const cacheFile = path.join(tmpDir, 'galaxy-docs', 'fetch.col-2.0.0.json');
        expect(fs.existsSync(cacheFile)).toBe(true);
        const persisted = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        expect(persisted.formatVersion).toBe(2);
        expect(persisted.namespace).toBe('fetch');
        expect(persisted.name).toBe('col');
    });
});
