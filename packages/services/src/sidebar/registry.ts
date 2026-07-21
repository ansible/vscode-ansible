/**
 * Ordered registry of Ansible NavTree accordion sections (ADR-025).
 * Skeleton and full snapshots share this list for id/title/order.
 */
import type { SidebarSection, SidebarSectionId } from '@ansible/common';
import type { SidebarModelInput } from './types';
import { buildEnvManagers, shouldSuggestEnvManagers } from './sections/envManagers';
import { buildDevTools, shouldSuggestDevTools } from './sections/devTools';
import { buildCollections } from './sections/collections';
import { buildCollectionSources } from './sections/collectionSources';
import { buildExecutionEnvironments } from './sections/executionEnvironments';
import { buildCreator } from './sections/creator';
import { buildPlaybooks } from './sections/playbooks';
import { buildAiTools } from './sections/aiTools';
import { buildAiSkills } from './sections/aiSkills';
import { buildLightspeed } from './sections/lightspeed';

/** Definition of one NavTree section for snapshot / skeleton / suggest-open. */
export interface SidebarSectionDef {
    id: SidebarSectionId;
    title: string;
    /** Include in snapshot when true; omit means always include. */
    include?: (input: SidebarModelInput) => boolean;
    build: (input: SidebarModelInput) => SidebarSection;
    /** First matching suggest in registry order wins. */
    suggest?: (input: SidebarModelInput) => boolean;
}

/** Canonical section order for Ansible NavTree. */
export const SECTION_REGISTRY: readonly SidebarSectionDef[] = [
    {
        id: 'envManagers',
        title: 'Environment Managers',
        build: buildEnvManagers,
        suggest: shouldSuggestEnvManagers,
    },
    {
        id: 'devTools',
        title: 'Ansible Dev Tools',
        build: buildDevTools,
        suggest: shouldSuggestDevTools,
    },
    {
        id: 'collections',
        title: 'Installed Collections',
        build: buildCollections,
    },
    {
        id: 'collectionSources',
        title: 'Collection Sources',
        build: buildCollectionSources,
    },
    {
        id: 'executionEnvironments',
        title: 'Execution Environments',
        build: buildExecutionEnvironments,
    },
    {
        id: 'creator',
        title: 'Creator',
        build: buildCreator,
    },
    {
        id: 'playbooks',
        title: 'Playbooks',
        build: buildPlaybooks,
    },
    {
        id: 'aiTools',
        title: 'AI Tools',
        include: (input) => input.enableAiFeatures,
        build: buildAiTools,
    },
    {
        id: 'aiSkills',
        title: 'AI Skills',
        include: (input) => input.enableAiFeatures,
        build: buildAiSkills,
    },
    {
        id: 'lightspeed',
        title: 'Lightspeed',
        include: (input) => Boolean(input.lightspeedEnabled),
        build: buildLightspeed,
    },
];
