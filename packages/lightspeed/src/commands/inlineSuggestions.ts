import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import type { TelemetryReporter } from '../telemetry';
import {
    SINGLE_TASK_REGEX_EP,
    MULTI_TASK_REGEX_EP,
    LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT,
} from '../definitions';
import type { IAnsibleFileType } from '../interfaces';
import crypto from 'crypto';

/**
 * Adjusts indentation of an inline suggestion to align with the current cursor position.
 * @param suggestion - The raw suggestion text to adjust
 * @param position - The cursor position used to determine indentation
 * @returns The suggestion text with corrected indentation
 */
function adjustInlineSuggestionIndent(suggestion: string, position: vscode.Position): string {
    const lines = suggestion.split('\n');
    const editor = vscode.window.activeTextEditor;
    const cursorLine = editor?.document.lineAt(position);
    const spacesBeforeCursor =
        cursorLine?.text.slice(0, position.character).match(/^ +/)?.[0].length ?? 0;

    if (spacesBeforeCursor > 0 && lines.length > 0) {
        return lines
            .map((line, index) => {
                if (/\w/.exec(line[position.character - 1])) {
                    return '';
                }
                const newLine = line.substring(position.character);
                if (index === 0) {
                    return newLine;
                } else {
                    return ' '.repeat(spacesBeforeCursor) + newLine;
                }
            })
            .filter((s) => s)
            .join('\n');
    }
    return suggestion;
}

interface SuggestionMatchInfo {
    lineToExtractPrompt: vscode.TextLine;
    taskMatchedPattern: RegExpMatchArray | null;
    spacesBeforeCursor: number;
    spacesBeforePromptStart: number;
    suggestionMatchType: 'SINGLE-TASK' | 'MULTI-TASK' | undefined;
    currentLineIsEmpty: boolean;
}

/**
 * Determines whether the current cursor position matches a single-task or multi-task suggestion pattern.
 * @param document - The active text document to analyze
 * @param position - The cursor position used to find the prompt line
 * @returns Match information including the pattern type, indentation details, and prompt line
 */
function getSuggestionMatchType(
    document: vscode.TextDocument,
    position: vscode.Position,
): SuggestionMatchInfo {
    let suggestionMatchType: 'SINGLE-TASK' | 'MULTI-TASK' | undefined = undefined;

    const lineToExtractPrompt = document.lineAt(position.line - 1);
    const spacesBeforePromptStart = /^ +/.exec(lineToExtractPrompt.text)?.[0].length ?? 0;

    const taskMatchedPattern = lineToExtractPrompt.text.match(SINGLE_TASK_REGEX_EP);
    const currentLineText = document.lineAt(position);
    const spacesBeforeCursor =
        /^ +/.exec(currentLineText.text.slice(0, position.character))?.[0].length ?? 0;

    if (taskMatchedPattern) {
        suggestionMatchType = 'SINGLE-TASK';
    } else {
        const commentMatchedPattern = lineToExtractPrompt.text.match(MULTI_TASK_REGEX_EP);
        if (commentMatchedPattern) {
            suggestionMatchType = 'MULTI-TASK';
        }
    }

    return {
        lineToExtractPrompt,
        taskMatchedPattern,
        spacesBeforeCursor,
        spacesBeforePromptStart,
        suggestionMatchType,
        currentLineIsEmpty: currentLineText.isEmptyOrWhitespace,
    };
}

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

/**
 * Registers an inline completion provider that supplies Lightspeed AI suggestions for Ansible files.
 * @param context - The VS Code extension context for managing subscriptions
 * @param api - The Lightspeed API client used to fetch completion suggestions
 * @param telemetry - The telemetry reporter for tracking suggestion events
 * @param log - Optional logging function for diagnostic output
 * @returns void
 */
export function registerInlineSuggestions(
    context: vscode.ExtensionContext,
    api: LightspeedAPI,
    telemetry: TelemetryReporter,
    log?: LogFn,
) {
    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
            _context: vscode.InlineCompletionContext,
            token: vscode.CancellationToken,
        ): Promise<vscode.InlineCompletionItem[] | undefined> {
            if (document.languageId !== 'ansible' && document.languageId !== 'yaml') {
                return undefined;
            }

            const config = vscode.workspace.getConfiguration('ansible.lightspeed');
            if (!config.get<boolean>('suggestions.enabled', true)) return undefined;

            if (position.line === 0) return undefined;
            if (token.isCancellationRequested) return undefined;

            const matchInfo = getSuggestionMatchType(document, position);

            if (!matchInfo.suggestionMatchType) {
                log?.(
                    'debug',
                    `[inline] No task/comment pattern on line ${String(position.line - 1)}, skipping`,
                );
                return undefined;
            }
            if (!matchInfo.currentLineIsEmpty) {
                log?.('debug', `[inline] Current line not empty, skipping`);
                return undefined;
            }
            if (matchInfo.spacesBeforePromptStart !== matchInfo.spacesBeforeCursor) {
                log?.(
                    'debug',
                    `[inline] Indentation mismatch: prompt=${String(matchInfo.spacesBeforePromptStart)}, cursor=${String(matchInfo.spacesBeforeCursor)}`,
                );
                return undefined;
            }

            log?.(
                'info',
                `[inline] Triggered ${matchInfo.suggestionMatchType} suggestion at line ${String(position.line)}`,
            );
            log?.(
                'info',
                `[inline] Prompt line (line ${String(position.line - 1)}): "${matchInfo.lineToExtractPrompt.text}"`,
            );
            if (matchInfo.taskMatchedPattern) {
                log?.(
                    'info',
                    `[inline] Matched task description: "${matchInfo.taskMatchedPattern.groups?.description ?? ''}"`,
                );
            }
            const range = new vscode.Range(new vscode.Position(0, 0), position);
            const documentContent = range.isEmpty ? '' : document.getText(range).trimEnd();

            log?.(
                'info',
                `[inline] Prompt length: ${String(documentContent.length)} chars, last 200 chars: "${documentContent.slice(-200).replace(/\n/g, '\\n')}"`,
            );

            const suggestionId = crypto.randomUUID();
            const activityId = crypto.randomUUID();
            const ansibleFileType: IAnsibleFileType = 'playbook';

            const result = await api.completionRequest({
                prompt: documentContent,
                suggestionId,
                metadata: {
                    documentUri: document.uri.toString(),
                    ansibleFileType,
                    activityId,
                },
            });

            if ('code' in result) {
                log?.('error', `[inline] API error: ${result.code} - ${result.message ?? ''}`);
                return undefined;
            }
            log?.(
                'info',
                `[inline] Received ${String(result.predictions.length)} prediction(s) for suggestionId=${result.suggestionId}`,
            );

            const items: vscode.InlineCompletionItem[] = [];

            for (const prediction of result.predictions) {
                const leadingWhitespaceCount = prediction.search(/\S/);
                let leadingWhitespace = '';
                if (leadingWhitespaceCount > 0) {
                    leadingWhitespace = ' '.repeat(leadingWhitespaceCount);
                }
                let insertText = `${leadingWhitespace}${LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT}${prediction.trimEnd()}`;
                insertText = adjustInlineSuggestionIndent(insertText, position);
                insertText = insertText.replace(/^[ \t]+(?=\r?\n)/gm, '');

                log?.(
                    'debug',
                    `[inline] pos.char=${String(position.character)}, leadingWS=${String(leadingWhitespaceCount)}, preview: "${insertText.substring(0, 80).replace(/\n/g, '\\n')}"`,
                );
                items.push(new vscode.InlineCompletionItem(insertText));
            }

            return items;
        },
    };

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            [{ language: 'ansible' }, { language: 'yaml' }],
            provider,
        ),
    );
}
