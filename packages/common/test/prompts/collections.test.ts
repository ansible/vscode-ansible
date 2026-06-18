import { describe, it, expect } from 'vitest';
import {
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildGalaxyPluginExplanationPrompt,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
} from '../../src/prompts/collections';

describe('collections prompts', () => {
    describe('buildCollectionsSummaryPrompt', () => {
        it('includes MCP tool reference', () => {
            const result = buildCollectionsSummaryPrompt();
            expect(result).toContain('list_ansible_collections');
            expect(result).toContain('search_available_collections');
        });

        it('includes install guidance', () => {
            const result = buildCollectionsSummaryPrompt();
            expect(result).toContain('install_ansible_collection');
            expect(result).toContain('Do NOT suggest using');
        });
    });

    describe('buildCollectionSummaryPrompt', () => {
        it('includes collection name and tool reference', () => {
            const result = buildCollectionSummaryPrompt('cisco.nxos');
            expect(result).toContain('cisco.nxos');
            expect(result).toContain('get_collection_plugins');
        });
    });

    describe('buildPluginExplanationPrompt', () => {
        it('includes plugin name, type, and tool reference', () => {
            const result = buildPluginExplanationPrompt('ansible.builtin.copy', 'module');
            expect(result).toContain('ansible.builtin.copy');
            expect(result).toContain('module');
            expect(result).toContain('get_plugin_documentation');
        });
    });

    describe('buildGalaxyPluginExplanationPrompt', () => {
        it('includes collection, plugin name, and Galaxy tool reference', () => {
            const result = buildGalaxyPluginExplanationPrompt('cisco.ios', 'ios_acls', 'module');
            expect(result).toContain('cisco.ios');
            expect(result).toContain('ios_acls');
            expect(result).toContain('module');
            expect(result).toContain('get_galaxy_plugin_doc');
        });
    });

    describe('buildCollectionSourcesOverviewPrompt', () => {
        it('includes Galaxy count and org details', () => {
            const result = buildCollectionSourcesOverviewPrompt({
                galaxyCount: 1500,
                githubOrgs: [
                    { name: 'ansible-network', count: 12 },
                    { name: 'redhat-cop', count: 8 },
                ],
            });
            expect(result).toContain('1,500');
            expect(result).toContain('ansible-network: 12 collections');
            expect(result).toContain('redhat-cop: 8 collections');
            expect(result).toContain('20 total');
        });
    });

    describe('buildGalaxySourceSummaryPrompt', () => {
        it('includes count and tool references', () => {
            const result = buildGalaxySourceSummaryPrompt(2000);
            expect(result).toContain('2,000');
            expect(result).toContain('list_source_collections');
            expect(result).toContain('install_ansible_collection');
        });
    });

    describe('buildGithubOrgSourceSummaryPrompt', () => {
        it('includes org name and count', () => {
            const result = buildGithubOrgSourceSummaryPrompt('ansible-network', 15);
            expect(result).toContain('ansible-network');
            expect(result).toContain('15');
            expect(result).toContain('list_source_collections');
        });
    });
});
