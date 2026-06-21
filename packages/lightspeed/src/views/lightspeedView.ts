import * as vscode from 'vscode';
import { LightspeedCommands } from '../definitions';

/**
 * A tree item representing a single entry in the Lightspeed sidebar view.
 */
class LightspeedTreeItem extends vscode.TreeItem {
    /**
     * Creates a new Lightspeed tree item.
     * @param label - The display text for the tree item
     * @param command - The command to execute when the item is clicked
     * @param icon - The icon to display beside the label
     */
    constructor(label: string, command?: vscode.Command, icon?: vscode.ThemeIcon) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = command;
        this.iconPath = icon;
    }
}

/**
 * Provides tree data for the Lightspeed sidebar view.
 */
export class LightspeedViewProvider implements vscode.TreeDataProvider<LightspeedTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LightspeedTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _isAuthenticated = false;

    /**
     * Refreshes the tree view based on the current authentication state.
     * @param isAuthenticated - Whether the user is currently authenticated
     */
    refresh(isAuthenticated: boolean) {
        this._isAuthenticated = isAuthenticated;
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Returns the tree item representation for the given element.
     * @param element - The tree item to return
     * @returns The tree item itself
     */
    getTreeItem(element: LightspeedTreeItem): LightspeedTreeItem {
        return element;
    }

    /**
     * Returns the child tree items based on the authentication state.
     * @returns An array of tree items for the Lightspeed sidebar
     */
    getChildren(): LightspeedTreeItem[] {
        if (!this._isAuthenticated) {
            return [
                new LightspeedTreeItem(
                    'Sign in to Ansible Lightspeed',
                    {
                        command: LightspeedCommands.LIGHTSPEED_AUTH_REQUEST,
                        title: 'Sign in',
                    },
                    new vscode.ThemeIcon('sign-in'),
                ),
            ];
        }

        return [
            new LightspeedTreeItem(
                'Generate Playbook',
                {
                    command: LightspeedCommands.LIGHTSPEED_PLAYBOOK_GENERATION,
                    title: 'Generate Playbook',
                },
                new vscode.ThemeIcon('wand'),
            ),
            new LightspeedTreeItem(
                'Generate Role',
                {
                    command: LightspeedCommands.LIGHTSPEED_ROLE_GENERATION,
                    title: 'Generate Role',
                },
                new vscode.ThemeIcon('wand'),
            ),
            new LightspeedTreeItem(
                'Explain Playbook',
                {
                    command: LightspeedCommands.LIGHTSPEED_PLAYBOOK_EXPLANATION,
                    title: 'Explain Playbook',
                },
                new vscode.ThemeIcon('book'),
            ),
            new LightspeedTreeItem(
                'Explain Role',
                {
                    command: LightspeedCommands.LIGHTSPEED_ROLE_EXPLANATION,
                    title: 'Explain Role',
                },
                new vscode.ThemeIcon('book'),
            ),
        ];
    }
}
