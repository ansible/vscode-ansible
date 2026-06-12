import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { EECache } from '../../src/services/EECache';
import type { EEDetails } from '../../src/services/ExecutionEnvService';

const SAMPLE_DETAILS: EEDetails = {
    ansible_collections: {
        details: { 'ansible.builtin': '2.19.0', 'community.general': '10.2.0' },
    },
    ansible_version: { details: 'ansible [core 2.19.0]' },
    os_release: {
        details: [{ 'pretty-name': 'Fedora Linux 43', name: 'Fedora', version: '43' }],
    },
    python_packages: {
        details: [
            { name: 'ansible-core', version: '2.19.0' },
            { name: 'jinja2', version: '3.1.4' },
        ],
    },
    image_name: 'quay.io/ansible/ee-supported:latest',
};

describe('EECache', () => {
    let tmpDir: string;
    let cache: EECache;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-cache-test-'));
        cache = new EECache(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts empty', () => {
        expect(cache.size).toBe(0);
        expect(cache.has('sha256:abc123')).toBe(false);
        expect(cache.get('sha256:abc123')).toBeNull();
    });

    it('set and get round-trip', () => {
        const sha = 'sha256:aabbccddee11';
        cache.set(sha, 'quay.io/ansible/ee-supported:latest', SAMPLE_DETAILS);

        expect(cache.has(sha)).toBe(true);
        expect(cache.size).toBe(1);

        const retrieved = cache.get(sha);
        expect(retrieved).toEqual(SAMPLE_DETAILS);
    });

    it('persists to disk and survives new instance', () => {
        const sha = 'sha256:persistent1234';
        cache.set(sha, 'img:latest', SAMPLE_DETAILS);

        const cache2 = new EECache(tmpDir);
        expect(cache2.has(sha)).toBe(true);
        expect(cache2.get(sha)).toEqual(SAMPLE_DETAILS);
    });

    it('index entry stores metadata', () => {
        const sha = 'sha256:metadata5678';
        cache.set(sha, 'quay.io/ansible/ee-minimal:2.19', SAMPLE_DETAILS);

        const entry = cache.getEntry(sha);
        expect(entry).toBeDefined();
        expect(entry?.fullName).toBe('quay.io/ansible/ee-minimal:2.19');
        expect(entry?.tag).toBe('2.19');
        expect(entry?.introspectedAt).toBeDefined();
    });

    it('delete removes entry', () => {
        const sha = 'sha256:deleteme1234';
        cache.set(sha, 'img:tag', SAMPLE_DETAILS);
        expect(cache.has(sha)).toBe(true);

        cache.remove(sha);
        expect(cache.has(sha)).toBe(false);
        expect(cache.get(sha)).toBeNull();
        expect(cache.size).toBe(0);
    });

    it('prune removes stale entries', () => {
        cache.set('sha256:keep1111', 'img1:latest', SAMPLE_DETAILS);
        cache.set('sha256:keep2222', 'img2:latest', SAMPLE_DETAILS);
        cache.set('sha256:stale3333', 'img3:old', SAMPLE_DETAILS);

        const currentShas = new Set(['sha256:keep1111', 'sha256:keep2222']);
        const removed = cache.prune(currentShas);

        expect(removed).toBe(1);
        expect(cache.has('sha256:keep1111')).toBe(true);
        expect(cache.has('sha256:keep2222')).toBe(true);
        expect(cache.has('sha256:stale3333')).toBe(false);
        expect(cache.size).toBe(2);
    });

    it('clear removes everything', () => {
        cache.set('sha256:one1111', 'img1:latest', SAMPLE_DETAILS);
        cache.set('sha256:two2222', 'img2:latest', SAMPLE_DETAILS);
        expect(cache.size).toBe(2);

        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.keys()).toEqual([]);
    });

    it('has returns false if index entry exists but file is missing', () => {
        const sha = 'sha256:orphan1234';
        cache.set(sha, 'img:tag', SAMPLE_DETAILS);

        // Manually delete the detail file to simulate corruption
        const files = fs
            .readdirSync(tmpDir)
            .filter((f) => f.endsWith('.json') && f !== 'index.json');
        for (const f of files) {
            fs.unlinkSync(path.join(tmpDir, f));
        }

        expect(cache.has(sha)).toBe(false);
    });

    it('multiple tags pointing to same SHA share one entry', () => {
        const sha = 'sha256:shared1234';
        cache.set(sha, 'img:latest', SAMPLE_DETAILS);
        cache.set(sha, 'img:v2.0', SAMPLE_DETAILS);

        expect(cache.size).toBe(1);
        const entry = cache.getEntry(sha);
        expect(entry?.fullName).toBe('img:v2.0');
    });
});
