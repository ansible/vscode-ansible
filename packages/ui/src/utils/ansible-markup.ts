/**
 * Escape raw text for safe embedding in generated HTML.
 * @param text - Raw text that may contain HTML metacharacters
 * @returns HTML-safe text
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Normalize documentation fields that may be a string or string array.
 * @param value - Single value or list from plugin documentation metadata
 * @returns Array form of the value, or an empty array when absent
 */
export function toArray(value: string | string[] | undefined): string[] {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

/**
 * Convert ansible-doc text markup into HTML.
 * Handles I(), C(), B(), U(), :ref:, and backtick code.
 * @param text - Raw documentation text with ansible-doc formatting
 * @returns HTML-safe formatted description text
 */
export function formatAnsibleMarkup(text: string): string {
    let html = escapeHtml(text);
    html = html.replace(/I\(([^)]+)\)/g, '<em>$1</em>');
    html = html.replace(/C\(([^)]+)\)/g, '<code>$1</code>');
    html = html.replace(/B\(([^)]+)\)/g, '<strong>$1</strong>');
    html = html.replace(/U\(([^)]+)\)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    html = html.replace(/:ref:`([^&]+)\s*&lt;[^&]+&gt;`/g, '$1');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
}
