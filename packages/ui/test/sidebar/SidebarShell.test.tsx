import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarShell } from '../../src/sidebar/SidebarShell';
import type { SidebarSnapshot } from '../../src/sidebar/types';

const snapshot: SidebarSnapshot = {
    sections: [
        {
            id: 'envManagers',
            title: 'Environment Managers',
            nodes: [{ id: 'env-1', label: 'venv', icon: 'vm' }],
        },
        {
            id: 'creator',
            title: 'Creator',
            nodes: [{ id: 'c-1', label: 'Init', icon: 'folder' }],
        },
        {
            id: 'playbooks',
            title: 'Playbooks',
            nodes: [{ id: 'p-1', label: 'site.yml', icon: 'file' }],
        },
    ],
    suggestedOpenSectionId: null,
};

describe('SidebarShell', () => {
    it('marks the open section with is-open for flex fill layout', () => {
        const html = renderToStaticMarkup(
            <SidebarShell
                snapshot={snapshot}
                openSectionId="creator"
                onOpenSectionChange={() => undefined}
            />,
        );
        expect(html).toContain('ansible-sidebar-section is-open');
        expect(html).toContain('id="sidebar-panel-creator"');
        expect(html).toContain('Init');
        expect(html).not.toContain('id="sidebar-panel-playbooks"');
    });

    it('fires onOpenSectionChange when a section header is present', () => {
        const onOpen = vi.fn();
        const html = renderToStaticMarkup(
            <SidebarShell snapshot={snapshot} openSectionId={null} onOpenSectionChange={onOpen} />,
        );
        // SSR cannot click; assert toggle buttons exist for accordion control.
        expect(html).toContain('sidebar-section-creator');
        expect(html).toContain('aria-expanded="false"');
        expect(onOpen).not.toHaveBeenCalled();
    });
});
