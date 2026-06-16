/**
 * Skills Tree View Provider
 *
 * Displays AI development skills from configured sources, grouped by
 * source and module. Provides "Use in Chat" and "Copy Prompt" actions.
 */

import * as vscode from 'vscode';
import { SkillRegistry, buildSkillLoadPrompt, buildSkillClipboardPrompt } from '@ansible/services';
import type { SkillEntry, SkillSource } from '@ansible/services';
import { log } from '@src/extension';

type TreeNode = SourceNode | ModuleNode | SkillNode | MessageNode;

/** Static tree item showing an informational or warning message. */
class MessageNode extends vscode.TreeItem {
    /**
     * @param label - Text to display.
     * @param icon  - Optional codicon name (defaults to "info").
     */
    constructor(label: string, icon?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'skillMessage';
        this.iconPath = new vscode.ThemeIcon(icon ?? 'info');
    }
}

/** Tree item representing a configured skill source. */
class SourceNode extends vscode.TreeItem {
    /**
     * @param source     - Skill source metadata.
     * @param skillCount - Number of skills loaded from this source.
     */
    constructor(
        public readonly source: SkillSource,
        public readonly skillCount: number,
    ) {
        super(source.id, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'skillSource';
        this.description =
            skillCount > 0
                ? `${source.trust} · ${String(skillCount)} skills`
                : `${source.trust} · no skills loaded`;
        this.tooltip = new vscode.MarkdownString(
            `**${source.id}**\n\n` +
                `- Type: ${source.type}\n` +
                `- Trust: ${source.trust}\n` +
                `- URL: ${source.url}\n` +
                `- Skills: ${String(skillCount)}`,
        );

        const iconMap: Record<string, string> = {
            community: 'globe',
            certified: 'verified',
            partner: 'organization',
            private: 'lock',
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[source.trust] ?? 'globe');
    }
}

/** Tree item representing a module grouping within a source. */
class ModuleNode extends vscode.TreeItem {
    /**
     * @param moduleName - Module display name.
     * @param sourceId   - Parent source ID.
     * @param skillCount - Number of skills in this module.
     */
    constructor(
        public readonly moduleName: string,
        public readonly sourceId: string,
        public readonly skillCount: number,
    ) {
        super(moduleName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'skillModule';
        this.description = `${String(skillCount)} skills`;
        this.iconPath = new vscode.ThemeIcon('package');
    }
}

/** Leaf tree item representing a single skill. */
class SkillNode extends vscode.TreeItem {
    /** @param skill - The indexed skill entry. */
    constructor(public readonly skill: SkillEntry) {
        super(skill.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'skill';
        this.description = skill.category;
        this.tooltip = new vscode.MarkdownString(
            `**${skill.name}**\n\n` +
                `${skill.description}\n\n` +
                `- Source: ${skill.source} (${skill.trust})\n` +
                `- Module: ${skill.module}\n` +
                `- Category: ${skill.category}\n` +
                (skill.domain ? `- Domain: ${skill.domain}\n` : '') +
                (skill.triggers.length > 0 ? `- Triggers: ${skill.triggers.join(', ')}\n` : '') +
                `\n\`skill_get({ skill_id: "${skill.id}" })\``,
        );
        this.iconPath = new vscode.ThemeIcon('mortar-board');

        this.command = {
            command: 'ansibleSkills.useInChat',
            title: 'Use in Chat',
            arguments: [skill],
        };
    }
}

/** Tree data provider for the Ansible Skills sidebar view. */
export class SkillsProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _registry: SkillRegistry;
    private _loading = false;

    /** Initializes the provider with a shared SkillRegistry instance. */
    constructor() {
        this._registry = SkillRegistry.getInstance();
    }

    /** Trigger a full reload of all skill sources. */
    refresh(): void {
        this._loading = true;
        this._onDidChangeTreeData.fire(undefined);

        this._registry
            .refresh()
            .then(() => {
                this._loading = false;
                this._onDidChangeTreeData.fire(undefined);
                this._notifyEmptySources();
            })
            .catch((err: unknown) => {
                log(`SkillsProvider: refresh failed: ${String(err)}`);
                this._loading = false;
                this._onDidChangeTreeData.fire(undefined);
            });
    }

    /** @inheritdoc */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    /** @inheritdoc */
    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (this._loading) {
            return [new MessageNode('Loading skills...', 'loading~spin')];
        }

        // Root level: list sources
        if (!element) {
            await this._registry.ensureLoaded();
            const sources = this._registry.getSources();
            const allSkills = this._registry.getAllSkills();

            if (sources.length === 0) {
                return [new MessageNode('No skill sources configured', 'warning')];
            }

            if (allSkills.length === 0) {
                return [new MessageNode('No skills available', 'info')];
            }

            return sources.map((source) => {
                const count = allSkills.filter((s) => s.source === source.id).length;
                return new SourceNode(source, count);
            });
        }

        // Source level: list modules (or skills directly when only one module)
        if (element instanceof SourceNode) {
            const skills = this._registry
                .getAllSkills()
                .filter((s) => s.source === element.source.id);

            if (skills.length === 0) {
                return [new MessageNode('No skills loaded — check URL and auth', 'warning')];
            }

            const modules = new Map<string, SkillEntry[]>();
            for (const skill of skills) {
                const existing = modules.get(skill.module);
                if (existing) {
                    existing.push(skill);
                } else {
                    modules.set(skill.module, [skill]);
                }
            }

            if (modules.size === 1) {
                const [, modSkills] = [...modules.entries()][0];
                return modSkills.map((s) => new SkillNode(s));
            }

            return [...modules.entries()].map(
                ([mod, modSkills]) => new ModuleNode(mod, element.source.id, modSkills.length),
            );
        }

        // Module level: list skills
        if (element instanceof ModuleNode) {
            const skills = this._registry
                .getAllSkills()
                .filter((s) => s.source === element.sourceId && s.module === element.moduleName);
            return skills.map((s) => new SkillNode(s));
        }

        return [];
    }

    /** Show a warning notification for each source that loaded zero skills. */
    private _notifyEmptySources(): void {
        const sources = this._registry.getSources();
        const allSkills = this._registry.getAllSkills();

        for (const source of sources) {
            const count = allSkills.filter((s) => s.source === source.id).length;
            if (count === 0) {
                const isGitHub = source.url.includes('github.com');
                const hint = isGitHub
                    ? 'Check the URL points to a valid GitHub repo with skills.'
                    : 'The URL may not point to a supported skill repository.';
                void vscode.window
                    .showWarningMessage(
                        `Skill source "${source.id}" loaded 0 skills. ${hint}`,
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

    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
    } catch {
        await vscode.env.clipboard.writeText(prompt);
        const selection = await vscode.window.showInformationMessage(
            'Skill prompt copied to clipboard. Paste it into an agent chat session.',
            'Open Chat',
        );
        if (selection === 'Open Chat') {
            void vscode.commands.executeCommand('workbench.action.chat.open');
        }
    }
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
