import * as vscode from 'vscode';
import { LightspeedCommands } from '../definitions';
import { ANSIBLE_LIGHTSPEED_AUTH_ID } from '../utils/webUtils';

class LightspeedTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        command?: vscode.Command,
        icon?: vscode.ThemeIcon,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = command;
        this.iconPath = icon;
    }
}

export class LightspeedViewProvider implements vscode.TreeDataProvider<LightspeedTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LightspeedTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _isAuthenticated = false;

    refresh(isAuthenticated: boolean) {
        this._isAuthenticated = isAuthenticated;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: LightspeedTreeItem): LightspeedTreeItem {
        return element;
    }

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
