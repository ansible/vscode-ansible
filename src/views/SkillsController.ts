/**
 * Skills controller
 *
 * Loads AI development skills from configured sources for the sidebar NavTree.
 */

import * as vscode from 'vscode';
import {
    SkillRegistry,
    buildSkillLoadPrompt,
    buildSkillClipboardPrompt,
} from '@ansible/developer-services';
import type { SkillEntry } from '@ansible/developer-services';
import { openChatWithPrompt } from '@src/features/chatProvider';
import { log } from '@src/extension';

/** NavTree data source for configured Ansible AI skills. */
export class SkillsController {
    private _onDidChange = new vscode.EventEmitter<void>();

    readonly onDidChange = this._onDidChange.event;

    private _registry: SkillRegistry;

    /** Initializes the controller with a shared SkillRegistry instance. */
    constructor() {
        this._registry = SkillRegistry.getInstance();
    }

    /** Trigger a full reload of all skill sources. */
    refresh(): void {
        this._onDidChange.fire(undefined);

        this._registry
            .refresh()
            .then(() => {
                this._onDidChange.fire(undefined);
                this._notifyEmptySources();
            })
            .catch((err: unknown) => {
                log(`SkillsController: refresh failed: ${String(err)}`);
                this._onDidChange.fire(undefined);
            });
    }

    /**
     * Show an informational notification for user-added sources that loaded
     * zero skills. Default sources (like ai-forge) are silently hidden from
     * the NavTree and do not trigger a notification.
     */
    private _notifyEmptySources(): void {
        const sources = this._registry.getSources();
        const allSkills = this._registry.getAllSkills();
        const defaultSourceIds = new Set(['builtin', 'ai-forge']);

        for (const source of sources) {
            if (defaultSourceIds.has(source.id)) continue;
            const count = allSkills.filter((s) => s.source === source.id).length;
            if (count === 0) {
                void vscode.window
                    .showInformationMessage(
                        `Skill source "${source.id}" loaded 0 skills. The URL may not point to a supported skill repository.`,
                        'Open Settings',
                    )
                    .then((choice) => {
                        if (choice === 'Open Settings') {
                            void vscode.commands.executeCommand(
                                'workbench.action.openSettings',
                                'ansibleEnvironments.skillSources',
                            );
                        }
                    });
            }
        }
    }
}

/**
 * Open the AI chat with a lightweight prompt that directs the agent
 * to fetch the skill via MCP rather than injecting the full content.
 *
 * @param skill - The skill entry to use.
 */
export async function openChatWithSkill(skill: SkillEntry): Promise<void> {
    const prompt = buildSkillLoadPrompt(skill.name, skill.id, skill.description);
    await openChatWithPrompt(prompt);
}

/**
 * Copy a skill prompt to the clipboard.
 *
 * @param skill - The skill entry to copy the prompt for.
 */
export async function copySkillPrompt(skill: SkillEntry): Promise<void> {
    const prompt = buildSkillClipboardPrompt(skill.name, skill.id, skill.description);
    await vscode.env.clipboard.writeText(prompt);
    void vscode.window.showInformationMessage(`Prompt for "${skill.name}" copied to clipboard.`);
}
