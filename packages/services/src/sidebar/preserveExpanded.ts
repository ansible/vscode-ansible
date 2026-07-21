import type { SidebarSnapshot, SidebarTreeNode } from '@ansible/common';

/**
 * Preserve previously expanded lazy collection/EE children across full snapshot rebuilds.
 * @param previous - Last posted snapshot (or undefined on first paint)
 * @param fresh - Newly built snapshot
 * @returns Snapshot with prior expanded children restored where still applicable
 */
export function preserveExpandedChildren(
    previous: SidebarSnapshot | undefined,
    fresh: SidebarSnapshot,
): SidebarSnapshot {
    if (!previous) {
        return fresh;
    }
    const expanded = new Map<string, SidebarTreeNode[]>();
    const collect = (nodes: SidebarTreeNode[]): void => {
        for (const n of nodes) {
            if (!n.lazyChildren && n.children?.length && n.expand) {
                expanded.set(n.id, n.children);
            }
            if (n.children?.length) {
                collect(n.children);
            }
        }
    };
    for (const section of previous.sections) {
        collect(section.nodes);
    }
    if (expanded.size === 0) {
        return fresh;
    }

    const restore = (nodes: SidebarTreeNode[]): SidebarTreeNode[] =>
        nodes.map((n) => {
            const prior = expanded.get(n.id);
            if (prior && n.lazyChildren) {
                return { ...n, lazyChildren: false, children: prior };
            }
            if (n.children?.length) {
                return { ...n, children: restore(n.children) };
            }
            return n;
        });

    return {
        ...fresh,
        sections: fresh.sections.map((s) => ({
            ...s,
            nodes: restore(s.nodes),
        })),
    };
}
