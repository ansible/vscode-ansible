import { escapeHtml } from './ansible-markup';

/**
 * Apply lightweight syntax highlighting to YAML text.
 * Returns HTML with span-wrapped tokens using yaml-* CSS classes.
 * @param yaml - YAML text to highlight
 * @returns HTML with span-wrapped YAML tokens
 */
export function highlightYaml(yaml: string): string {
    const lines = yaml.split('\n');
    return lines
        .map((line) => {
            if (line.trim().startsWith('#')) {
                return `<span class="yaml-comment">${escapeHtml(line)}</span>`;
            }

            if (line.trim() === '') {
                return '';
            }

            const commentMatch = /^(.+?)( {2}# .*)$/.exec(line);
            let codePart = line;
            let commentPart = '';

            if (commentMatch) {
                codePart = commentMatch[1];
                commentPart = commentMatch[2];
            }

            let result = escapeHtml(codePart);

            result = result.replace(
                /^(\s*)(-\s)([a-zA-Z_][a-zA-Z0-9_]*)(:)/,
                '$1<span class="yaml-list-marker">$2</span><span class="yaml-key">$3</span>$4',
            );

            result = result.replace(
                /^(\s*)(-\s)(&quot;[^&]*&quot;|&#039;[^&]*&#039;)(\s*)$/,
                '$1<span class="yaml-list-marker">$2</span><span class="yaml-string">$3</span>$4',
            );

            result = result.replace(
                /^(\s*)(-\s)([^\s].*)$/,
                (match: string, spaces: string, marker: string, value: string) => {
                    if (value.includes('<span')) {
                        return match;
                    }
                    const trimmedValue = value.trim();
                    let valueClass = 'yaml-string';
                    if (/^(true|false|yes|no|on|off)$/i.test(trimmedValue)) {
                        valueClass = 'yaml-bool';
                    } else if (/^(null|~)$/i.test(trimmedValue)) {
                        valueClass = 'yaml-null';
                    } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                        valueClass = 'yaml-number';
                    }
                    return `${spaces}<span class="yaml-list-marker">${marker}</span><span class="${valueClass}">${value}</span>`;
                },
            );

            result = result.replace(/^(\s*)(-\s)$/, '$1<span class="yaml-list-marker">$2</span>');

            result = result.replace(
                /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(:)(\s|$)/,
                '$1<span class="yaml-key">$2</span>$3$4',
            );

            result = result.replace(
                /:(\s+)(".*?"|'.*?')(\s*)$/,
                ':$1<span class="yaml-string">$2</span>$3',
            );

            result = result.replace(/:(\s+)(\S.*)$/, (_match, space: string, value: string) => {
                const trimmedValue = value.trim();
                if (/^(true|false|yes|no|on|off)$/i.test(trimmedValue)) {
                    return `:${space}<span class="yaml-bool">${value}</span>`;
                }
                if (/^(null|~)$/i.test(trimmedValue)) {
                    return `:${space}<span class="yaml-null">${value}</span>`;
                }
                if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                    return `:${space}<span class="yaml-number">${value}</span>`;
                }
                return `:${space}<span class="yaml-string">${value}</span>`;
            });

            if (commentPart) {
                result += highlightComment(commentPart);
            }

            return result;
        })
        .join('\n');
}

/**
 * Highlight inline YAML comments, including structured parameter comments.
 * Structured format: # (type, required/optional) description
 * @param comment - Comment text including leading spaces and `#`
 * @returns HTML with styled comment spans
 */
export function highlightComment(comment: string): string {
    const structuredMatch = /^( {2}# \()([^,]+)(, )(required|optional)(\) )(.*)$/.exec(comment);
    if (structuredMatch) {
        const [, prefix, type, comma, reqOpt, closeParen, desc] = structuredMatch;
        const reqClass = reqOpt === 'required' ? 'yaml-comment-required' : 'yaml-comment-optional';
        return (
            `<span class="yaml-comment-dim">${escapeHtml(prefix)}</span>` +
            `<span class="yaml-comment-type">${escapeHtml(type)}</span>` +
            `<span class="yaml-comment-dim">${escapeHtml(comma)}</span>` +
            `<span class="${reqClass}">${escapeHtml(reqOpt)}</span>` +
            `<span class="yaml-comment-dim">${escapeHtml(closeParen)}${escapeHtml(desc)}</span>`
        );
    }

    return `<span class="yaml-comment-dim">${escapeHtml(comment)}</span>`;
}
