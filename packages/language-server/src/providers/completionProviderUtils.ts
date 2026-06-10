import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { isScalar, Node, YAMLMap, YAMLSeq, parseDocument } from 'yaml';
import { AncestryBuilder, isPlayParam } from '../utils/yaml';
import * as pathUri from 'path';
import { existsSync, readFileSync } from 'fs';

interface VarEntry {
    variable: string;
    priority: number;
}

interface VarsPromptEntry {
    name: string;
    prompt: string;
    private?: boolean;
}

interface PlayNodeJson {
    vars?: unknown;
    vars_prompt?: VarsPromptEntry[];
    vars_files?: string[];
}

/**
 * Type guard for play-level JSON nodes that may contain vars definitions.
 *
 * @param value - Parsed YAML JSON value.
 * @returns True when the value is a non-null object.
 */
function isPlayNodeJson(value: unknown): value is PlayNodeJson {
    return typeof value === 'object' && value !== null;
}

/**
 * Narrows a parsed YAML value to a play node when possible.
 *
 * @param value - Parsed YAML JSON value.
 * @returns Play node object, or undefined when the value is not an object.
 */
function asPlayNodeJson(value: unknown): PlayNodeJson | undefined {
    return isPlayNodeJson(value) ? value : undefined;
}

/**
 * Collects Jinja variable completion items from play scope, prompts, and vars files.
 *
 * @param documentUri - URI of the document being completed.
 * @param path - YAML node path at the cursor inside Jinja brackets.
 * @returns Variable completion items sorted by scope priority.
 */
export function getVarsCompletion(documentUri: string, path: Node[]): CompletionItem[] {
    const varsCompletion: VarEntry[] = [];
    let varPriority = 0;

    while (!isPlayParam(path)) {
        varPriority++;

        let parentKeyPath = new AncestryBuilder(path).parent(YAMLMap).parent(YAMLMap).getKeyPath();
        if (parentKeyPath) {
            const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
            if (isScalar(parentKeyNode) && typeof parentKeyNode.value === 'string') {
                path = parentKeyPath;
                const scopedNode = asPlayNodeJson(path[path.length - 3].toJSON());
                if (scopedNode && Object.prototype.hasOwnProperty.call(scopedNode, 'vars')) {
                    collectVars(scopedNode.vars, varsCompletion, varPriority);
                }
                continue;
            }
        }

        parentKeyPath = new AncestryBuilder(path)
            .parent(YAMLMap)
            .parent(YAMLSeq)
            .parent(YAMLMap)
            .getKeyPath();
        if (parentKeyPath) {
            const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
            if (isScalar(parentKeyNode) && typeof parentKeyNode.value === 'string') {
                path = parentKeyPath;
                const scopedNode = asPlayNodeJson(path[path.length - 3].toJSON());
                if (scopedNode && Object.prototype.hasOwnProperty.call(scopedNode, 'vars')) {
                    collectVars(scopedNode.vars, varsCompletion, varPriority);
                }
                continue;
            }
        }

        break;
    }

    varPriority++;
    const playNode = asPlayNodeJson(path[path.length - 3]?.toJSON());
    if (playNode && Object.prototype.hasOwnProperty.call(playNode, 'vars_prompt')) {
        const varsPrompt = playNode.vars_prompt ?? [];
        for (const entry of varsPrompt) {
            varsCompletion.push({ variable: entry.name, priority: varPriority });
        }
    }

    varPriority++;
    if (playNode && Object.prototype.hasOwnProperty.call(playNode, 'vars_files')) {
        const varsFiles = playNode.vars_files ?? [];
        const currentDirectory = pathUri.dirname(URI.parse(documentUri).path);

        for (const element of varsFiles) {
            const varFilePath = pathUri.isAbsolute(element)
                ? element
                : URI.parse(pathUri.resolve(currentDirectory, element)).path;

            if (existsSync(varFilePath)) {
                const file = readFileSync(varFilePath, { encoding: 'utf8' });
                const contents = parseDocument(file).contents;
                if (contents) {
                    const yamlDocContent: unknown = contents.toJSON();
                    if (Array.isArray(yamlDocContent)) {
                        for (const item of yamlDocContent) {
                            if (typeof item === 'object' && item !== null) {
                                for (const key of Object.keys(item as Record<string, unknown>)) {
                                    varsCompletion.push({ variable: key, priority: varPriority });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return varsCompletion.map(({ variable, priority }) => ({
        label: variable,
        sortText: `${String(priority)}_${variable}`,
        kind: CompletionItemKind.Variable,
    }));
}

/**
 * Recursively extracts variable names from a vars object or list into the result.
 *
 * @param varsObject - vars mapping or list from a play node.
 * @param result - Accumulator for discovered variable entries.
 * @param priority - Sort priority assigned to variables from this scope.
 */
function collectVars(varsObject: unknown, result: VarEntry[], priority: number): void {
    if (Array.isArray(varsObject)) {
        for (const element of varsObject) {
            if (typeof element === 'object' && element !== null) {
                for (const key of Object.keys(element as Record<string, unknown>)) {
                    result.push({ variable: key, priority });
                }
            }
        }
    } else if (typeof varsObject === 'object' && varsObject !== null) {
        for (const key of Object.keys(varsObject)) {
            result.push({ variable: key, priority });
        }
    }
}
