import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarTree } from '../../src/sidebar/SidebarTree';
import type { SidebarTreeNode } from '../../src/sidebar/types';

describe('SidebarTree', () => {
    it('renders labels and lazy-expandable rows', () => {
        const nodes: SidebarTreeNode[] = [
            {
                id: 'ee-1',
                label: 'community-ansible-dev-tools:devel',
                icon: 'package',
                lazyChildren: true,
                expand: { kind: 'eeDetail', fullName: 'ghcr.io/ansible/x:devel' },
            },
            {
                id: 'leaf',
                label: 'Leaf',
                icon: 'file',
                actions: [
                    {
                        id: 'a1',
                        label: 'Run',
                        icon: 'play',
                        command: 'ansiblePlaybooks.run',
                        args: ['/tmp/p.yml'],
                    },
                ],
            },
        ];

        const html = renderToStaticMarkup(
            <SidebarTree nodes={nodes} onNodeAction={vi.fn()} onNodeExpand={vi.fn()} />,
        );

        expect(html).toContain('community-ansible-dev-tools:devel');
        expect(html).toContain('Leaf');
        expect(html).toContain('codicon-package');
    });
});
