/**
 * Shared telemetry event name constants and outcome helpers.
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
    CREATOR_COMPLETE: 'creator.complete',

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

    // Tox-Ansible
    TOX_DISCOVER: 'tox.discover',
    TOX_RUN: 'tox.run',
} as const;

export type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

/** Journey outcome for completion-time telemetry events. */
export type TelemetryResult = 'success' | 'cancel' | 'error';

/** Keys owned by buildOutcomeProperties — never taken from `extra`. */
const RESERVED_OUTCOME_KEYS = new Set(['result', 'durationMs', 'errorCode']);

export interface TelemetryOutcomeOptions {
    /** Epoch ms when the action started; used to compute `durationMs`. */
    startedAt?: number;
    /**
     * Coarse, non-PII error category (e.g. `no_workspace`, `tool_missing`).
     * Sanitized to `[a-zA-Z0-9_.-]` and truncated.
     */
    errorCode?: string;
    /** Extra string properties to merge (must already be non-PII). */
    extra?: Record<string, string>;
}

/**
 * Sanitize a coarse error category for telemetry.
 *
 * @param errorCode - Raw error code candidate
 * @returns Sanitized non-empty string, or undefined if nothing remains
 */
function sanitizeErrorCode(errorCode: string): string | undefined {
    const cleaned = errorCode.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64);
    return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Build string properties for a journey outcome event.
 *
 * Reserved keys (`result`, `durationMs`, `errorCode`) always win over `extra`.
 *
 * @param result - success | cancel | error
 * @param options - Optional duration / errorCode / extra props
 * @returns Properties suitable for TelemetryService.sendEvent
 */
export function buildOutcomeProperties(
    result: TelemetryResult,
    options?: TelemetryOutcomeOptions,
): Record<string, string> {
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(options?.extra ?? {})) {
        if (!RESERVED_OUTCOME_KEYS.has(key)) {
            props[key] = value;
        }
    }
    props.result = result;
    if (options?.startedAt !== undefined) {
        props.durationMs = String(Math.max(0, Date.now() - options.startedAt));
    }
    if (result === 'error' && options?.errorCode) {
        const sanitized = sanitizeErrorCode(options.errorCode);
        if (sanitized) {
            props.errorCode = sanitized;
        }
    }
    return props;
}
