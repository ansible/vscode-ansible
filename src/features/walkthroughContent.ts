/**
 * Shared walkthrough content helpers.
 *
 * Single source of truth is `contributes.walkthroughs` in package.json
 * (plus referenced media markdown files). The Cursor-safe getting-started
 * panel and any future consumers read that contribution — do not duplicate
 * step copy in TypeScript.
 *
 * Content catalog for expanding steps: `.agents/skills/ux-walkthrough/walkthrough-modules.json`
 * (end-user modules only — not dogfood setup like F5/build).
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
 * Inline markdown → HTML (after the fragment has been HTML-escaped).
 *
 * @param escaped - Already-escaped text (may contain newlines)
 * @returns HTML with links, code, and emphasis
 */
function formatInlineMarkdown(escaped: string): string {
    return escaped
        .replace(
            /\[([^\]]+)\]\(command:([^)]+)\)/g,
            (_m, label: string, command: string) => `<a href="command:${command}">${label}</a>`,
        )
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * Convert walkthrough markdown (including `command:` links) to simple HTML.
 * Supports headings, paragraphs, inline code, bold, and command links —
 * enough for our media/*.md files without a full markdown dependency.
 *
 * @param markdown - Markdown fragment
 * @returns HTML fragment safe for a trusted webview with command URIs enabled
 */
export function walkthroughMarkdownToHtml(markdown: string): string {
    const blocks = markdown
        .replace(/\r\n/g, '\n')
        .trim()
        .split(/\n{2,}/);
    const htmlBlocks: string[] = [];

    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
        if (heading && !trimmed.includes('\n')) {
            const level = heading[1].length;
            const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
            htmlBlocks.push(`<${tag}>${formatInlineMarkdown(escapeHtml(heading[2]))}</${tag}>`);
            continue;
        }

        const lines = trimmed.split('\n').map((line) => formatInlineMarkdown(escapeHtml(line)));
        htmlBlocks.push(`<p>${lines.join('<br/>\n')}</p>`);
    }

    return htmlBlocks.join('\n');
}

/**
 * Build full HTML for the getting-started webview from a walkthrough.
 * Left nav lists steps; main pane shows one step at a time.
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
    const navItems = walkthrough.steps
        .map(
            (step, index) =>
                `<button type="button" class="nav-item${index === 0 ? ' active' : ''}" data-step="${String(index)}" aria-current="${index === 0 ? 'step' : 'false'}">
  <span class="nav-index">${String(index + 1)}</span>
  <span class="nav-title">${escapeHtml(step.title)}</span>
</button>`,
        )
        .join('\n');

    const panels = walkthrough.steps
        .map((step, index) => {
            const mediaPath = step.media?.markdown;
            const media = mediaPath ? mediaByPath[mediaPath] : undefined;
            const mediaBlock = media
                ? `<div class="media">${walkthroughMarkdownToHtml(media)}</div>`
                : '';
            return `<article class="step-panel${index === 0 ? ' active' : ''}" data-step="${String(index)}" ${index === 0 ? '' : 'hidden'}>
  <h2>${escapeHtml(step.title)}</h2>
  <div class="step-body">${walkthroughMarkdownToHtml(step.description)}</div>
  ${mediaBlock}
</article>`;
        })
        .join('\n');

    const stepCount = walkthrough.steps.length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"/>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    line-height: 1.5;
  }
  header {
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
  }
  header h1 { font-size: 1.25rem; margin: 0 0 0.35rem; font-weight: 600; }
  header .lead { margin: 0; opacity: 0.85; font-size: 0.92rem; }
  .layout { display: flex; flex: 1; min-height: 0; }
  nav {
    width: 15.5rem;
    flex-shrink: 0;
    border-right: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
    background: var(--vscode-sideBar-background, transparent);
  }
  .nav-item {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 0.55rem 0.65rem;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 0.15rem;
  }
  .nav-item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.15)); }
  .nav-item.active {
    background: var(--vscode-list-activeSelectionBackground, rgba(0,120,212,0.25));
    color: var(--vscode-list-activeSelectionForeground, inherit);
  }
  .nav-index {
    flex-shrink: 0;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.5));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    margin-top: 0.1rem;
  }
  .nav-item.active .nav-index {
    border-color: var(--vscode-focusBorder, #0078d4);
    background: var(--vscode-button-background, #0078d4);
    color: var(--vscode-button-foreground, #fff);
  }
  .nav-title { font-size: 0.88rem; }
  main {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.75rem 5rem;
  }
  .step-panel { display: none; max-width: 40rem; }
  .step-panel.active { display: block; }
  .step-panel h2 { font-size: 1.2rem; margin: 0 0 0.75rem; }
  .step-body { margin: 0 0 1rem; }
  .step-body p, .lead p { margin: 0 0 0.65rem; }
  .step-body p:last-child, .lead p:last-child { margin-bottom: 0; }
  .media {
    margin-top: 1rem;
    padding: 0.85rem 1rem;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
    border-radius: 4px;
  }
  .media h3, .media h4, .media h5 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; }
  .media p { margin: 0 0 0.65rem; }
  .media p:last-child { margin-bottom: 0; }
  .media code, .step-body code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 3px;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.18));
  }
  a { color: var(--vscode-textLink-foreground); }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    background: var(--vscode-editor-background);
  }
  footer .progress { opacity: 0.8; font-size: 0.85rem; }
  footer .actions { display: flex; gap: 0.5rem; }
  footer button {
    font: inherit;
    padding: 0.4rem 0.9rem;
    border-radius: 2px;
    border: 1px solid var(--vscode-button-border, transparent);
    cursor: pointer;
  }
  footer button.secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, inherit);
  }
  footer button.primary {
    background: var(--vscode-button-background, #0078d4);
    color: var(--vscode-button-foreground, #fff);
  }
  footer button:disabled { opacity: 0.45; cursor: default; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(walkthrough.title)}</h1>
    <div class="lead">${walkthroughMarkdownToHtml(walkthrough.description)}</div>
  </header>
  <div class="layout">
    <nav aria-label="Walkthrough steps">${navItems}</nav>
    <main id="step-main">${panels}</main>
  </div>
  <footer>
    <span class="progress" id="progress">Step 1 of ${String(stepCount)}</span>
    <div class="actions">
      <button type="button" class="secondary" id="prev" disabled>Back</button>
      <button type="button" class="primary" id="next"${stepCount <= 1 ? ' disabled' : ''}>Next</button>
    </div>
  </footer>
<script nonce="${nonce}">
(function () {
  var steps = ${String(stepCount)};
  var current = 0;
  var navItems = document.querySelectorAll('.nav-item');
  var panels = document.querySelectorAll('.step-panel');
  var prev = document.getElementById('prev');
  var next = document.getElementById('next');
  var progress = document.getElementById('progress');
  var main = document.getElementById('step-main');

  function show(index) {
    if (index < 0 || index >= steps) return;
    current = index;
    if (main) { main.scrollTop = 0; }
    for (var i = 0; i < steps; i++) {
      var active = i === current;
      navItems[i].classList.toggle('active', active);
      navItems[i].setAttribute('aria-current', active ? 'step' : 'false');
      panels[i].classList.toggle('active', active);
      if (active) { panels[i].removeAttribute('hidden'); }
      else { panels[i].setAttribute('hidden', ''); }
    }
    prev.disabled = current === 0;
    next.disabled = current >= steps - 1;
    next.textContent = current >= steps - 1 ? 'Done' : 'Next';
    progress.textContent = 'Step ' + (current + 1) + ' of ' + steps;
  }

  for (var n = 0; n < navItems.length; n++) {
    navItems[n].addEventListener('click', function (e) {
      var btn = e.currentTarget;
      show(Number(btn.getAttribute('data-step')));
    });
  }
  prev.addEventListener('click', function () { show(current - 1); });
  next.addEventListener('click', function () {
    if (current < steps - 1) show(current + 1);
  });
})();
</script>
</body>
</html>`;
}
