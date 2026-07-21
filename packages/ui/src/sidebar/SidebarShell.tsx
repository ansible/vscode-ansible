import { useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import type {
    SidebarNodeAction,
    SidebarNodeExpand,
    SidebarSectionId,
    SidebarSnapshot,
} from './types';
import { SidebarTree } from './SidebarTree';

export interface SidebarShellProps {
    snapshot: SidebarSnapshot;
    /** Controlled open section; `null` = all collapsed. */
    openSectionId: SidebarSectionId | null;
    onOpenSectionChange: (id: SidebarSectionId | null) => void;
    /** Fired when a welcome action button is clicked. */
    onWelcomeAction?: (command: string, sectionId: SidebarSectionId, args?: unknown[]) => void;
    /** Fired when a header or inline tree-row action is clicked (host runs the command). */
    onNodeAction?: (command: string, nodeId: string, args?: unknown[]) => void;
    /** Lazy-load children when a collapsible row is first expanded. */
    onNodeExpand?: (nodeId: string, expand: SidebarNodeExpand) => void;
}

interface FloatingTip {
    text: string;
    x: number;
    y: number;
}

/**
 * Accordion sidebar NavTree: one section open at a time, all closed by default.
 * Host-agnostic React UI for VS Code WebviewView and Electron.
 * @param root0 - Component props.
 * @param root0.snapshot - Current NavTree snapshot (sections and suggested open id).
 * @param root0.openSectionId - Controlled open section; `null` = all collapsed.
 * @param root0.onOpenSectionChange - Called when the open section changes.
 * @param root0.onWelcomeAction - Fired when a welcome action button is clicked.
 * @param root0.onNodeAction - Fired when a header or inline tree-row action is clicked.
 * @param root0.onNodeExpand - Lazy-load children when a collapsible row is first expanded.
 * @returns The rendered accordion sidebar shell.
 */
export function SidebarShell({
    snapshot,
    openSectionId,
    onOpenSectionChange,
    onWelcomeAction,
    onNodeAction,
    onNodeExpand,
}: SidebarShellProps) {
    const [tip, setTip] = useState<FloatingTip | null>(null);

    const toggle = (id: SidebarSectionId) => {
        onOpenSectionChange(openSectionId === id ? null : id);
    };

    const runHeaderAction = (e: MouseEvent, action: SidebarNodeAction) => {
        e.stopPropagation();
        e.preventDefault();
        setTip(null);
        onNodeAction?.(action.command, action.id, action.args);
    };

    const showHeaderTip = (el: HTMLButtonElement, text: string) => {
        const rect = el.getBoundingClientRect();
        setTip({
            text,
            x: rect.left + rect.width / 2,
            y: rect.top,
        });
    };

    return (
        <div className="ansible-ui ansible-sidebar-shell" role="region" aria-label="Ansible">
            {snapshot.sections.map((section) => {
                const open = openSectionId === section.id;
                const headerId = `sidebar-section-${section.id}`;
                const panelId = `sidebar-panel-${section.id}`;

                return (
                    <section
                        key={section.id}
                        className={[
                            'ansible-sidebar-section',
                            open ? 'is-open' : '',
                            section.severity && section.severity !== 'none'
                                ? `severity-${section.severity}`
                                : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <div className="ansible-sidebar-section-header">
                            <button
                                type="button"
                                id={headerId}
                                className="ansible-sidebar-section-toggle"
                                aria-expanded={open}
                                aria-controls={panelId}
                                onClick={() => {
                                    toggle(section.id);
                                }}
                            >
                                <span
                                    className={`ansible-sidebar-section-chevron codicon codicon-chevron-${open ? 'down' : 'right'}`}
                                    aria-hidden="true"
                                />
                                <span className="ansible-sidebar-section-title">
                                    {section.title}
                                </span>
                            </button>
                            {section.headerActions?.length ? (
                                <span className="ansible-sidebar-section-actions">
                                    {section.headerActions.map((action) => (
                                        <button
                                            key={action.id}
                                            type="button"
                                            className="ansible-sidebar-section-action"
                                            aria-label={action.label}
                                            onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => {
                                                showHeaderTip(e.currentTarget, action.label);
                                            }}
                                            onMouseLeave={() => {
                                                setTip(null);
                                            }}
                                            onFocus={(e: FocusEvent<HTMLButtonElement>) => {
                                                showHeaderTip(e.currentTarget, action.label);
                                            }}
                                            onBlur={() => {
                                                setTip(null);
                                            }}
                                            onClick={(e) => {
                                                runHeaderAction(e, action);
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
                        {open ? (
                            <div
                                id={panelId}
                                className="ansible-sidebar-section-body"
                                role="region"
                                aria-labelledby={headerId}
                            >
                                {section.nodes.length === 0 &&
                                (section.welcome || section.welcomeActions?.length) ? (
                                    <div className="ansible-sidebar-welcome">
                                        {section.welcome ? (
                                            <p className="ansible-sidebar-welcome-text">
                                                {section.welcome}
                                            </p>
                                        ) : null}
                                        {section.welcomeActions?.length ? (
                                            <div className="ansible-sidebar-welcome-actions">
                                                {section.welcomeActions.map((action) => (
                                                    <button
                                                        key={action.id}
                                                        type="button"
                                                        className="ansible-sidebar-welcome-btn"
                                                        onClick={() =>
                                                            onWelcomeAction?.(
                                                                action.command,
                                                                section.id,
                                                                action.args,
                                                            )
                                                        }
                                                    >
                                                        {action.label}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                                <SidebarTree
                                    nodes={section.nodes}
                                    onNodeAction={onNodeAction}
                                    onNodeExpand={onNodeExpand}
                                />
                            </div>
                        ) : null}
                    </section>
                );
            })}
            {tip ? (
                <div
                    className="ansible-sidebar-floating-tip"
                    role="tooltip"
                    style={{ left: tip.x, top: tip.y }}
                >
                    {tip.text}
                </div>
            ) : null}
        </div>
    );
}
