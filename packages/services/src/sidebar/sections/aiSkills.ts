/**
 * AI Skills NavTree section.
 */
import type {
    SidebarNodeAction,
    SidebarSection,
    SidebarTreeNode,
    SkillEntry,
} from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build AI Skills (sources → modules → skills).
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildAiSkills(input: SidebarModelInput): SidebarSection {
    const sources = input.skillSources ?? [];
    const skills = input.skills ?? [];
    const trustIcon: Record<string, string> = {
        certified: 'verified',
        community: 'globe',
        partner: 'organization',
        private: 'lock',
    };
    const headerActions: SidebarNodeAction[] = [
        {
            id: 'skills-refresh',
            label: 'Refresh',
            icon: 'refresh',
            command: 'ansibleSkills.refresh',
        },
    ];
    if (sources.length === 0) {
        return {
            id: 'aiSkills',
            title: 'AI Skills',
            headerActions,
            nodes: [
                {
                    id: 'skills-empty',
                    label: 'No skill sources configured',
                    icon: 'warning',
                    warning: true,
                },
            ],
        };
    }
    // Native SkillsController: empty registry → single root message (not source list)
    if (skills.length === 0) {
        return {
            id: 'aiSkills',
            title: 'AI Skills',
            headerActions,
            nodes: [
                {
                    id: 'skills-none',
                    label: 'No skills available',
                    icon: 'info',
                },
            ],
        };
    }
    const nodes: SidebarTreeNode[] = sources.map((source) => {
        const sourceSkills = skills.filter((s) => s.source === source.id);
        const modules = new Map<string, SkillEntry[]>();
        for (const skill of sourceSkills) {
            const list = modules.get(skill.module) ?? [];
            list.push(skill);
            modules.set(skill.module, list);
        }
        let children: SidebarTreeNode[];
        if (sourceSkills.length === 0) {
            // Native: "No skills loaded. Browse available skills at {url}"
            const hint = source.url
                ? `Browse available skills at ${source.url}`
                : 'Configure access in Settings.';
            children = [
                {
                    id: `skill-empty-${source.id}`,
                    label: `No skills loaded. ${hint}`,
                    icon: 'info',
                },
            ];
        } else if (modules.size <= 1) {
            children = sourceSkills.map((skill) => ({
                id: `skill-${skill.id}`,
                label: skill.name,
                // Native SkillNode uses category as description
                description: skill.category,
                tooltip: formatSkillTooltip(skill),
                icon: 'mortar-board',
                actions: [
                    {
                        id: `skill-use-${skill.id}`,
                        label: 'Use in Chat',
                        icon: 'sparkle',
                        command: 'ansibleSkills.useInChat',
                        args: [skill],
                    },
                ],
            }));
        } else {
            children = [...modules.entries()].map(([mod, modSkills]) => ({
                id: `skill-mod-${source.id}-${mod}`,
                label: mod,
                description: `${String(modSkills.length)} skills`,
                icon: 'package',
                children: modSkills.map((skill) => ({
                    id: `skill-${skill.id}`,
                    label: skill.name,
                    description: skill.category,
                    tooltip: formatSkillTooltip(skill),
                    icon: 'mortar-board',
                    actions: [
                        {
                            id: `skill-use-${skill.id}`,
                            label: 'Use in Chat',
                            icon: 'sparkle',
                            command: 'ansibleSkills.useInChat',
                            args: [skill],
                        },
                    ],
                })),
            }));
        }
        return {
            id: `skill-src-${source.id}`,
            label: source.id,
            description:
                sourceSkills.length > 0
                    ? `${source.trust} · ${String(sourceSkills.length)} skills`
                    : `${source.trust} · no skills loaded`,
            tooltip: [
                source.id,
                '',
                `Type: ${source.type}`,
                `Trust: ${source.trust}`,
                `URL: ${source.url}`,
                `Skills: ${String(sourceSkills.length)}`,
            ].join('\n'),
            icon: trustIcon[source.trust] ?? 'globe',
            children,
        };
    });
    return {
        id: 'aiSkills',
        title: 'AI Skills',
        headerActions,
        nodes,
    };
}

/**
 * Plain-text hover content for a skill leaf (native SkillNode tooltip).
 * @param skill - Indexed skill
 * @returns Multiline tooltip
 */
function formatSkillTooltip(skill: SkillEntry): string {
    const lines = [
        skill.name,
        '',
        skill.description,
        '',
        `Source: ${skill.source} (${skill.trust})`,
        `Module: ${skill.module}`,
        `Category: ${skill.category}`,
    ];
    if (skill.domain) {
        lines.push(`Domain: ${skill.domain}`);
    }
    if (skill.triggers.length > 0) {
        lines.push(`Triggers: ${skill.triggers.join(', ')}`);
    }
    lines.push('', `skill_get({ skill_id: "${skill.id}" })`);
    return lines.join('\n');
}
