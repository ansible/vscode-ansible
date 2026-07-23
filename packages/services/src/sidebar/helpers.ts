/**
 * Shared sidebar section helpers.
 */
import type { SidebarSectionId, SidebarTreeNode } from '@ansible/common';

/**
 * Loading row shown in skeleton section bodies.
 * @param sectionId - Section that owns the loading row
 * @returns Tree node with a spinning loading icon
 */
export function loadingNode(sectionId: SidebarSectionId): SidebarTreeNode {
    return {
        id: `${sectionId}-loading`,
        label: 'Loading…',
        icon: 'loading',
    };
}
