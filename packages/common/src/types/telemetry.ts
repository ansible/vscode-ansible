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
    ENV_CREATED: 'env.created',
    ENV_SELECTED: 'env.selected',

    // Collections
    COLLECTION_INSTALLED: 'collection.installed',
    COLLECTION_SEARCHED: 'collection.searched',

    // Playbooks
    PLAYBOOK_RUN: 'playbook.run',
    PLAYBOOK_RUN_WITH_PROGRESS: 'playbook.runWithProgress',

    // Creator
    CREATOR_FORM_OPENED: 'creator.formOpened',

    // Vault
    VAULT_USED: 'vault.used',

    // Plugin Docs
    PLUGIN_DOC_VIEWED: 'pluginDoc.viewed',

    // AI Features
    AI_SUMMARY_REQUESTED: 'ai.summaryRequested',

    // MCP
    MCP_TOOL_USED_IN_CHAT: 'mcp.toolUsedInChat',
    MCP_CONFIGURED: 'mcp.configured',

    // Skills
    SKILL_USED_IN_CHAT: 'skill.usedInChat',
    SKILL_PROMPT_COPIED: 'skill.promptCopied',

    // LLM
    LLM_MODEL_SELECTED: 'llm.modelSelected',
    LLM_PROVIDER_CONFIGURED: 'llm.providerConfigured',

    // Execution Environments
    EE_DETAIL_VIEWED: 'ee.detailViewed',
} as const;

export type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];
