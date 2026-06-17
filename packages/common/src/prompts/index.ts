/**
 * Centralized AI prompt builders.
 *
 * All user-facing AI prompts are defined here so they can be:
 * 1. Reused across extension, MCP server, and CLI
 * 2. Customized by users in the future
 * 3. Maintained in a single location
 */

export {
    buildCollectionsSummaryPrompt,
    buildCollectionSummaryPrompt,
    buildPluginExplanationPrompt,
    buildGalaxyPluginExplanationPrompt,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
} from './collections';
export type { CollectionSourcesInput } from './collections';

export { buildEESummaryPrompt, buildEEDetailPrompt } from './execution-environments';

export { buildCreatorOverviewPrompt, buildCreatorCommandWalkthroughPrompt } from './creator';

export { buildTaskBuilderPrompt } from './plugin-doc';

export { buildSkillLoadPrompt, buildSkillClipboardPrompt } from './skills';

export { buildMcpToolExamplePrompt } from './mcp-examples';

export { buildTaskAnalysisPrompt, buildPlaybookSummaryPrompt } from './playbook';
export type { TaskAnalysisInput } from './playbook';
