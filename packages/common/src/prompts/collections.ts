/**
 * AI prompt builders for Ansible collections.
 * Each builder imports a skill markdown file and appends dynamic context.
 */

import { stripFrontmatter } from '../utils/skillHelpers';

import explainPluginSkill from '../skills/explain-plugin.content';
import summarizeCollectionsSkill from '../skills/summarize-collections.content';
import summarizeCollectionSkill from '../skills/summarize-collection.content';
import overviewCollectionSourcesSkill from '../skills/overview-collection-sources.content';
import summarizeGalaxySourceSkill from '../skills/summarize-galaxy-source.content';
import summarizeGithubSourceSkill from '../skills/summarize-github-source.content';

/**
 * Build a prompt to summarize all installed collections in the workspace.
 *
 * @returns Prompt instructing the AI to list and categorize installed collections.
 */
export function buildCollectionsSummaryPrompt(): string {
    return stripFrontmatter(summarizeCollectionsSkill);
}

/**
 * Build a prompt to summarize a single collection.
 *
 * @param collectionName - Fully qualified collection name (e.g. "cisco.nxos").
 * @returns Prompt instructing the AI to describe the collection's plugins and use cases.
 */
export function buildCollectionSummaryPrompt(collectionName: string): string {
    return `${stripFrontmatter(summarizeCollectionSkill)}\nCollection: ${collectionName}`;
}

/**
 * Build a prompt to explain a specific installed plugin.
 *
 * @param fullName - Fully qualified plugin name (e.g. "ansible.builtin.copy").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt instructing the AI to document the plugin with examples.
 */
export function buildPluginExplanationPrompt(fullName: string, pluginType: string): string {
    return (
        `${stripFrontmatter(explainPluginSkill)}\n` +
        `Plugin: ${fullName}\n` +
        `Type: ${pluginType}\n` +
        `Source: installed\n` +
        `MCP Tool: get_plugin_documentation`
    );
}

/**
 * Build an AI prompt to describe a Galaxy plugin (not installed).
 *
 * @param collectionFqcn - Collection namespace.name (e.g. "cisco.ios").
 * @param pluginName - Short plugin name (e.g. "ios_acls").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt instructing the AI to fetch and explain the Galaxy plugin.
 */
export function buildGalaxyPluginExplanationPrompt(
    collectionFqcn: string,
    pluginName: string,
    pluginType: string,
): string {
    return (
        `${stripFrontmatter(explainPluginSkill)}\n` +
        `Plugin: ${pluginName}\n` +
        `Type: ${pluginType}\n` +
        `Collection: ${collectionFqcn}\n` +
        `Source: Galaxy\n` +
        `MCP Tool: get_galaxy_plugin_doc`
    );
}

/**
 * Build an AI prompt to describe an SCM-sourced plugin (GitHub).
 *
 * @param org - GitHub organization (e.g. "redhat-cop").
 * @param repo - Repository name (e.g. "infra.aap_configuration").
 * @param collectionFqcn - Collection namespace.name (e.g. "infra.aap_configuration").
 * @param pluginName - Short plugin name (e.g. "credential_type").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt instructing the AI to fetch and explain the SCM plugin.
 */
export function buildScmPluginExplanationPrompt(
    org: string,
    repo: string,
    collectionFqcn: string,
    pluginName: string,
    pluginType: string,
): string {
    return (
        `${stripFrontmatter(explainPluginSkill)}\n` +
        `Plugin: ${pluginName}\n` +
        `Type: ${pluginType}\n` +
        `Collection: ${collectionFqcn}\n` +
        `Source: GitHub (${org}/${repo})\n` +
        `MCP Tool: get_scm_plugin_doc\n` +
        `Org: ${org}\n` +
        `Repo: ${repo}`
    );
}

/** Input for building a collection sources overview prompt. */
export interface CollectionSourcesInput {
    galaxyCount: number;
    githubOrgs: { name: string; count: number }[];
}

/**
 * Build a prompt to summarize all configured collection sources.
 *
 * @param input - Source counts for Galaxy and GitHub orgs.
 * @returns Prompt comparing Galaxy vs GitHub sources with install guidance.
 */
export function buildCollectionSourcesOverviewPrompt(input: CollectionSourcesInput): string {
    const orgDetails = input.githubOrgs
        .map((org) => `  - ${org.name}: ${String(org.count)} collections`)
        .join('\n');
    const githubTotal = input.githubOrgs.reduce((sum, org) => sum + org.count, 0);

    return (
        `${stripFrontmatter(overviewCollectionSourcesSkill)}\n` +
        `Galaxy: ${input.galaxyCount.toLocaleString()} collections available\n` +
        `GitHub Organizations (${String(githubTotal)} total):\n${orgDetails}`
    );
}

/**
 * Build a prompt to summarize Ansible Galaxy as a collection source.
 *
 * @param collectionCount - Number of collections available on Galaxy.
 * @returns Prompt describing Galaxy and how to search/install from it.
 */
export function buildGalaxySourceSummaryPrompt(collectionCount: number): string {
    return (
        `${stripFrontmatter(summarizeGalaxySourceSkill)}\n` +
        `Galaxy collection count: ${collectionCount.toLocaleString()}`
    );
}

/**
 * Build a prompt to summarize a GitHub organization as a collection source.
 *
 * @param orgId - GitHub org identifier.
 * @param collectionCount - Number of collections in this org.
 * @returns Prompt describing the org's collections with install guidance.
 */
export function buildGithubOrgSourceSummaryPrompt(orgId: string, collectionCount: number): string {
    return (
        `${stripFrontmatter(summarizeGithubSourceSkill)}\n` +
        `Organization: ${orgId}\n` +
        `Collection count: ${String(collectionCount)}`
    );
}
