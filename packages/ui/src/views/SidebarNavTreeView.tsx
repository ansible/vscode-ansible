import { useEffect, useRef, useState } from 'react';
import type { SidebarNodeExpand, SidebarSectionId, SidebarSnapshot } from '../sidebar/types';
import { SidebarShell } from '../sidebar/SidebarShell';

/** Minimal host messaging surface (VS Code webview API or Electron IPC wrapper). */
export interface SidebarNavTreeHost {
    postMessage(message: unknown): void;
}

export interface SidebarNavTreeViewProps {
    /** Initial snapshot from data-props (may be empty until host pushes). */
    initialSnapshot?: SidebarSnapshot;
    /**
     * Host message port. Must be the same object returned by the single
     * acquireVsCodeApi() call in the webview entry (calling it twice throws).
     */
    host?: SidebarNavTreeHost;
}

/**
 * Webview entry for the accordion sidebar NavTree.
 * Host pushes snapshots; UI posts action command ids.
 * @param root0 - Component props.
 * @param root0.initialSnapshot - Initial snapshot from data-props (may be empty until host pushes).
 * @param root0.host - Host message port (VS Code webview API or Electron IPC wrapper).
 * @returns The rendered sidebar NavTree view.
 */
export function SidebarNavTreeView({ initialSnapshot, host }: SidebarNavTreeViewProps) {
    const empty: SidebarSnapshot = { sections: [], suggestedOpenSectionId: null };
    const [snapshot, setSnapshot] = useState<SidebarSnapshot>(initialSnapshot ?? empty);
    const [openSectionId, setOpenSectionId] = useState<SidebarSectionId | null>(
        initialSnapshot?.suggestedOpenSectionId ?? null,
    );
    const readySent = useRef(false);

    useEffect(() => {
        if (host && !readySent.current) {
            readySent.current = true;
            host.postMessage({ method: 'sidebar/ready' });
        }

        const onMessage = (event: MessageEvent) => {
            const data: unknown = event.data;
            if (typeof data !== 'object' || data === null) {
                return;
            }
            const msg = data as { method?: unknown; params?: { snapshot?: SidebarSnapshot } };
            if (msg.method !== 'sidebar/setState' || !msg.params?.snapshot) {
                return;
            }
            const next = msg.params.snapshot;
            setSnapshot(next);
            // Progressive updates send suggestedOpenSectionId: null — keep user selection.
            // Only auto-open when the host has an issue-driven suggestion.
            const suggested = next.suggestedOpenSectionId;
            if (suggested) {
                setOpenSectionId(suggested);
            }
        };
        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', onMessage);
        };
    }, [host]);

    const postAction = (command: string, args?: unknown[]) => {
        host?.postMessage({
            method: 'sidebar/action',
            params: { command, args },
        });
    };

    const postExpand = (nodeId: string, expand: SidebarNodeExpand) => {
        host?.postMessage({
            method: 'sidebar/expandNode',
            params: { nodeId, expand },
        });
    };

    if (snapshot.sections.length === 0) {
        return (
            <div className="ansible-ui ansible-sidebar-shell ansible-sidebar-loading">
                <p className="ansible-sidebar-welcome-text">Loading Ansible…</p>
            </div>
        );
    }

    return (
        <SidebarShell
            snapshot={snapshot}
            openSectionId={openSectionId}
            onOpenSectionChange={setOpenSectionId}
            onWelcomeAction={(command, _sectionId, args) => {
                postAction(command, args);
            }}
            onNodeAction={(command, _nodeId, args) => {
                postAction(command, args);
            }}
            onNodeExpand={postExpand}
        />
    );
}
