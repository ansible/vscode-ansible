import { describe, expect, it } from 'vitest';
import { SECTION_REGISTRY, SidebarModel } from '../../src/SidebarModel';

describe('SECTION_REGISTRY', () => {
    const model = new SidebarModel();

    it('skeleton section ids match full snapshot order (AI + Lightspeed on)', () => {
        const input = {
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '1' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            lightspeedEnabled: true,
        };
        const full = model.buildSnapshot(input);
        const skeleton = model.buildSkeletonSnapshot({
            enableAiFeatures: true,
            lightspeedEnabled: true,
        });

        expect(skeleton.sections.map((s) => s.id)).toEqual(full.sections.map((s) => s.id));
        expect(skeleton.sections.map((s) => s.title)).toEqual(full.sections.map((s) => s.title));
        expect(skeleton.sections.every((s) => s.loading)).toBe(true);
    });

    it('lists core sections before optional AI / Lightspeed', () => {
        const ids = SECTION_REGISTRY.map((d) => d.id);
        expect(ids.slice(0, 7)).toEqual([
            'envManagers',
            'devTools',
            'collections',
            'collectionSources',
            'executionEnvironments',
            'creator',
            'playbooks',
        ]);
        expect(ids.slice(7)).toEqual(['aiTools', 'aiSkills', 'lightspeed']);
    });
});
