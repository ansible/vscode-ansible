import { describe, expect, it } from 'vitest';
import { SidebarModel } from '@ansible/developer-services';

/**
 * Host-facing expand helpers live on SidebarModel (pure); exercise the
 * patch path the webview host uses after lazy expand.
 */
describe('sidebar expand helpers (host seam)', () => {
    const model = new SidebarModel();

    it('patches nested children without mutating the original snapshot', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '1' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            executionEnvironments: [
                {
                    created: 't',
                    execution_environment: true,
                    full_name: 'ee:latest',
                    image_id: 'id',
                },
            ],
        });
        const ee = snap.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0];
        expect(ee?.lazyChildren).toBe(true);
        if (!ee) {
            return;
        }

        const next = model.patchNodeChildren(snap, ee.id, [
            { id: 'info', label: 'Info', icon: 'info' },
        ]);
        expect(
            snap.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0]?.children,
        ).toBe(undefined);
        expect(
            next.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0]?.children?.[0]
                ?.label,
        ).toBe('Info');
    });
});
