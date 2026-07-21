/**
 * Host-agnostic sidebar NavTree snapshot (ADR-025).
 * Consumed by @ansible/ui and produced by SidebarModel / host adapters.
 */

export type SidebarSectionId =
    | 'envManagers'
    | 'devTools'
    | 'collections'
    | 'collectionSources'
    | 'executionEnvironments'
    | 'creator'
    | 'playbooks'
    | 'aiTools'
    | 'aiSkills'
    | 'lightspeed';

/** Inline row action (`view/item/context` group:inline equivalent). */
export interface SidebarNodeAction {
    id: string;
    label: string;
    /** Codicon name without $(…), e.g. sparkle, play, book. */
    icon: string;
    command: string;
    /** Serializable args for the host command (not node ids). */
    args?: unknown[];
}

/**
 * Host payload for lazy tree expansion (e.g. Galaxy collection → plugin types).
 * The React shell posts this back; it does not fetch docs itself.
 */
export type SidebarNodeExpand =
    | {
          kind: 'galaxyCollection';
          namespace: string;
          name: string;
          version: string;
      }
    | {
          kind: 'githubCollection';
          org: string;
          namespace: string;
          name: string;
          version: string;
          repository: string;
      }
    | {
          kind: 'eeDetail';
          fullName: string;
      };

export interface SidebarTreeNode {
    id: string;
    label: string;
    description?: string;
    /**
     * Hover text matching native TreeItem.tooltip (plain text; newlines allowed).
     * Rendered by the NavTree webview on mouse-over.
     */
    tooltip?: string;
    icon?: string;
    warning?: boolean;
    selected?: boolean;
    actions?: SidebarNodeAction[];
    children?: SidebarTreeNode[];
    /**
     * When true, the row is expandable before `children` are known.
     * First expand asks the host to resolve {@link expand}.
     */
    lazyChildren?: boolean;
    /** Opaque-to-UI payload for host-side lazy expansion. */
    expand?: SidebarNodeExpand;
}

export type SidebarSectionSeverity = 'none' | 'info' | 'warning' | 'error';

/** Welcome-view action (`viewsWelcome` markdown link equivalent). */
export interface SidebarWelcomeAction {
    id: string;
    label: string;
    command: string;
    /** Optional command arguments (e.g. extension search query). */
    args?: unknown[];
}

export interface SidebarSection {
    id: SidebarSectionId;
    title: string;
    badge?: string;
    severity?: SidebarSectionSeverity;
    welcome?: string;
    welcomeActions?: SidebarWelcomeAction[];
    /**
     * Title-bar actions shown on header hover
     * (`menus["view/title"]` navigation group equivalent).
     */
    headerActions?: SidebarNodeAction[];
    /** True while the host is still hydrating this section's body. */
    loading?: boolean;
    nodes: SidebarTreeNode[];
}

export interface SidebarSnapshot {
    sections: SidebarSection[];
    /**
     * When set (non-null), the shell should open this section (issue-driven).
     * `null` / omitted means "do not change" the user's accordion selection
     * on progressive updates — only apply when the host has a suggestion.
     */
    suggestedOpenSectionId?: SidebarSectionId | null;
}

/** Plain env-manager input for SidebarModel (no vscode types). */
export interface SidebarEnvManagerInput {
    id: string;
    name: string;
    isGlobal: boolean;
    environments: {
        id: string;
        label: string;
        version?: string;
        /** sysPrefix or displayPath for native env tooltip. */
        path?: string;
        selected: boolean;
        warning?: boolean;
    }[];
}
