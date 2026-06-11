import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillRegistry, _resetGitHubToken } from '../../src/services/SkillRegistry';
import type { SkillSource } from '../../src/services/SkillRegistry';

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
            // Create two different local skill dirs
            for (const name of ['dir-a', 'dir-b']) {
                const skillDir = path.join(tempDir, name, 'my-skill');
                fs.mkdirSync(skillDir, { recursive: true });
                fs.writeFileSync(
                    path.join(skillDir, 'SKILL.md'),
                    `---\nname: Skill from ${name}\n---\nBody`,
                );
            }

            // Load from dir-a
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

            // Change URL to dir-b, new instance
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
});
