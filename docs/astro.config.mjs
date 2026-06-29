import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
    site: 'https://ansible.github.io',
    base: '/vscode-ansible',
    legacy: { collections: true },
    integrations: [
        starlight({
            title: 'Ansible Developer Tools',
            logo: {
                light: './src/assets/logo-dark.svg',
                dark: './src/assets/logo-light.svg',
            },
            social: [
                {
                    icon: 'github',
                    label: 'GitHub',
                    href: 'https://github.com/ansible/vscode-ansible',
                },
            ],
            customCss: [
                '@fontsource/red-hat-display/400.css',
                '@fontsource/red-hat-display/500.css',
                '@fontsource/red-hat-display/700.css',
                '@fontsource/red-hat-text/400.css',
                '@fontsource/red-hat-text/500.css',
                '@fontsource/red-hat-text/700.css',
                '@fontsource/red-hat-mono/400.css',
                '@fontsource/red-hat-mono/700.css',
                './src/styles/custom.css',
            ],
            sidebar: [
                {
                    label: 'Getting Started',
                    items: [
                        { slug: 'getting-started/overview' },
                        { slug: 'getting-started/installation' },
                        { slug: 'getting-started/configuration' },
                    ],
                },
                {
                    label: 'Python Tools',
                    items: [
                        { slug: 'python-tools/overview' },
                        { slug: 'python-tools/workflow' },
                        {
                            label: 'Scaffold',
                            items: [
                                { slug: 'python-tools/ansible-creator' },
                                { slug: 'python-tools/ansible-dev-environment' },
                            ],
                        },
                        {
                            label: 'Validate',
                            items: [
                                { slug: 'python-tools/ansible-lint' },
                                { slug: 'python-tools/molecule' },
                                { slug: 'python-tools/tox-ansible' },
                            ],
                        },
                        {
                            label: 'Execute & Ship',
                            items: [
                                { slug: 'python-tools/ansible-navigator' },
                                { slug: 'python-tools/ansible-builder' },
                                { slug: 'python-tools/ansible-sign' },
                            ],
                        },
                    ],
                },
                {
                    label: 'Editor Integration',
                    items: [
                        { slug: 'editor/vscode-extension' },
                        { slug: 'editor/cursor' },
                        { slug: 'editor/ibm-bob' },
                        { slug: 'editor/devspaces' },
                        { slug: 'editor/language-server' },
                        { slug: 'editor/settings' },
                    ],
                },
                {
                    label: 'AI & Agents',
                    items: [
                        { slug: 'ai/approach' },
                        { slug: 'ai/mcp-server' },
                        { slug: 'ai/plugin' },
                        { slug: 'ai/skills' },
                        { slug: 'ai/language-server' },
                        { slug: 'ai/connecting-agents' },
                    ],
                },
                {
                    label: 'Development',
                    items: [
                        { slug: 'development/contributing' },
                        { slug: 'development/architecture' },
                        { slug: 'development/testing' },
                    ],
                },
                {
                    label: 'Reference',
                    items: [
                        {
                            label: 'Python Tools',
                            items: [
                                { slug: 'python-tools/ansible-creator/reference' },
                                { slug: 'python-tools/ansible-dev-environment/reference' },
                                { slug: 'python-tools/ansible-lint/reference' },
                                { slug: 'python-tools/molecule/reference' },
                                { slug: 'python-tools/ansible-navigator/reference' },
                                { slug: 'python-tools/ansible-builder/reference' },
                            ],
                        },
                        { slug: 'reference/commands' },
                        { slug: 'reference/best-practices' },
                    ],
                },
                {
                    label: 'Roadmap',
                    items: [{ slug: 'roadmap/feature-ansible-ide-experience' }],
                },
            ],
        }),
    ],
});
