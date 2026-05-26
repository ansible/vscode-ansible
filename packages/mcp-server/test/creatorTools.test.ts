import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadSchema = vi.fn();
const mockGetPositionalArgs = vi.fn();
const mockBuildCommandString = vi.fn();
const mockRunCommand = vi.fn();

vi.mock('@ansible/core', () => ({
    CreatorService: {
        getInstance: vi.fn(() => ({
            loadSchema: mockLoadSchema,
            getPositionalArgs: mockGetPositionalArgs,
            buildCommandString: mockBuildCommandString,
            runCommand: mockRunCommand,
        })),
    },
}));

import { CreatorToolGenerator } from '../src/creatorTools';

const mockSchema = {
    name: 'ansible-creator',
    subcommands: {
        init: {
            name: 'init',
            subcommands: {
                playbook: {
                    name: 'playbook',
                    description: 'Create a playbook project',
                    parameters: {
                        type: 'object',
                        properties: {
                            project: { type: 'string', description: 'Project name' },
                            output: {
                                type: 'string',
                                description: 'Output dir',
                                aliases: ['--output'],
                            },
                        },
                        required: ['project'],
                    },
                },
            },
        },
    },
};

describe('CreatorToolGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLoadSchema.mockResolvedValue(mockSchema);
        mockGetPositionalArgs.mockReturnValue(['project']);
        mockBuildCommandString.mockReturnValue('ansible-creator init playbook myproj --output /out --overwrite');
        mockRunCommand.mockResolvedValue('done');
    });

    it('initialize() generates tools from schema', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        expect(mockLoadSchema).toHaveBeenCalledTimes(1);
        expect(gen.isInitialized()).toBe(true);
        const tools = gen.getTools();
        expect(tools.length).toBe(1);
        expect(tools[0].name).toBe('ac_init_play');
        expect(tools[0].description).toContain('Create a playbook project');
        expect(tools[0].description).toContain('ansible-creator init playbook');
    });

    it('getTools() returns generated tool definitions with inputSchema', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const tools = gen.getTools();
        expect(tools[0].inputSchema.type).toBe('object');
        expect(tools[0].inputSchema.properties).toMatchObject({
            project: expect.objectContaining({ type: 'string', description: 'Project name' }),
            output: expect.objectContaining({ type: 'string' }),
        });
        expect(tools[0].inputSchema.required).toEqual(['project']);
    });

    it('initialize() is idempotent', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();
        await gen.initialize();

        expect(mockLoadSchema).toHaveBeenCalledTimes(1);
    });

    it('does not set initialized when loadSchema returns null', async () => {
        mockLoadSchema.mockResolvedValue(null);
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        expect(gen.isInitialized()).toBe(false);
        expect(gen.getTools()).toEqual([]);
    });

    it('handleTool returns error for unknown ac_ tool', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('ac_unknown_leaf', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown creator tool');
    });

    it('handleTool routes to CreatorService.runCommand with path and merged params', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('ac_init_play', {
            project: 'myproj',
            output: '/out',
        });

        expect(mockGetPositionalArgs).toHaveBeenCalledWith(['init', 'playbook']);
        expect(mockBuildCommandString).toHaveBeenCalled();
        const buildArgs = mockBuildCommandString.mock.calls[0];
        expect(buildArgs[0]).toEqual(['init', 'playbook']);
        expect(buildArgs[1]).toMatchObject({
            project: 'myproj',
            output: '/out',
            overwrite: true,
        });

        expect(mockRunCommand).toHaveBeenCalledWith(
            ['init', 'playbook'],
            expect.objectContaining({
                project: 'myproj',
                output: '/out',
                overwrite: true,
            }),
            ['project'],
        );

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('[SUCCESS]');
        expect(result.content[0].text).toContain('done');
    });

    it('handleTool returns terminal-style message when runCommand resolves undefined', async () => {
        mockRunCommand.mockResolvedValue(undefined);
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('ac_init_play', { project: 'p' });

        expect(result.content[0].text).toContain('[TERMINAL]');
        expect(result.content[0].text).toContain('VS Code terminal');
    });

    it('handleTool surfaces errors and hints when command is not found', async () => {
        mockRunCommand.mockRejectedValue(new Error('ansible-creator: command not found'));
        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const result = await gen.handleTool('ac_init_play', { project: 'p' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('[ERROR]');
        expect(result.content[0].text).toContain('[HINT]');
    });

    it('tool names use ac_ prefix and shortened segments', async () => {
        mockLoadSchema.mockResolvedValue({
            name: 'root',
            subcommands: {
                init: {
                    name: 'init',
                    subcommands: {
                        playbook: {
                            name: 'playbook',
                            description: 'P',
                            parameters: { type: 'object', properties: {}, required: [] },
                        },
                    },
                },
            },
        });

        const gen = new CreatorToolGenerator();
        await gen.initialize();

        expect(gen.getTools().every((t) => t.name.startsWith('ac_'))).toBe(true);
        expect(gen.getTools()[0].name).toBe('ac_init_play');
    });

    it('refresh() clears tools and reloads schema', async () => {
        const gen = new CreatorToolGenerator();
        await gen.initialize();
        mockLoadSchema.mockClear();

        await gen.refresh();

        expect(mockLoadSchema).toHaveBeenCalledTimes(1);
        expect(gen.getTools().length).toBe(1);
    });

    it('maps boolean, enum, and default parameter types from schema', async () => {
        mockLoadSchema.mockResolvedValue({
            name: 'ansible-creator',
            subcommands: {
                sample: {
                    name: 'sample',
                    subcommands: {
                        leaf: {
                            name: 'leaf',
                            description: 'Leaf cmd',
                            parameters: {
                                type: 'object',
                                properties: {
                                    dry_run: { type: 'boolean', description: 'Dry run' },
                                    format: {
                                        type: 'string',
                                        description: 'Fmt',
                                        enum: ['json', 'yaml'],
                                    },
                                    count: {
                                        type: 'integer',
                                        description: 'Count',
                                        default: 1,
                                    },
                                },
                                required: [],
                            },
                        },
                    },
                },
            },
        });

        const gen = new CreatorToolGenerator();
        await gen.initialize();

        const tool = gen.getTools().find((t) => t.name === 'ac_sample_leaf');
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties).toMatchObject({
            dry_run: { type: 'boolean', description: 'Dry run' },
            format: { type: 'string', enum: ['json', 'yaml'] },
            count: expect.objectContaining({ type: 'string', default: 1 }),
        });
    });
});
