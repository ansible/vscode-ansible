import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillRegistry, _resetGitHubToken } from '@ansible/core';
import { SkillToolGenerator } from '../src/skillTools';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tools-test-'));
    SkillRegistry.setCacheDir(tempDir);
    SkillRegistry.resetInstance();
    _resetGitHubToken();

    // Set up a local skill source for testing
    const skillDir = path.join(tempDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
name: Test Skill
description: A skill for testing
category: sdlc
triggers:
  - run tests
  - unit test
tags:
  - test
  - ci
---
# Test Skill

Follow these instructions to run tests.`,
    );

    const reg = SkillRegistry.getInstance();
    reg.setSources([
        {
            id: 'test-source',
            type: 'local',
            url: path.join(tempDir, 'skills'),
            trust: 'community',
        },
    ]);
});

afterEach(() => {
    _resetGitHubToken();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SkillToolGenerator', () => {
    it('getTools returns four tool definitions', () => {
        const gen = new SkillToolGenerator();
        const tools = gen.getTools();
        expect(tools).toHaveLength(4);
        const names = tools.map((t) => t.name);
        expect(names).toContain('skill_search');
        expect(names).toContain('skill_list');
        expect(names).toContain('skill_get');
        expect(names).toContain('skill_list_sources');
    });

    it('isSkillTool identifies skill tools', () => {
        const gen = new SkillToolGenerator();
        expect(gen.isSkillTool('skill_search')).toBe(true);
        expect(gen.isSkillTool('skill_list')).toBe(true);
        expect(gen.isSkillTool('skill_get')).toBe(true);
        expect(gen.isSkillTool('skill_list_sources')).toBe(true);
        expect(gen.isSkillTool('other_tool')).toBe(false);
    });

    it('skill_search finds matching skills', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_search', { query: 'test' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('Test Skill');
    });

    it('skill_search returns friendly message when no matches', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_search', {
            query: 'nonexistent-xyz-abc',
        });
        expect(result.content[0].text).toContain('No skills found');
    });

    it('skill_search requires query parameter', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_search', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('query');
    });

    it('skill_list returns all skills', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_list', {});
        expect(result.content[0].text).toContain('Test Skill');
        expect(result.content[0].text).toContain('Available skills');
    });

    it('skill_get returns full skill content', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_get', {
            skill_id: 'test-source/test-skill',
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('Follow these instructions');
        expect(result.content[0].text).toContain('Test Skill');
    });

    it('skill_get requires skill_id parameter', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_get', {});
        expect(result.isError).toBe(true);
    });

    it('skill_get returns error for unknown skill', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_get', {
            skill_id: 'nonexistent/skill',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Skill not found');
    });

    it('skill_list_sources shows configured sources', async () => {
        const gen = new SkillToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('skill_list_sources', {});
        expect(result.content[0].text).toContain('test-source');
        expect(result.content[0].text).toContain('community');
    });
});
