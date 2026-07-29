import { describe, expect, it } from 'vitest';
import { preserveExpandedChildren } from '@ansible/developer-services';
import type { SidebarSnapshot, SidebarTreeNode } from '@ansible/common';
import {
    extractSelectEnvironmentId,
    isPlaybookCommand,
    normalizePlaybookPayload,
} from '@src/sidebar/navTreeCommandArgs';
import { buildSidebarNavTreeHtml } from '@src/sidebar/navTreeHtml';
import { MCP_CATEGORY_LABELS, mcpIdeDisplayName } from '@src/sidebar/mcpLabels';

/**
 * Minimal tree node for preserveExpandedChildren fixtures.
 * @param partial - Node fields (id/label required)
 * @returns Sidebar tree node
 */
function node(partial: Partial<SidebarTreeNode> & { id: string; label: string }): SidebarTreeNode {
    return partial;
}

/**
 * Single-section snapshot fixture.
 * @param nodes - Nodes under the Collections section
 * @returns Sidebar snapshot
 */
function snap(nodes: SidebarTreeNode[]): SidebarSnapshot {
    return {
        sections: [{ id: 'collections', title: 'Collections', nodes }],
    };
}

describe('preserveExpandedChildren', () => {
    it('returns fresh when there is no previous snapshot', () => {
        const fresh = snap([node({ id: 'a', label: 'A', lazyChildren: true })]);
        expect(preserveExpandedChildren(undefined, fresh)).toBe(fresh);
    });

    it('restores expanded children onto matching lazy nodes', () => {
        const children = [node({ id: 'c1', label: 'Child' })];
        const previous = snap([
            node({
                id: 'col',
                label: 'ns.name',
                expand: {
                    kind: 'galaxyCollection',
                    namespace: 'ns',
                    name: 'name',
                    version: '1.0.0',
                },
                children,
            }),
        ]);
        const fresh = snap([
            node({
                id: 'col',
                label: 'ns.name',
                lazyChildren: true,
                expand: {
                    kind: 'galaxyCollection',
                    namespace: 'ns',
                    name: 'name',
                    version: '1.0.0',
                },
            }),
        ]);

        const next = preserveExpandedChildren(previous, fresh);
        const restored = next.sections[0].nodes[0];
        expect(restored.lazyChildren).toBe(false);
        expect(restored.children).toEqual(children);
        // Original fresh node stays lazy
        expect(fresh.sections[0].nodes[0].lazyChildren).toBe(true);
    });

    it('skips restore when previous had no expanded expand-nodes', () => {
        const previous = snap([
            node({ id: 'x', label: 'X', children: [node({ id: 'y', label: 'Y' })] }),
        ]);
        const fresh = snap([node({ id: 'x', label: 'X', lazyChildren: true })]);
        expect(preserveExpandedChildren(previous, fresh)).toBe(fresh);
    });
});

describe('navTreeCommandArgs', () => {
    it('detects playbook commands', () => {
        expect(isPlaybookCommand('ansiblePlaybooks.run')).toBe(true);
        expect(isPlaybookCommand('ansibleDevTools.refresh')).toBe(false);
    });

    it('normalizes legacy pb- path strings', () => {
        const payload = normalizePlaybookPayload(['pb-/tmp/site.yml']);
        expect(payload?.playbook.path).toBe('/tmp/site.yml');
        expect(payload?.playbook.name).toBe('site.yml');
    });

    it('passes through structured playbook payloads', () => {
        const payload = normalizePlaybookPayload([
            {
                playbook: {
                    path: '/ws/play.yml',
                    name: 'play.yml',
                    relativePath: 'play.yml',
                    plays: [],
                },
            },
        ]);
        expect(payload?.playbook.path).toBe('/ws/play.yml');
    });

    it('returns undefined for unrelated args', () => {
        expect(normalizePlaybookPayload(['hello'])).toBeUndefined();
        expect(normalizePlaybookPayload([])).toBeUndefined();
    });

    it('extracts selectEnvironment envId', () => {
        expect(extractSelectEnvironmentId([{ envId: 'env-1' }])).toBe('env-1');
        expect(extractSelectEnvironmentId([{}])).toBeUndefined();
        expect(extractSelectEnvironmentId([])).toBeUndefined();
    });
});

describe('mcpLabels', () => {
    it('maps known IDE ids and falls back for unknown', () => {
        expect(mcpIdeDisplayName('cursor')).toBe('Cursor');
        expect(mcpIdeDisplayName('bob')).toBe('IBM Bob');
        expect(mcpIdeDisplayName('other')).toBe('other');
    });

    it('exposes category labels used by assembleSidebarInput', () => {
        expect(MCP_CATEGORY_LABELS.creator).toBe('Creator');
        expect(MCP_CATEGORY_LABELS.discovery).toBe('Discovery');
    });
});

describe('buildSidebarNavTreeHtml', () => {
    it('embeds CSP, root marker, and script nonce', () => {
        const html = buildSidebarNavTreeHtml({
            scriptUri: 'https://example/webview.js',
            codiconsUri: 'https://example/codicon.css',
            nonce: 'abc123',
            cspSource: 'https://csp.source',
        });
        expect(html).toContain("script-src 'nonce-abc123'");
        expect(html).toContain('data-view="sidebar-navtree"');
        expect(html).toContain('nonce="abc123"');
        expect(html).toContain('src="https://example/webview.js"');
        expect(html).toContain('href="https://example/codicon.css"');
    });
});
