import { describe, it, expect } from 'vitest';
import {
    buildWalkthroughHtml,
    buildWalkthroughMarkdown,
    getContributedWalkthrough,
    walkthroughFqn,
    walkthroughMarkdownToHtml,
} from '../../../src/features/walkthroughContent';

const samplePackage = {
    name: 'ansible',
    publisher: 'redhat',
    contributes: {
        walkthroughs: [
            {
                id: 'ansible-getting-started',
                title: 'Get started with Ansible',
                description: 'Learn the sidebar.',
                steps: [
                    {
                        id: 'open-ansible-sidebar',
                        title: 'Open the Ansible activity bar',
                        description:
                            'Click the icon.\n[Open Ansible view](command:workbench.view.extension.ansible-environments)',
                        media: { markdown: 'media/walkthroughs/getting-started/sidebar.md' },
                    },
                ],
            },
        ],
    },
};

describe('walkthroughContent', () => {
    it('resolves short and FQN walkthrough ids from package.json', () => {
        expect(getContributedWalkthrough(samplePackage, 'ansible-getting-started')?.title).toBe(
            'Get started with Ansible',
        );
        expect(
            getContributedWalkthrough(samplePackage, 'redhat.ansible#ansible-getting-started')?.id,
        ).toBe('ansible-getting-started');
        expect(getContributedWalkthrough(samplePackage, 'missing')).toBeUndefined();
    });

    it('builds telemetry FQN from publisher and name', () => {
        expect(walkthroughFqn(samplePackage, 'ansible-getting-started')).toBe(
            'redhat.ansible#ansible-getting-started',
        );
    });

    it('builds markdown from contribution + media map (single content source)', () => {
        const walkthrough = getContributedWalkthrough(samplePackage, 'ansible-getting-started');
        expect(walkthrough).toBeDefined();
        if (!walkthrough) return;
        const md = buildWalkthroughMarkdown(walkthrough, {
            'media/walkthroughs/getting-started/sidebar.md': '# Ansible activity bar\n\nDetails.',
        });
        expect(md).toContain('# Get started with Ansible');
        expect(md).toContain('## Open the Ansible activity bar');
        expect(md).toContain('Open Ansible view');
        expect(md).toContain('# Ansible activity bar');
    });

    it('converts command markdown links to HTML anchors', () => {
        const html = walkthroughMarkdownToHtml(
            'Go [Open](command:workbench.view.extension.ansible-environments) now',
        );
        expect(html).toContain(
            '<a href="command:workbench.view.extension.ansible-environments">Open</a>',
        );
        expect(html).not.toContain('<script');
    });

    it('builds CSP-safe HTML with sidebar nav and one-step panels', () => {
        const walkthrough = getContributedWalkthrough(samplePackage, 'ansible-getting-started');
        expect(walkthrough).toBeDefined();
        if (!walkthrough) return;
        const html = buildWalkthroughHtml(
            walkthrough,
            {
                'media/walkthroughs/getting-started/sidebar.md': 'Sidebar help',
            },
            'testnonce',
        );
        expect(html).toContain('nonce-testnonce');
        expect(html).toContain("script-src 'nonce-testnonce'");
        expect(html).toContain('Get started with Ansible');
        expect(html).toContain('class="nav-item active"');
        expect(html).toContain('class="step-panel active"');
        expect(html).toContain('aria-label="Walkthrough steps"');
        expect(html).toContain('id="next"');
        expect(html).toContain('Sidebar help');
        expect(html).toContain('command:workbench.view.extension.ansible-environments');
    });
});
