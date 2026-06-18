/**
 * AI prompt builders for Ansible collections.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/**
 * Build a prompt to summarize all installed collections in the workspace.
 *
 * @returns Prompt instructing the AI to list and categorize installed collections.
 */
export function buildCollectionsSummaryPrompt(): string {
    return `Generate a summary of the installed Ansible collections in this workspace.

Use the \`list_ansible_collections\` MCP tool to get the list of installed collections, then provide:
1. A brief overview of the collection categories (networking, cloud, system, etc.)
2. Key capabilities provided by these collections
3. Any recommendations for commonly paired collections that might be missing

After your summary, ask the user if they would like to search for additional collections. If they say yes, use the \`search_available_collections\` MCP tool to find relevant collections based on their use case (you can filter by source: "galaxy" or a GitHub org name).

**IMPORTANT**: To install any collection, use the \`install_ansible_collection\` MCP tool.
Do NOT suggest using \`ansible-galaxy collection install\` directly.`;
}

/**
 * Build a prompt to summarize a single collection.
 *
 * @param collectionName - Fully qualified collection name (e.g. "cisco.nxos").
 * @returns Prompt instructing the AI to describe the collection's plugins and use cases.
 */
export function buildCollectionSummaryPrompt(collectionName: string): string {
    return `Generate a summary of the Ansible collection "${collectionName}".

Use the \`get_collection_plugins\` MCP tool with collection="${collectionName}" to get all plugins in this collection, then provide:
1. A brief description of what this collection is for
2. The key modules, plugins, and roles it provides
3. Common use cases and example scenarios
4. Any dependencies or requirements`;
}

/**
 * Build a prompt to explain a specific plugin.
 *
 * @param fullName - Fully qualified plugin name (e.g. "ansible.builtin.copy").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt instructing the AI to document the plugin with examples.
 */
export function buildPluginExplanationPrompt(fullName: string, pluginType: string): string {
    return `Explain the Ansible ${pluginType} plugin "${fullName}".

Use the \`get_plugin_documentation\` MCP tool with plugin_name="${fullName}" and plugin_type="${pluginType}" to get the full documentation, then provide:
1. What this plugin does in plain language
2. The most important parameters and when to use them
3. A practical example task showing common usage
4. Any gotchas or best practices`;
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
    return `Explain the Ansible ${pluginType} plugin "${collectionFqcn}.${pluginName}" from the Galaxy collection "${collectionFqcn}".

Use the \`get_galaxy_plugin_doc\` MCP tool with collection="${collectionFqcn}", plugin="${pluginName}", and plugin_type="${pluginType}" to get the full documentation, then provide:
1. What this plugin does in plain language
2. The most important parameters and when to use them
3. A practical example task showing common usage
4. Any gotchas or best practices`;
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
    return `Explain the Ansible ${pluginType} plugin "${collectionFqcn}.${pluginName}" from the GitHub collection "${collectionFqcn}" (${org}/${repo}).

Use the \`get_scm_plugin_doc\` MCP tool with org="${org}", repo="${repo}", collection="${collectionFqcn}", plugin="${pluginName}", and plugin_type="${pluginType}" to get the full documentation, then provide:
1. What this plugin does in plain language
2. The most important parameters and when to use them
3. A practical example task showing common usage
4. Any gotchas or best practices`;
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

    return `I have access to Ansible collections from multiple sources:

**Ansible Galaxy**: ${input.galaxyCount.toLocaleString()} collections available

**GitHub Organizations** (${String(githubTotal)} total collections):
${orgDetails}

Please help me understand:
1. What types of collections are typically found on Galaxy vs GitHub organizations?
2. How do I decide which source to use for a particular use case?
3. Are there any notable collections in these GitHub organizations I should know about?

Use the \`search_available_collections\` MCP tool to search for collections if needed.

**IMPORTANT**: To install any collection, use the \`install_ansible_collection\` MCP tool.
Do NOT suggest using \`ansible-galaxy collection install\` directly.`;
}

/**
 * Build a prompt to summarize Ansible Galaxy as a collection source.
 *
 * @param collectionCount - Number of collections available on Galaxy.
 * @returns Prompt describing Galaxy and how to search/install from it.
 */
export function buildGalaxySourceSummaryPrompt(collectionCount: number): string {
    return `Generate a summary of Ansible Galaxy as a collection source.

Galaxy has ${collectionCount.toLocaleString()} collections available.

Please describe:
1. What is Ansible Galaxy and what types of collections are typically found there?
2. How do I search for and evaluate collections on Galaxy?
3. What are some of the most popular/useful collections on Galaxy?

Use the \`list_source_collections\` MCP tool with source: "galaxy" to see the most popular collections.
Use the \`search_available_collections\` MCP tool to search for specific collections.

**IMPORTANT**: To install any collection, use the \`install_ansible_collection\` MCP tool.
Do NOT suggest using \`ansible-galaxy collection install\` directly.`;
}

/**
 * Build a prompt to summarize a GitHub organization as a collection source.
 *
 * @param orgId - GitHub org identifier.
 * @param collectionCount - Number of collections in this org.
 * @returns Prompt describing the org's collections with install guidance.
 */
export function buildGithubOrgSourceSummaryPrompt(orgId: string, collectionCount: number): string {
    return `Generate a summary of the "${orgId}" GitHub organization as an Ansible collection source.

This organization has ${String(collectionCount)} collections.

First, use the \`list_source_collections\` MCP tool with source: "${orgId}" to get the complete list of collections.

Then describe:
1. What is this organization and what types of collections do they provide?
2. What are the main use cases for these collections?
3. Which collections should I consider for my Ansible automation?

Use the \`search_available_collections\` MCP tool to search for specific collections if needed.

**IMPORTANT**: To install any collection, use the \`install_ansible_collection\` MCP tool.
Do NOT suggest using \`ansible-galaxy collection install\` directly.`;
}
