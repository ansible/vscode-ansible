import * as vscode from 'vscode';
import * as path from 'path';
import { PlaybooksService, PlaybookInfo, PlaybookPlay } from '../services/PlaybooksService';
import { log } from '../extension';

type TreeNode = WorkspaceFolderNode | FolderNode | PlaybookNode | PlayNode | LoadingNode;

class WorkspaceFolderNode {
    constructor(
        public readonly folder: vscode.WorkspaceFolder
    ) {}
}

class FolderNode {
    constructor(
        public readonly name: string,
        public readonly fullPath: string,
        public readonly workspaceFolder: vscode.WorkspaceFolder
    ) {}
}

class PlaybookNode {
    constructor(
        public readonly playbook: PlaybookInfo
    ) {}
}

class PlayNode {
    constructor(
        public readonly play: PlaybookPlay,
        public readonly playbook: PlaybookInfo
    ) {}
}

class LoadingNode {
    constructor(public readonly message: string) {}
}

export class PlaybooksProvider implements vscode.TreeDataProvider<TreeNode> {
    private _service: PlaybooksService;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        this._service = PlaybooksService.getInstance();
        
        // Listen for service changes
        this._service.onDidChange(() => {
            this._onDidChangeTreeData.fire();
        });

        // Initial load
        log('PlaybooksProvider: Triggering initial refresh');
        this._service.refresh();
    }

    public refresh(): void {
        this._service.refresh();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element instanceof LoadingNode) {
            const item = new vscode.TreeItem(element.message);
            item.iconPath = new vscode.ThemeIcon('sync~spin');
            return item;
        }

        if (element instanceof WorkspaceFolderNode) {
            const item = new vscode.TreeItem(
                element.folder.name,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.iconPath = new vscode.ThemeIcon('root-folder');
            item.contextValue = 'workspaceFolder';
            item.tooltip = element.folder.uri.fsPath;
            return item;
        }

        if (element instanceof FolderNode) {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Collapsed
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
                vscode.TreeItemCollapsibleState.Collapsed
            );
            
            item.iconPath = new vscode.ThemeIcon('notebook');
            item.description = `${playbook.plays.length} play${playbook.plays.length !== 1 ? 's' : ''}`;
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
                arguments: [playbook]
            };

            return item;
        }

        if (element instanceof PlayNode) {
            const play = element.play;
            const item = new vscode.TreeItem(
                play.name,
                vscode.TreeItemCollapsibleState.None
            );
            
            item.iconPath = new vscode.ThemeIcon('target');
            item.description = `hosts: ${play.hosts}`;
            item.contextValue = 'play';
            
            // Tooltip
            const tooltip = new vscode.MarkdownString();
            tooltip.appendMarkdown(`**Play:** ${play.name}\n\n`);
            tooltip.appendMarkdown(`**Hosts:** \`${play.hosts}\`\n\n`);
            tooltip.appendMarkdown(`**Line:** ${play.lineNumber}`);
            item.tooltip = tooltip;

            // Click to go to line
            item.command = {
                command: 'ansiblePlaybooks.goToPlay',
                title: 'Go to Play',
                arguments: [element.playbook, play]
            };

            return item;
        }

        return new vscode.TreeItem('Unknown');
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
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

            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            
            // Single workspace - show folder hierarchy directly
            if (workspaceFolders.length === 1) {
                return this._buildFolderHierarchy(playbooks, workspaceFolders[0]);
            }
            
            // Multi-root - show workspace folders as top level
            return workspaceFolders.map(folder => new WorkspaceFolderNode(folder));
        }

        if (element instanceof WorkspaceFolderNode) {
            // Show folder hierarchy for this workspace
            const allPlaybooks = this._service.getPlaybooks();
            const folderPath = element.folder.uri.fsPath;
            const folderPlaybooks = allPlaybooks.filter(pb => pb.path.startsWith(folderPath));
            return this._buildFolderHierarchy(folderPlaybooks, element.folder);
        }

        if (element instanceof FolderNode) {
            // Show contents of this folder
            const allPlaybooks = this._service.getPlaybooks();
            const folderPlaybooks = allPlaybooks.filter(pb => pb.path.startsWith(element.fullPath));
            return this._buildFolderContents(folderPlaybooks, element.fullPath, element.workspaceFolder);
        }

        if (element instanceof PlaybookNode) {
            // Show plays for this playbook
            return element.playbook.plays.map(play => new PlayNode(play, element.playbook));
        }

        return [];
    }

    private _buildFolderHierarchy(playbooks: PlaybookInfo[], workspaceFolder: vscode.WorkspaceFolder): TreeNode[] {
        const rootPath = workspaceFolder.uri.fsPath;
        return this._buildFolderContents(playbooks, rootPath, workspaceFolder);
    }

    private _buildFolderContents(playbooks: PlaybookInfo[], folderPath: string, workspaceFolder: vscode.WorkspaceFolder): TreeNode[] {
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
                subfolders.get(subfolderName)!.push(playbook);
            }
        }

        // Add subfolders first (sorted)
        const sortedFolders = Array.from(subfolders.keys()).sort();
        for (const folderName of sortedFolders) {
            nodes.push(new FolderNode(
                folderName,
                path.join(folderPath, folderName),
                workspaceFolder
            ));
        }

        // Add playbooks (sorted by name)
        const sortedPlaybooks = directPlaybooks.sort((a, b) => 
            path.basename(a.path).localeCompare(path.basename(b.path))
        );
        for (const playbook of sortedPlaybooks) {
            nodes.push(new PlaybookNode(playbook));
        }

        return nodes;
    }
}
