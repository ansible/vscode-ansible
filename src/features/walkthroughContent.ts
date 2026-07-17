/**
 * Shared walkthrough content helpers.
 *
 * Single source of truth is `contributes.walkthroughs` in package.json
 * (plus referenced media markdown files). The Cursor-safe getting-started
 * panel and any future consumers read that contribution — do not duplicate
 * step copy in TypeScript.
 */

export interface WalkthroughStepContribution {
    id: string;
    title: string;
    description: string;
    media?: { markdown?: string; image?: string; altText?: string };
    completionEvents?: string[];
}

export interface WalkthroughContribution {
    id: string;
    title: string;
    description: string;
    steps: WalkthroughStepContribution[];
}

export interface ExtensionPackageJson {
    name?: string;
    publisher?: string;
    contributes?: {
        walkthroughs?: WalkthroughContribution[];
    };
}

/**
 * Resolve a walkthrough contribution by id from extension package.json.
 *
 * @param packageJson - Extension package.json object
 * @param walkthroughId - Short id (e.g. ansible-getting-started) or FQN
 * @returns Matching walkthrough, or undefined
 */
export function getContributedWalkthrough(
    packageJson: ExtensionPackageJson,
    walkthroughId: string,
): WalkthroughContribution | undefined {
    const walkthroughs = packageJson.contributes?.walkthroughs ?? [];
    const shortId = walkthroughId.includes('#')
        ? (walkthroughId.split('#').pop() ?? walkthroughId)
        : walkthroughId;
    return walkthroughs.find((w) => w.id === shortId);
}

/**
 * Fully-qualified walkthrough id for telemetry (`publisher.name#id`).
 *
 * @param packageJson - Extension package.json object
 * @param walkthroughId - Short walkthrough id
 * @returns FQN string
 */
export function walkthroughFqn(packageJson: ExtensionPackageJson, walkthroughId: string): string {
    const shortId = walkthroughId.includes('#')
        ? (walkthroughId.split('#').pop() ?? walkthroughId)
        : walkthroughId;
    const publisher = packageJson.publisher ?? 'redhat';
    const name = packageJson.name ?? 'ansible';
    return `${publisher}.${name}#${shortId}`;
}

/**
 * Build a markdown document from a walkthrough contribution and media files.
 *
 * @param walkthrough - Contribution from package.json
 * @param mediaByPath - Map of relative media path → file contents
 * @returns Markdown document string
 */
export function buildWalkthroughMarkdown(
    walkthrough: WalkthroughContribution,
    mediaByPath: Record<string, string>,
): string {
    const parts: string[] = [`# ${walkthrough.title}`, '', walkthrough.description, ''];

    for (const step of walkthrough.steps) {
        parts.push(`## ${step.title}`, '', step.description, '');
        const mediaPath = step.media?.markdown;
        if (mediaPath) {
            const media = mediaByPath[mediaPath];
            if (media) {
                parts.push(media.trim(), '');
            }
        }
    }

    return parts.join('\n');
}

/**
 * Escape text for HTML text nodes / attributes.
 *
 * @param value - Raw string
 * @returns Escaped string
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Convert walkthrough markdown (including `command:` links) to simple HTML.
 *
 * @param markdown - Markdown fragment
 * @returns HTML fragment safe for a trusted webview with command URIs enabled
 */
export function walkthroughMarkdownToHtml(markdown: string): string {
    const escaped = escapeHtml(markdown);
    const withLinks = escaped.replace(
        /\[([^\]]+)\]\(command:([^)]+)\)/g,
        (_m, label: string, command: string) => `<a href="command:${command}">${label}</a>`,
    );
    return withLinks.replace(/\n/g, '<br/>\n');
}

/**
 * Build full HTML for the getting-started webview from a walkthrough.
 *
 * @param walkthrough - Contribution from package.json
 * @param mediaByPath - Map of relative media path → file contents
 * @param nonce - CSP nonce for the document
 * @returns Complete HTML document
 */
export function buildWalkthroughHtml(
    walkthrough: WalkthroughContribution,
    mediaByPath: Record<string, string>,
    nonce: string,
): string {
    const stepsHtml = walkthrough.steps
        .map((step) => {
            const mediaPath = step.media?.markdown;
            const media = mediaPath ? mediaByPath[mediaPath] : undefined;
            const mediaBlock = media
                ? `<div class="media">${walkthroughMarkdownToHtml(media)}</div>`
                : '';
            return `<section class="step">
  <h2>${escapeHtml(step.title)}</h2>
  <p>${walkthroughMarkdownToHtml(step.description)}</p>
  ${mediaBlock}
</section>`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';"/>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 1.5rem 2rem; line-height: 1.5; max-width: 52rem; }
  h1 { font-size: 1.6rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.15rem; margin: 1.75rem 0 0.5rem; }
  .lead { opacity: 0.9; margin-bottom: 1.5rem; }
  .step { border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35)); padding-top: 0.75rem; }
  .media { margin-top: 0.75rem; padding: 0.75rem 1rem; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12)); border-radius: 4px; }
  a { color: var(--vscode-textLink-foreground); }
</style>
</head>
<body>
  <h1>${escapeHtml(walkthrough.title)}</h1>
  <p class="lead">${walkthroughMarkdownToHtml(walkthrough.description)}</p>
  ${stepsHtml}
</body>
</html>`;
}
