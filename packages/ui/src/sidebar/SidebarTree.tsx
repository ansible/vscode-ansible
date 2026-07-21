import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { SidebarNodeAction, SidebarNodeExpand, SidebarTreeNode } from './types';

export interface SidebarTreeProps {
    nodes: SidebarTreeNode[];
    /** Depth for indentation (root = 0). */
    depth?: number;
    onNodeAction?: (command: string, nodeId: string, args?: unknown[]) => void;
    /** Lazy-load children when a collapsible row is first expanded. */
    onNodeExpand?: (nodeId: string, expand: SidebarNodeExpand) => void;
}

/**
 * Single expandable tree row for the sidebar NavTree.
 * @param root0 - Component props.
 * @param root0.node - Tree node to render.
 * @param root0.depth - Nesting depth for indentation (root = 0).
 * @param root0.onNodeAction - Fired when an inline action is clicked.
 * @param root0.onNodeExpand - Lazy-load children when a collapsible row is first expanded.
 * @returns The rendered tree row (and nested children when expanded).
 */
function TreeRow({
    node,
    depth,
    onNodeAction,
    onNodeExpand,
}: {
    node: SidebarTreeNode;
    depth: number;
    onNodeAction?: (command: string, nodeId: string, args?: unknown[]) => void;
    onNodeExpand?: (nodeId: string, expand: SidebarNodeExpand) => void;
}) {
    const expandable = Boolean(node.children?.length) || Boolean(node.lazyChildren);
    const [expanded, setExpanded] = useState(Boolean(node.children?.length) && depth === 0);
    const awaitingHost =
        expanded && Boolean(node.lazyChildren) && !node.children?.length && Boolean(node.expand);

    const onToggle = () => {
        if (!expandable) {
            return;
        }
        const next = !expanded;
        setExpanded(next);
        if (next && node.lazyChildren && !node.children?.length && node.expand && onNodeExpand) {
            onNodeExpand(node.id, node.expand);
        }
    };

    /** Leaf rows mirror TreeItem.command: click runs the primary action. */
    const onRowActivate = () => {
        if (expandable) {
            onToggle();
            return;
        }
        const primary = node.actions?.[0];
        if (primary) {
            onNodeAction?.(primary.command, node.id, primary.args);
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onRowActivate();
        }
    };

    const runAction = (e: MouseEvent, action: SidebarNodeAction) => {
        e.stopPropagation();
        onNodeAction?.(action.command, node.id, action.args);
    };

    const classes = [
        'ansible-sidebar-tree-row',
        node.warning ? 'is-warning' : '',
        node.selected ? 'is-selected' : '',
        node.actions?.length ? 'has-actions' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li className={classes} role="treeitem" aria-expanded={expandable ? expanded : undefined}>
            <div
                className="ansible-sidebar-tree-row-inner"
                style={{ paddingLeft: 8 + depth * 12 }}
                tabIndex={0}
                title={node.tooltip}
                onClick={onRowActivate}
                onKeyDown={onKeyDown}
            >
                <span
                    className={[
                        'ansible-sidebar-tree-twistie',
                        expandable
                            ? `codicon codicon-chevron-${expanded ? 'down' : 'right'}`
                            : 'is-leaf',
                    ].join(' ')}
                    aria-hidden="true"
                />
                <span
                    className={[
                        'ansible-sidebar-tree-icon',
                        'codicon',
                        `codicon-${node.icon ?? 'circle-outline'}`,
                        node.icon === 'loading' ? 'codicon-modifier-spin' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    aria-hidden="true"
                />
                <span className="ansible-sidebar-tree-label">{node.label}</span>
                {node.description ? (
                    <span className="ansible-sidebar-tree-desc">{node.description}</span>
                ) : null}
                {node.actions?.length ? (
                    <span className="ansible-sidebar-tree-actions">
                        {node.actions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                className="ansible-sidebar-tree-action"
                                title={action.label}
                                aria-label={action.label}
                                onClick={(e) => {
                                    runAction(e, action);
                                }}
                            >
                                <span
                                    className={`codicon codicon-${action.icon}`}
                                    aria-hidden="true"
                                />
                            </button>
                        ))}
                    </span>
                ) : null}
            </div>
            {expandable && expanded ? (
                awaitingHost ? (
                    <ul className="ansible-sidebar-tree" role="group">
                        <li className="ansible-sidebar-tree-row" role="treeitem">
                            <div
                                className="ansible-sidebar-tree-row-inner"
                                style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                            >
                                <span
                                    className="ansible-sidebar-tree-twistie is-leaf"
                                    aria-hidden="true"
                                />
                                <span
                                    className="ansible-sidebar-tree-icon codicon codicon-loading codicon-modifier-spin"
                                    aria-hidden="true"
                                />
                                <span className="ansible-sidebar-tree-label">Loading…</span>
                            </div>
                        </li>
                    </ul>
                ) : (
                    <SidebarTree
                        nodes={node.children ?? []}
                        depth={depth + 1}
                        onNodeAction={onNodeAction}
                        onNodeExpand={onNodeExpand}
                    />
                )
            ) : null}
        </li>
    );
}

/**
 * Shallow expandable tree for sidebar NavTree sections.
 * Host-agnostic; no vscode imports.
 * @param root0 - Component props.
 * @param root0.nodes - Root-level tree nodes for this section.
 * @param root0.depth - Nesting depth for indentation (root = 0).
 * @param root0.onNodeAction - Fired when an inline action is clicked.
 * @param root0.onNodeExpand - Lazy-load children when a collapsible row is first expanded.
 * @returns The rendered tree list, or null when there are no nodes.
 */
export function SidebarTree({ nodes, depth = 0, onNodeAction, onNodeExpand }: SidebarTreeProps) {
    if (nodes.length === 0) {
        return null;
    }

    return (
        <ul className="ansible-sidebar-tree" role={depth === 0 ? 'tree' : 'group'}>
            {nodes.map((node) => (
                <TreeRow
                    key={node.id}
                    node={node}
                    depth={depth}
                    onNodeAction={onNodeAction}
                    onNodeExpand={onNodeExpand}
                />
            ))}
        </ul>
    );
}
