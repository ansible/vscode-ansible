/**
 * Re-export sidebar DTOs from @ansible/common (ADR-025).
 * Kept for stable import paths from playground and UI code.
 */
export type {
    SidebarSectionId,
    SidebarNodeAction,
    SidebarNodeExpand,
    SidebarTreeNode,
    SidebarSectionSeverity,
    SidebarWelcomeAction,
    SidebarSection,
    SidebarSnapshot,
    SidebarEnvManagerInput,
} from '@ansible/common';
