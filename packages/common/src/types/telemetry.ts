/**
 * Shared telemetry event name constants.
 * Used by the extension and any subsystem that emits telemetry.
 */

export const TelemetryEvents = {
    // Lifecycle
    EXTENSION_ACTIVATED: 'extension.activated',

    // Commands (generic wrapper — command ID is a property)
    COMMAND_EXECUTED: 'command.executed',

    // Environments
    ENV_CREATE: 'env.create',
    ENV_SELECT: 'env.select',

    // Collections
    COLLECTION_INSTALL: 'collection.install',
    COLLECTION_SEARCH: 'collection.search',

    // Playbooks
    PLAYBOOK_RUN: 'playbook.run',
    PLAYBOOK_RUN_WITH_PROGRESS: 'playbook.runWithProgress',

    // Creator
    CREATOR_FORM_OPEN: 'creator.formOpen',

    // Vault
    VAULT_USE: 'vault.use',

    // Plugin Docs
    PLUGIN_DOC_VIEW: 'pluginDoc.view',

    // AI Features
    AI_SUMMARY_REQUEST: 'ai.summaryRequest',

    // MCP
    MCP_TOOL_USE_IN_CHAT: 'mcp.toolUseInChat',
    MCP_CONFIGURE: 'mcp.configure',

    // Skills
    SKILL_USE_IN_CHAT: 'skill.useInChat',
    SKILL_PROMPT_COPY: 'skill.promptCopy',

    // LLM
    LLM_MODEL_SELECT: 'llm.modelSelect',
    LLM_PROVIDER_CONFIGURE: 'llm.providerConfigure',

    // Execution Environments
    EE_DETAIL_VIEW: 'ee.detailView',

    // Walkthroughs
    WALKTHROUGH_OPEN: 'walkthrough.open',
} as const;

export type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];
