import * as vscode from 'vscode';
import * as path from 'path';
import { PlaybooksService, PlaybookInfo, PlaybookPlay } from '@src/services/PlaybooksService';
import { log } from '@src/extension';

type TreeNode = WorkspaceFolderNode | FolderNode | PlaybookNode | PlayNode | LoadingNode;

/** Tree node representing a workspace folder in a multi-root workspace. */
class WorkspaceFolderNode {
    /**
     * Create a workspace folder node for multi-root playbook browsing.
     * @param folder - Workspace folder whose playbooks should be shown
     */
    constructor(public readonly folder: vscode.WorkspaceFolder) {}
}

/** Tree node representing a subdirectory that contains playbooks. */
class FolderNode {
    /**
     * Create a folder node within a workspace playbook hierarchy.
     * @param name - Folder name shown in the tree
     * @param fullPath - Absolute path to the folder on disk
     * @param workspaceFolder - Workspace folder that owns this path
     */
    constructor(
        public readonly name: string,
        public readonly fullPath: string,
        public readonly workspaceFolder: vscode.WorkspaceFolder,
    ) {}
}

/** Tree node representing a discovered Ansible playbook file. */
class PlaybookNode {
    /**
     * Create a playbook node from discovered playbook metadata.
     * @param playbook - Parsed playbook information from the workspace scan
     */
    constructor(public readonly playbook: PlaybookInfo) {}
}

/** Tree node representing a single play within a playbook. */
class PlayNode {
    /**
     * Create a play node linked back to its parent playbook.
     * @param play - Parsed play metadata from the playbook
     * @param playbook - Parent playbook containing the play
     */
    constructor(
        public readonly play: PlaybookPlay,
        public readonly playbook: PlaybookInfo,
    ) {}
}

/** Placeholder tree node shown while playbooks are loading or absent. */
class LoadingNode {
    /**
     * Create a loading or empty-state node with a status message.
     * @param message - Status text shown in the tree
     */
    constructor(public readonly message: string) {}
}

/** Tree view provider for workspace playbooks and their plays. */
export class PlaybooksProvider implements vscode.TreeDataProvider<TreeNode> {
    private _service: PlaybooksService;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Create the provider and trigger an initial playbook discovery pass. */
    constructor() {
        this._service = PlaybooksService.getInstance();

        // Listen for service changes
        this._service.onDidChange(() => {
            this._onDidChangeTreeData.fire(undefined);
        });

        // Initial load
        log('PlaybooksProvider: Triggering initial refresh');
        void this._service.refresh();
    }

    /** Reload playbooks from the workspace and refresh the tree. */
    public refresh(): void {
        void this._service.refresh();
    }

    /**
     * Render a workspace folder, folder, playbook, play, or loading node.
     * @param element - Tree node to display
     * @returns Tree item with icons, tooltips, and navigation commands
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element instanceof LoadingNode) {
            const item = new vscode.TreeItem(element.message);
            item.iconPath = new vscode.ThemeIcon('sync~spin');
            return item;
        }

        if (element instanceof WorkspaceFolderNode) {
            const item = new vscode.TreeItem(
                element.folder.name,
                vscode.TreeItemCollapsibleState.Expanded,
            );
            item.iconPath = new vscode.ThemeIcon('root-folder');
            item.contextValue = 'workspaceFolder';
            item.tooltip = element.folder.uri.fsPath;
            return item;
        }

        if (element instanceof FolderNode) {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Collapsed,
            );
            item.iconPath = new vscode.ThemeIcon('folder');
            item.contextValue = 'folder';
            item.tooltip = element.fullPath;
            return item;
        }

        if (element instanceof PlaybookNode) {
            const playbook = element.playbook;
            const item = new vscode.TreeItem(
                path.basename(playbook.path),
                vscode.TreeItemCollapsibleState.Collapsed,
            );

            item.iconPath = new vscode.ThemeIcon('notebook');
            item.description = `${String(playbook.plays.length)} play${playbook.plays.length !== 1 ? 's' : ''}`;
            item.contextValue = 'playbook';

            // Tooltip with path and details
            const tooltip = new vscode.MarkdownString();
            tooltip.appendMarkdown(`**${playbook.name}**\n\n`);
            tooltip.appendMarkdown(`📂 \`${playbook.path}\`\n\n`);
            tooltip.appendMarkdown(`**Plays:**\n`);
            for (const play of playbook.plays) {
                tooltip.appendMarkdown(`- ${play.name} (hosts: \`${play.hosts}\`)\n`);
            }
            item.tooltip = tooltip;

            // Store playbook info for commands
            item.command = {
                command: 'ansiblePlaybooks.openPlaybook',
                title: 'Open Playbook',
                arguments: [playbook],
            };

            return item;
        }

        if (element instanceof PlayNode) {
            const play = element.play;
            const item = new vscode.TreeItem(play.name, vscode.TreeItemCollapsibleState.None);

            item.iconPath = new vscode.ThemeIcon('target');
            item.description = `hosts: ${play.hosts}`;
            item.contextValue = 'play';

            // Tooltip
            const tooltip = new vscode.MarkdownString();
            tooltip.appendMarkdown(`**Play:** ${play.name}\n\n`);
            tooltip.appendMarkdown(`**Hosts:** \`${play.hosts}\`\n\n`);
            tooltip.appendMarkdown(`**Line:** ${String(play.lineNumber)}`);
            item.tooltip = tooltip;

            // Click to go to line
            item.command = {
                command: 'ansiblePlaybooks.goToPlay',
                title: 'Go to Play',
                arguments: [element.playbook, play],
            };

            return item;
        }

        return new vscode.TreeItem('Unknown');
    }

    /**
     * Return workspace roots, folder contents, plays, or loading placeholders.
     * @param element - Parent node whose children should be listed
     * @returns Child nodes for the requested tree level
     */
    getChildren(element?: TreeNode): TreeNode[] | Promise<TreeNode[]> {
        if (!element) {
            // Root level
            if (this._service.isLoading()) {
                return [new LoadingNode('Discovering playbooks...')];
            }

            const playbooks = this._service.getPlaybooks();

            if (playbooks.length === 0) {
                if (this._service.isLoaded()) {
                    return [new LoadingNode('No playbooks found')];
                }
                return [new LoadingNode('Discovering playbooks...')];
            }

            const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

            // Single workspace - show folder hierarchy directly
            if (workspaceFolders.length === 1) {
                return this._buildFolderHierarchy(playbooks, workspaceFolders[0]);
            }

            // Multi-root - show workspace folders as top level
            return workspaceFolders.map((folder) => new WorkspaceFolderNode(folder));
        }

        if (element instanceof WorkspaceFolderNode) {
            // Show folder hierarchy for this workspace
            const allPlaybooks = this._service.getPlaybooks();
            const folderPath = element.folder.uri.fsPath;
            const folderPlaybooks = allPlaybooks.filter((pb) => pb.path.startsWith(folderPath));
            return this._buildFolderHierarchy(folderPlaybooks, element.folder);
        }

        if (element instanceof FolderNode) {
            // Show contents of this folder
            const allPlaybooks = this._service.getPlaybooks();
            const folderPlaybooks = allPlaybooks.filter((pb) =>
                pb.path.startsWith(element.fullPath),
            );
            return this._buildFolderContents(
                folderPlaybooks,
                element.fullPath,
                element.workspaceFolder,
            );
        }

        if (element instanceof PlaybookNode) {
            // Show plays for this playbook
            return element.playbook.plays.map((play) => new PlayNode(play, element.playbook));
        }

        return [];
    }

    /**
     * Build the folder and playbook hierarchy for a workspace root.
     * @param playbooks - Playbooks discovered within the workspace
     * @param workspaceFolder - Workspace folder used as the hierarchy root
     * @returns Top-level folder and playbook nodes for the workspace
     */
    private _buildFolderHierarchy(
        playbooks: PlaybookInfo[],
        workspaceFolder: vscode.WorkspaceFolder,
    ): TreeNode[] {
        const rootPath = workspaceFolder.uri.fsPath;
        return this._buildFolderContents(playbooks, rootPath, workspaceFolder);
    }

    /**
     * Build child folder and playbook nodes for a specific directory.
     * @param playbooks - Playbooks that live under the target folder
     * @param folderPath - Absolute path of the folder being expanded
     * @param workspaceFolder - Workspace folder that owns the path
     * @returns Sorted subfolder and playbook nodes for the directory
     */
    private _buildFolderContents(
        playbooks: PlaybookInfo[],
        folderPath: string,
        workspaceFolder: vscode.WorkspaceFolder,
    ): TreeNode[] {
        const nodes: TreeNode[] = [];
        const subfolders = new Map<string, PlaybookInfo[]>();
        const directPlaybooks: PlaybookInfo[] = [];

        for (const playbook of playbooks) {
            const relativePath = path.relative(folderPath, playbook.path);
            const parts = relativePath.split(path.sep);

            if (parts.length === 1) {
                // Playbook is directly in this folder
                directPlaybooks.push(playbook);
            } else {
                // Playbook is in a subfolder
                const subfolderName = parts[0];
                if (!subfolders.has(subfolderName)) {
                    subfolders.set(subfolderName, []);
                }
                subfolders.get(subfolderName)?.push(playbook);
            }
        }

        // Add subfolders first (sorted)
        const sortedFolders = Array.from(subfolders.keys()).sort();
        for (const folderName of sortedFolders) {
            nodes.push(
                new FolderNode(folderName, path.join(folderPath, folderName), workspaceFolder),
            );
        }

        // Add playbooks (sorted by name)
        const sortedPlaybooks = directPlaybooks.sort((a, b) =>
            path.basename(a.path).localeCompare(path.basename(b.path)),
        );
        for (const playbook of sortedPlaybooks) {
            nodes.push(new PlaybookNode(playbook));
        }

        return nodes;
    }
}
