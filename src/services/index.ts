/**
 * Service layer exports
 *
 * These services contain the core business logic for the Ansible Environments extension.
 * They are designed to be independent of VS Code UI components and can be used by:
 * - TreeView providers (for UI rendering)
 * - Commands (for user actions)
 * - MCP tools (for AI/automation integration)
 *
 * Shared domain logic lives in `@ansible/core`; this barrel re-exports it plus
 * extension-local services (Playbooks, Terminal).
 */

export * from '@ansible/core';

export { TerminalService } from './TerminalService';
export type {
    CommandResult,
    ManagedTerminal,
    SendCommandOptions,
    CreateTerminalOptions,
} from './TerminalService';

export { PlaybooksService } from './PlaybooksService';
export type { PlaybookPlay, PlaybookInfo, PlaybookConfig } from './PlaybooksService';
