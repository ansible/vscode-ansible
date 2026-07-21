/**
 * Lightspeed NavTree section.
 */
import type { SidebarSection } from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build Lightspeed section when the Lightspeed package is enabled.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildLightspeed(input: SidebarModelInput): SidebarSection {
    // Auth-gated like LightspeedViewProvider: sign-in only vs generation tools
    const items =
        input.lightspeedItems ??
        (input.lightspeedAuthenticated
            ? [
                  {
                      label: 'Generate Playbook',
                      icon: 'wand',
                      command: 'ansible.lightspeed.playbookGeneration',
                  },
                  {
                      label: 'Generate Role',
                      icon: 'wand',
                      command: 'ansible.lightspeed.roleGeneration',
                  },
                  {
                      label: 'Explain Playbook',
                      icon: 'book',
                      command: 'ansible.lightspeed.playbookExplanation',
                  },
                  {
                      label: 'Explain Role',
                      icon: 'book',
                      command: 'ansible.lightspeed.roleExplanation',
                  },
              ]
            : [
                  {
                      label: 'Sign in to Ansible Lightspeed',
                      icon: 'sign-in',
                      command: 'ansible.lightspeed.oauth',
                  },
              ]);
    return {
        id: 'lightspeed',
        title: 'Lightspeed',
        nodes: items.map((item) => ({
            id: `ls-${item.command}`,
            label: item.label,
            icon: item.icon,
            actions: [
                {
                    id: `ls-run-${item.command}`,
                    label: item.label,
                    icon: item.icon,
                    command: item.command,
                },
            ],
        })),
    };
}
