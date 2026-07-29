/**
 * Playbooks NavTree section.
 */
import * as path from 'path';
import type { SidebarNodeAction, SidebarSection, SidebarTreeNode } from '@ansible/common';
import type { DiscoveredPlaybook } from '../../PlaybookDiscovery';
import type { SidebarModelInput } from '../types';

/**
 * Build the Playbooks section (folder hierarchy + multi-root like PlaybooksController).
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildPlaybooks(input: SidebarModelInput): SidebarSection {
    const headerActions: SidebarNodeAction[] = [
        {
            id: 'pb-defaults',
            label: 'Edit Default Configuration',
            icon: 'settings-gear',
            command: 'ansiblePlaybooks.editDefaults',
        },
        {
            id: 'pb-refresh',
            label: 'Refresh',
            icon: 'refresh',
            command: 'ansiblePlaybooks.refresh',
        },
    ];
    // Legacy single-root callers may still set `playbooks` on the input bag.
    const legacyPlaybooks = (input as { playbooks?: DiscoveredPlaybook[] }).playbooks ?? [];
    const workspaces =
        input.playbookWorkspaces ??
        (legacyPlaybooks.length > 0 ? [{ name: '', path: '', playbooks: legacyPlaybooks }] : []);
    const total = workspaces.reduce((n, ws) => n + ws.playbooks.length, 0);
    if (total === 0) {
        return {
            id: 'playbooks',
            title: 'Playbooks',
            headerActions,
            welcome: 'No playbooks found in the workspace.',
            nodes: [],
        };
    }
    let nodes: SidebarTreeNode[];
    if (workspaces.length === 1) {
        const ws = workspaces[0];
        nodes = buildPlaybookFolderContents(
            ws.playbooks,
            ws.path || path.dirname(ws.playbooks[0]?.path ?? ''),
            input.enableAiFeatures,
        );
    } else {
        nodes = workspaces.map((ws) => ({
            id: `ws-${ws.path}`,
            label: ws.name || path.basename(ws.path),
            tooltip: ws.path,
            icon: 'root-folder',
            children: buildPlaybookFolderContents(ws.playbooks, ws.path, input.enableAiFeatures),
        }));
    }
    return {
        id: 'playbooks',
        title: 'Playbooks',
        headerActions,
        nodes,
    };
}

/**
 * Folder + playbook nodes for one directory (mirrors PlaybooksController._buildFolderContents).
 * @param playbooks - Playbooks under the workspace
 * @param folderPath - Absolute folder path being rendered
 * @param enableAiFeatures - AI summary on playbook rows
 * @returns Sorted subfolder and playbook nodes
 */
export function buildPlaybookFolderContents(
    playbooks: DiscoveredPlaybook[],
    folderPath: string,
    enableAiFeatures: boolean,
): SidebarTreeNode[] {
    const subfolders = new Map<string, DiscoveredPlaybook[]>();
    const direct: DiscoveredPlaybook[] = [];
    for (const pb of playbooks) {
        const relative = folderPath
            ? path.relative(folderPath, pb.path)
            : pb.relativePath || path.basename(pb.path);
        const parts = relative.split(path.sep).filter(Boolean);
        if (parts.length <= 1) {
            direct.push(pb);
        } else {
            const sub = parts[0];
            const list = subfolders.get(sub) ?? [];
            list.push(pb);
            subfolders.set(sub, list);
        }
    }
    const nodes: SidebarTreeNode[] = [];
    for (const name of [...subfolders.keys()].sort()) {
        const childPath = folderPath ? path.join(folderPath, name) : name;
        nodes.push({
            id: `pbfolder-${childPath}`,
            label: name,
            tooltip: childPath,
            icon: 'folder',
            children: buildPlaybookFolderContents(
                subfolders.get(name) ?? [],
                childPath,
                enableAiFeatures,
            ),
        });
    }
    for (const pb of direct.sort((a, b) =>
        path.basename(a.path).localeCompare(path.basename(b.path)),
    )) {
        nodes.push(buildPlaybookNode(pb, enableAiFeatures));
    }
    return nodes;
}

/**
 * Single playbook row with native inline actions and goToPlay on plays.
 * @param pb - Discovered playbook
 * @param enableAiFeatures - Include AI summary action
 * @returns Tree node
 */
export function buildPlaybookNode(
    pb: DiscoveredPlaybook,
    enableAiFeatures: boolean,
): SidebarTreeNode {
    const playCount = pb.plays.length;
    const basename = path.basename(pb.path);
    const playbookPlain = {
        name: basename,
        path: pb.path,
        relativePath: pb.relativePath,
        plays: pb.plays,
    };
    const playbookArg = { playbook: playbookPlain };
    const playLines = pb.plays.map((p) => `- ${p.name || 'Play'} (hosts: ${p.hosts})`).join('\n');
    const pbTooltip = [basename, '', pb.path, ...(playLines ? ['', 'Plays:', playLines] : [])].join(
        '\n',
    );
    return {
        id: `pb-${pb.path}`,
        label: basename,
        description: `${String(playCount)} play${playCount !== 1 ? 's' : ''}`,
        tooltip: pbTooltip,
        icon: 'notebook',
        actions: [
            {
                id: `run-${pb.path}`,
                label: 'Run Playbook',
                icon: 'play',
                command: 'ansiblePlaybooks.run',
                args: [playbookArg],
            },
            {
                id: `progress-${pb.path}`,
                label: 'Run with Progress Viewer',
                icon: 'graph',
                command: 'ansiblePlaybooks.runWithProgress',
                args: [playbookArg],
            },
            {
                id: `open-${pb.path}`,
                label: 'Edit Playbook',
                icon: 'edit',
                command: 'ansiblePlaybooks.openPlaybook',
                args: [playbookArg],
            },
            {
                id: `config-${pb.path}`,
                label: 'Edit Configuration',
                icon: 'gear',
                command: 'ansiblePlaybooks.editConfig',
                args: [playbookArg],
            },
            ...(enableAiFeatures
                ? [
                      {
                          id: `ai-${pb.path}`,
                          label: 'Generate AI Summary',
                          icon: 'sparkle',
                          command: 'ansiblePlaybooks.aiSummary',
                          args: [playbookArg],
                      },
                  ]
                : []),
        ],
        children: pb.plays.map((play, index) => ({
            id: `play-${pb.path}-${String(index)}`,
            label: play.name || `Play ${String(index + 1)}`,
            description: `hosts: ${play.hosts}`,
            tooltip: [
                `Play: ${play.name || `Play ${String(index + 1)}`}`,
                `Hosts: ${play.hosts}`,
                `Line: ${String(play.lineNumber)}`,
            ].join('\n'),
            icon: 'target',
            actions: [
                {
                    id: `goto-${pb.path}-${String(index)}`,
                    label: 'Go to Play',
                    icon: 'go-to-file',
                    command: 'ansiblePlaybooks.goToPlay',
                    args: [playbookPlain, play],
                },
            ],
        })),
    };
}
