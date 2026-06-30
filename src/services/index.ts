/**
 * Service layer exports
 *
 * These services contain the core business logic for the Ansible extension.
 * They are designed to be independent of VS Code UI components and can be used by:
 * - TreeView providers (for UI rendering)
 * - Commands (for user actions)
 * - MCP tools (for AI/automation integration)
 *
 * Shared domain logic lives in `@ansible/developer-services`; this barrel re-exports it plus
 * extension-local services (Playbooks, Terminal).
 */

export * from '@ansible/developer-services';

export { TerminalService } from '@src/services/TerminalService';
export type {
    CommandResult,
    ManagedTerminal,
    SendCommandOptions,
    CreateTerminalOptions,
} from '@src/services/TerminalService';

export { PlaybooksService } from '@src/services/PlaybooksService';
export type { PlaybookPlay, PlaybookInfo, PlaybookConfig } from '@src/services/PlaybooksService';
