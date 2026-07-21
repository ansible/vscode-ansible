/**
 * Stable import path for the sidebar NavTree model (ADR-025).
 * Implementation lives under `./sidebar/`.
 */
export { SidebarModel } from './sidebar/SidebarModel';
export type {
    SidebarAiToolInput,
    SidebarLightspeedItem,
    SidebarCollectionSourceInput,
    SidebarCreatorInput,
    SidebarPlaybookWorkspaceInput,
    SidebarModelInput,
    SidebarSkeletonOptions,
} from './sidebar/types';
export { SECTION_REGISTRY } from './sidebar/registry';
export type { SidebarSectionDef } from './sidebar/registry';
export {
    assembleSidebarInput,
    assembleCollectionSources,
    assembleAiTools,
} from './sidebar/assembleSidebarInput';
