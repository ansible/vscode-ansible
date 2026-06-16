import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const httpResponses = vi.hoisted(() => {
    const map = new Map<string, string | undefined>();
    return {
        map,
        reset: () => {
            map.clear();
        },
        set: (key: string, value: string | undefined) => map.set(key, value),
    };
});

vi.mock('https', () => ({
    get: vi.fn((url: string | URL, opts: unknown, cb?: unknown) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const callback = typeof opts === 'function' ? opts : cb;

        let body: string | undefined;
        for (const [key, val] of httpResponses.map.entries()) {
            if (urlStr.endsWith(key)) {
                body = val;
                break;
            }
        }

        const statusCode = body !== undefined ? 200 : 404;
        const res = {
            statusCode,
            headers: {},
            on: vi.fn((event: string, handler: (data?: Buffer) => void) => {
                if (statusCode === 200 && body !== undefined) {
                    if (event === 'data') handler(Buffer.from(body));
                    if (event === 'end') handler();
                }
                return res;
            }),
        };

        if (typeof callback === 'function') {
            (callback as (res: unknown) => void)(res);
        }

        return {
            on: vi.fn(),
            setTimeout: vi.fn(),
            destroy: vi.fn(),
        };
    }),
}));

import { SkillRegistry, _resetGitHubToken } from '../../src/SkillRegistry';
import type { SkillSource } from '../../src/SkillRegistry';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-reg-test-'));
    SkillRegistry.setCacheDir(tempDir);
    SkillRegistry.resetInstance();
    _resetGitHubToken();
});

afterEach(() => {
    _resetGitHubToken();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SkillRegistry', () => {
    it('returns the same singleton from getInstance', () => {
        const a = SkillRegistry.getInstance();
        const b = SkillRegistry.getInstance();
        expect(a).toBe(b);
    });

    it('starts with no skills loaded', () => {
        const reg = SkillRegistry.getInstance();
        expect(reg.isLoaded()).toBe(false);
        expect(reg.getAllSkills()).toEqual([]);
    });

    it('loads skills from a local source', async () => {
        const skillDir = path.join(tempDir, 'local-skills', 'test-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
            path.join(skillDir, 'SKILL.md'),
            `---
name: Test Skill
description: A test skill for unit testing
category: sdlc
triggers:
  - test me
  - run test
tags:
  - testing
---
# Test Skill

This is the body of the skill.`,
        );

        const source: SkillSource = {
            id: 'test-local',
            type: 'local',
            url: path.join(tempDir, 'local-skills'),
            trust: 'private',
        };

        const reg = SkillRegistry.getInstance();
        reg.setSources([source]);
        await reg.ensureLoaded();

        expect(reg.isLoaded()).toBe(true);
        const skills = reg.getAllSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('Test Skill');
        expect(skills[0].description).toBe('A test skill for unit testing');
        expect(skills[0].category).toBe('sdlc');
        expect(skills[0].triggers).toEqual(['test me', 'run test']);
        expect(skills[0].trust).toBe('private');
        expect(skills[0].content).toContain('This is the body of the skill.');
    });

    it('handles SKILL.md without frontmatter', async () => {
        const skillDir = path.join(tempDir, 'local-skills', 'bare-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Just a heading\n\nBody content here.');

        const source: SkillSource = {
            id: 'bare-test',
            type: 'local',
            url: path.join(tempDir, 'local-skills'),
            trust: 'community',
        };

        const reg = SkillRegistry.getInstance();
        reg.setSources([source]);
        await reg.ensureLoaded();

        const skills = reg.getAllSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('bare-skill');
        expect(skills[0].category).toBe('other');
    });

    it('loads skills from cache on second call', async () => {
        const skillDir = path.join(tempDir, 'cached', 'my-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
            path.join(skillDir, 'SKILL.md'),
            '---\nname: Cached Skill\ndescription: cache test\n---\nBody.',
        );

        const source: SkillSource = {
            id: 'cache-test',
            type: 'local',
            url: path.join(tempDir, 'cached'),
            trust: 'community',
        };

        // First load
        const reg1 = SkillRegistry.getInstance();
        reg1.setSources([source]);
        await reg1.ensureLoaded();
        expect(reg1.getAllSkills()).toHaveLength(1);

        // New instance, same cache dir
        SkillRegistry.resetInstance();
        const reg2 = SkillRegistry.getInstance();
        reg2.setSources([source]);
        await reg2.ensureLoaded();
        expect(reg2.getAllSkills()).toHaveLength(1);
        expect(reg2.getSkill('cache-test/my-skill')?.name).toBe('Cached Skill');
    });

    describe('search', () => {
        it('finds skills by name', async () => {
            const base = path.join(tempDir, 'search-test');
            for (const s of ['code-review', 'deploy-app', 'write-test']) {
                const dir = path.join(base, s);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'SKILL.md'),
                    `---\nname: ${s}\ndescription: ${s} desc\ncategory: sdlc\ntags:\n  - ${s.split('-')[0]}\n---\nBody of ${s}`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'search', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();

            const results = reg.search('review');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('code-review');
        });

        it('filters by category', async () => {
            const base = path.join(tempDir, 'cat-test');
            for (const [name, cat] of [
                ['lint', 'standards'],
                ['build', 'workflow'],
            ] as const) {
                const dir = path.join(base, name);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'SKILL.md'),
                    `---\nname: ${name}\ndescription: ${name}\ncategory: ${cat}\n---\nBody`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'cat', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();

            const results = reg.search('', { category: 'standards' });
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('lint');
        });
    });

    describe('loadSkillContent', () => {
        it('returns content for a local skill', async () => {
            const skillDir = path.join(tempDir, 'content-test', 'my-skill');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(
                path.join(skillDir, 'SKILL.md'),
                '---\nname: Content Skill\n---\nThe full body.',
            );

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'content',
                    type: 'local',
                    url: path.join(tempDir, 'content-test'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const content = await reg.loadSkillContent('content/my-skill');
            expect(content).toContain('The full body.');
        });

        it('returns undefined for unknown skill ID', async () => {
            const reg = SkillRegistry.getInstance();
            reg.setSources([]);
            await reg.ensureLoaded();

            const content = await reg.loadSkillContent('nonexistent/skill');
            expect(content).toBeUndefined();
        });
    });

    describe('trigger normalization', () => {
        it('handles comma-separated trigger strings', async () => {
            const skillDir = path.join(tempDir, 'trigger-test', 'skill-a');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(
                path.join(skillDir, 'SKILL.md'),
                '---\nname: Trigger Skill\ntriggers: "build, deploy, test"\n---\nBody',
            );

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'trig',
                    type: 'local',
                    url: path.join(tempDir, 'trigger-test'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const skill = reg.getSkill('trig/skill-a');
            expect(skill?.triggers).toEqual(['build', 'deploy', 'test']);
        });
    });

    describe('GitHub token resolution', () => {
        it('uses GITHUB_TOKEN env var when available', async () => {
            const orig = process.env.GITHUB_TOKEN;
            process.env.GITHUB_TOKEN = 'test-token-123';
            _resetGitHubToken();

            const reg = SkillRegistry.getInstance();
            // Just verify it doesn't crash — actual HTTP calls are out of scope
            reg.setSources([]);
            await reg.ensureLoaded();
            expect(reg.isLoaded()).toBe(true);

            if (orig === undefined) {
                delete process.env.GITHUB_TOKEN;
            } else {
                process.env.GITHUB_TOKEN = orig;
            }
        });
    });

    describe('cache invalidation', () => {
        it('invalidates cache when source URL changes', async () => {
            for (const name of ['dir-a', 'dir-b']) {
                const skillDir = path.join(tempDir, name, 'my-skill');
                fs.mkdirSync(skillDir, { recursive: true });
                fs.writeFileSync(
                    path.join(skillDir, 'SKILL.md'),
                    `---\nname: Skill from ${name}\n---\nBody`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'changing-source',
                    type: 'local',
                    url: path.join(tempDir, 'dir-a'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();
            expect(reg.getSkill('changing-source/my-skill')?.name).toBe('Skill from dir-a');

            SkillRegistry.resetInstance();
            const reg2 = SkillRegistry.getInstance();
            reg2.setSources([
                {
                    id: 'changing-source',
                    type: 'local',
                    url: path.join(tempDir, 'dir-b'),
                    trust: 'community',
                },
            ]);
            await reg2.ensureLoaded();
            expect(reg2.getSkill('changing-source/my-skill')?.name).toBe('Skill from dir-b');
        });
    });

    describe('refresh', () => {
        it('force-reloads skills from sources', async () => {
            const skillDir = path.join(tempDir, 'refresh-test', 'my-skill');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Original\n---\nBody');

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'refresh-src',
                    type: 'local',
                    url: path.join(tempDir, 'refresh-test'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();
            expect(reg.getSkill('refresh-src/my-skill')?.name).toBe('Original');

            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Updated\n---\nNew body');
            await reg.refresh();
            expect(reg.getSkill('refresh-src/my-skill')?.name).toBe('Updated');
        });
    });

    describe('search advanced', () => {
        it('filters by domain', async () => {
            const base = path.join(tempDir, 'domain-test');
            for (const [name, domain] of [
                ['cloud-skill', 'cloud'],
                ['network-skill', 'network'],
            ] as const) {
                const dir = path.join(base, name);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'SKILL.md'),
                    `---\nname: ${name}\ndescription: ${name}\ndomain: ${domain}\n---\nBody`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'dom', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();

            const results = reg.search('', { domain: 'cloud' });
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('cloud-skill');
        });

        it('filters by source', async () => {
            const base1 = path.join(tempDir, 'src1');
            const base2 = path.join(tempDir, 'src2');
            for (const [base, id] of [
                [base1, 'source-a'],
                [base2, 'source-b'],
            ] as const) {
                const dir = path.join(base, 'skill');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'SKILL.md'),
                    `---\nname: skill-from-${id}\n---\nBody`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                { id: 'source-a', type: 'local', url: base1, trust: 'community' },
                { id: 'source-b', type: 'local', url: base2, trust: 'certified' },
            ]);
            await reg.ensureLoaded();

            const results = reg.search('', { source: 'source-b' });
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('skill-from-source-b');
        });

        it('respects limit', async () => {
            const base = path.join(tempDir, 'limit-test');
            for (let i = 0; i < 5; i++) {
                const dir = path.join(base, `skill-${String(i)}`);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    path.join(dir, 'SKILL.md'),
                    `---\nname: skill-${String(i)}\ndescription: test\n---\nBody`,
                );
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'lim', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();

            const results = reg.search('', { limit: 2 });
            expect(results).toHaveLength(2);
        });
    });

    describe('loadSkillContent for cached skill', () => {
        it('returns cached content on second call without refetch', async () => {
            const skillDir = path.join(tempDir, 'cache-content', 'my-skill');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(
                path.join(skillDir, 'SKILL.md'),
                '---\nname: Cached Content\n---\nBody text here.',
            );

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'cc',
                    type: 'local',
                    url: path.join(tempDir, 'cache-content'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const first = await reg.loadSkillContent('cc/my-skill');
            const second = await reg.loadSkillContent('cc/my-skill');
            expect(first).toBe(second);
            expect(first).toContain('Body text here.');
        });

        it('returns undefined when source is missing', async () => {
            const skillDir = path.join(tempDir, 'orphan', 'my-skill');
            fs.mkdirSync(skillDir, { recursive: true });
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Orphan\n---\nBody');

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'orphan-src',
                    type: 'local',
                    url: path.join(tempDir, 'orphan'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            // Remove the source so loadSkillContent can't find it
            reg.setSources([]);
            const content = await reg.loadSkillContent('orphan-src/my-skill');
            expect(content).toBeUndefined();
        });
    });

    describe('local source edge cases', () => {
        it('returns empty array for nonexistent directory', async () => {
            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'missing',
                    type: 'local',
                    url: path.join(tempDir, 'does-not-exist'),
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(0);
        });

        it('skips non-directory entries', async () => {
            const base = path.join(tempDir, 'mixed');
            fs.mkdirSync(base, { recursive: true });
            fs.writeFileSync(path.join(base, 'not-a-dir.txt'), 'just a file');
            const skillDir = path.join(base, 'real-skill');
            fs.mkdirSync(skillDir);
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Real\n---\nBody');

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'mix', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(1);
            expect(reg.getAllSkills()[0].name).toBe('Real');
        });

        it('skips directories without SKILL.md', async () => {
            const base = path.join(tempDir, 'no-skill');
            fs.mkdirSync(path.join(base, 'empty-dir'), { recursive: true });
            fs.mkdirSync(path.join(base, 'has-skill'));
            fs.writeFileSync(
                path.join(base, 'has-skill', 'SKILL.md'),
                '---\nname: Present\n---\nBody',
            );

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'no', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(1);
        });
    });

    describe('registry source (placeholder)', () => {
        it('returns empty for registry type', async () => {
            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'reg-src',
                    type: 'registry',
                    url: 'https://example.com/registry',
                    trust: 'certified',
                },
            ]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(0);
        });
    });

    describe('GitHub source with mocked HTTP', () => {
        beforeEach(() => {
            httpResponses.reset();
        });

        afterEach(() => {
            httpResponses.reset();
        });

        it('detects lola format from lola-market.yml', async () => {
            const manifest = `
name: test-forge
modules:
  - name: my-module
    description: A test module
    path: my-module/module
    tags: [sdlc]
`;
            const skillMd =
                '---\nname: commit\ndescription: Commit changes\ncategory: sdlc\n---\nCommit body';
            httpResponses.set(
                'contents/lola-market.yml',
                JSON.stringify({ name: 'lola-market.yml' }),
            );
            httpResponses.set('main/lola-market.yml', manifest);
            httpResponses.set(
                'contents/my-module/module/skills',
                JSON.stringify([{ name: 'commit', type: 'dir' }]),
            );
            httpResponses.set('my-module/module/skills/commit/SKILL.md', skillMd);
            httpResponses.set('my-module/module/AGENTS.md', '# Agents');

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'lola-test',
                    type: 'github',
                    url: 'https://github.com/test-org/test-repo',
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            expect(skills.length).toBeGreaterThan(0);
            expect(skills[0].name).toBe('commit');
            expect(skills[0].category).toBe('sdlc');
        });

        it('detects vercel format from skills/ directory', async () => {
            const skillMd =
                '---\nname: review-code\ndescription: Code review\ntype: review\n---\nReview instructions';
            httpResponses.set(
                'contents/skills',
                JSON.stringify([
                    { name: 'review-code', type: 'dir' },
                    { name: '.hidden', type: 'dir' },
                ]),
            );
            httpResponses.set('skills/review-code/SKILL.md', skillMd);

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'vercel-test',
                    type: 'github',
                    url: 'https://github.com/test-org/harness-repo',
                    trust: 'partner',
                },
            ]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            expect(skills.length).toBeGreaterThan(0);
            expect(skills[0].name).toBe('review-code');
            expect(skills[0].trust).toBe('partner');
            expect(skills[0].category).toBe('standards');
        });

        it('falls back to generic format when no markers found', async () => {
            const skillMd = '---\nname: my-tool\ndescription: A generic tool\n---\nGeneric body';
            httpResponses.set(
                'generic-repo/contents/',
                JSON.stringify([
                    { name: 'my-tool', type: 'dir' },
                    { name: '.git', type: 'dir' },
                    { name: 'README.md', type: 'file' },
                ]),
            );
            httpResponses.set('main/my-tool/SKILL.md', skillMd);

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'generic-test',
                    type: 'github',
                    url: 'https://github.com/test-org/generic-repo',
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            expect(skills.length).toBeGreaterThan(0);
            expect(skills[0].name).toBe('my-tool');
        });

        it('returns empty for non-GitHub URL in github source', async () => {
            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'bad-url',
                    type: 'github',
                    url: 'https://not-github.example.com/repo',
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(0);
        });

        it('detects lola from marketplace/ directory', async () => {
            const manifest = `
name: marketplace-collection
modules:
  - name: basics
    description: Basic skills
    path: basics/module
`;
            httpResponses.set(
                'agentic-collections/contents/marketplace',
                JSON.stringify([{ name: 'catalog.yml', type: 'file' }]),
            );
            httpResponses.set('agentic-collections/main/marketplace/catalog.yml', manifest);
            httpResponses.set(
                'agentic-collections/contents/basics/module/skills',
                JSON.stringify([]),
            );
            httpResponses.set('agentic-collections/main/basics/module/AGENTS.md', '# Basics agent');
            httpResponses.set(
                'agentic-collections/contents/',
                JSON.stringify([{ name: 'basics', type: 'dir' }]),
            );

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'marketplace-test',
                    type: 'github',
                    url: 'https://github.com/test-org/agentic-collections',
                    trust: 'certified',
                },
            ]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            expect(skills.length).toBeGreaterThan(0);
        });

        it('discovers unlisted modules in lola repos', async () => {
            const manifest = `
name: partial-forge
modules:
  - name: listed-mod
    path: listed-mod/module
`;
            const listedSkillMd = '---\nname: listed-skill\n---\nListed body';
            const unlistedSkillMd = '---\nname: unlisted-skill\n---\nUnlisted body';

            httpResponses.set(
                'partial-forge/contents/lola-market.yml',
                JSON.stringify({ name: 'lola-market.yml' }),
            );
            httpResponses.set('partial-forge/main/lola-market.yml', manifest);
            httpResponses.set(
                'partial-forge/contents/listed-mod/module/skills',
                JSON.stringify([{ name: 'listed-skill', type: 'dir' }]),
            );
            httpResponses.set(
                'partial-forge/main/listed-mod/module/skills/listed-skill/SKILL.md',
                listedSkillMd,
            );
            httpResponses.set('partial-forge/main/listed-mod/module/AGENTS.md', '# Agents');
            httpResponses.set(
                'partial-forge/contents/',
                JSON.stringify([
                    { name: 'listed-mod', type: 'dir' },
                    { name: 'extra-mod', type: 'dir' },
                    { name: '.git', type: 'dir' },
                ]),
            );
            httpResponses.set(
                'partial-forge/contents/extra-mod/module/skills',
                JSON.stringify([{ name: 'unlisted-skill', type: 'dir' }]),
            );
            httpResponses.set(
                'partial-forge/main/extra-mod/module/skills/unlisted-skill/SKILL.md',
                unlistedSkillMd,
            );
            httpResponses.set('partial-forge/main/extra-mod/module/AGENTS.md', '# Extra agents');

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'partial',
                    type: 'github',
                    url: 'https://github.com/test-org/partial-forge',
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            const names = skills.map((s) => s.name);
            expect(names).toContain('listed-skill');
            expect(names).toContain('unlisted-skill');
        });

        it('loads skill content on demand via contentUrl', async () => {
            const skillMd =
                '---\nname: on-demand\ndescription: test\n---\nFull content loaded on demand.';
            httpResponses.set(
                'contents/skills',
                JSON.stringify([{ name: 'on-demand', type: 'dir' }]),
            );
            httpResponses.set('skills/on-demand/SKILL.md', skillMd);

            const reg = SkillRegistry.getInstance();
            reg.setSources([
                {
                    id: 'demand-test',
                    type: 'github',
                    url: 'https://github.com/test-org/demand-repo',
                    trust: 'community',
                },
            ]);
            await reg.ensureLoaded();

            const skill = reg.getSkill('demand-test/on-demand');
            expect(skill).toBeDefined();

            const content = await reg.loadSkillContent('demand-test/on-demand');
            expect(content).toContain('Full content loaded on demand.');
        });
    });

    describe('category inference', () => {
        it('infers sdlc from name', async () => {
            const base = path.join(tempDir, 'infer');
            for (const name of ['sdlc-helper', 'lifecycle-check', 'workflow-runner']) {
                const dir = path.join(base, name);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\nBody`);
            }

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'inf', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();

            const skills = reg.getAllSkills();
            const sdlcSkill = skills.find((s) => s.name === 'sdlc-helper');
            expect(sdlcSkill).toBeDefined();
        });
    });

    describe('ensureLoaded idempotency', () => {
        it('does not reload if already loaded', async () => {
            const base = path.join(tempDir, 'idem');
            const dir = path.join(base, 'skill');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: Idem\n---\nBody');

            const reg = SkillRegistry.getInstance();
            reg.setSources([{ id: 'idem', type: 'local', url: base, trust: 'community' }]);
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(1);

            // Second call should be a no-op
            await reg.ensureLoaded();
            expect(reg.getAllSkills()).toHaveLength(1);
        });
    });
});
