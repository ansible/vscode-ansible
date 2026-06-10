import { Hover, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { isScalar, Scalar } from 'yaml';
import {
    blockKeywords,
    isTaskKeyword,
    playKeywords,
    roleKeywords,
    taskKeywords,
} from '../utils/ansible';
import { formatModule, formatOption } from '../utils/docsFormatter';
import { toLspRange } from '../utils/misc';
import {
    AncestryBuilder,
    getOrigRange,
    getPathAt,
    getPossibleOptionsForPath,
    isBlockParam,
    isPlayParam,
    isRoleParam,
    isTaskParam,
    parseAllDocuments,
} from '../utils/yaml';
import { CollectionsService } from '@ansible/core/out/services/CollectionsService';

/**
 * Resolves hover documentation for Ansible keywords, modules, and options.
 *
 * @param document - Text document under the cursor.
 * @param position - Cursor position in the document.
 * @param collectionsService - Source of cached plugin documentation.
 * @returns Hover content for the symbol at the position, or null when unknown.
 */
export async function doHover(
    document: TextDocument,
    position: Position,
    collectionsService: CollectionsService,
): Promise<Hover | null> {
    const yamlDocs = parseAllDocuments(document.getText());
    const path = getPathAt(document, position, yamlDocs);
    if (!path) return null;

    const node = path[path.length - 1];
    if (!isScalar(node) || !new AncestryBuilder(path).parentOfKey().get()) {
        return null;
    }

    if (isPlayParam(path)) {
        return getKeywordHover(document, node, playKeywords);
    }
    if (isBlockParam(path)) {
        return getKeywordHover(document, node, blockKeywords);
    }
    if (isRoleParam(path)) {
        return getKeywordHover(document, node, roleKeywords);
    }

    if (isTaskParam(path)) {
        if (isTaskKeyword(node.value as string)) {
            return getKeywordHover(document, node, taskKeywords);
        }

        const moduleName = node.value as string;
        const fqcn = resolveFqcn(moduleName);
        const pluginData = await collectionsService.getPluginDocumentation(fqcn, 'module');
        if (pluginData?.doc) {
            const range = getOrigRange(node);
            return {
                contents: formatModule(pluginData.doc),
                range: range ? toLspRange(range, document) : undefined,
            };
        }
    }

    const options = await getPossibleOptionsForPath(path, document, collectionsService);

    if (options) {
        const optionName = node.value as string;
        const option = options[optionName];
        return {
            contents: formatOption(option, optionName, true),
        };
    }

    return null;
}

/**
 * Normalizes a short module name to its fully qualified collection name.
 *
 * @param name - Module name from the playbook YAML.
 * @returns FQCN suitable for documentation lookup.
 */
function resolveFqcn(name: string): string {
    const dotCount = (name.match(/\./g) ?? []).length;
    if (dotCount >= 2) {
        return name;
    }
    return `ansible.builtin.${name}`;
}

/**
 * Builds hover content for a reserved Ansible keyword scalar node.
 *
 * @param document - Text document containing the keyword.
 * @param node - YAML scalar node at the hover position.
 * @param keywords - Map of keyword names to documentation.
 * @returns Hover for the keyword, or null when undocumented.
 */
function getKeywordHover(
    document: TextDocument,
    node: Scalar,
    keywords: Map<string, string | MarkupContent>,
): Hover | null {
    const keywordDocumentation = keywords.get(node.value as string);
    const markupDoc: MarkupContent | undefined =
        typeof keywordDocumentation === 'string'
            ? { kind: MarkupKind.Markdown, value: keywordDocumentation }
            : keywordDocumentation;

    if (markupDoc) {
        const range = getOrigRange(node);
        return {
            contents: markupDoc,
            range: range ? toLspRange(range, document) : undefined,
        };
    }
    return null;
}
