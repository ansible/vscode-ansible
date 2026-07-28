import { DefinitionLink } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { type Node, isScalar } from 'yaml';
import { isTaskKeyword } from '../utils/ansible';
import { toLspRange } from '../utils/misc';
import {
    AncestryBuilder,
    getDeclaredCollections,
    getOrigRange,
    getPathAt,
    isTaskParam,
    parseAllDocuments,
} from '../utils/yaml';
import { CollectionsService } from '@ansible/developer-services';

/** Payload for the `ansible/openPluginDoc` LS → client notification. */
export interface OpenPluginDocParams {
    /** Fully qualified collection name of the plugin. */
    fqcn: string;
    /** Plugin type (always `module` for task keys). */
    pluginType: string;
}

/**
 * Resolves go-to-definition for a task module key by notifying the client
 * to open PluginDocPanel, returning a self DefinitionLink so the editor
 * does not show "No definition found".
 *
 * @param document - Text document under the cursor.
 * @param position - Cursor position in the document.
 * @param collectionsService - Source of cached plugin documentation.
 * @param sendOpenPluginDoc - Callback that notifies the extension host.
 * @returns A self DefinitionLink when docs exist, otherwise null.
 */
export async function doDefinition(
    document: TextDocument,
    position: Position,
    collectionsService: CollectionsService,
    sendOpenPluginDoc: (params: OpenPluginDocParams) => void,
): Promise<DefinitionLink[] | null> {
    const yamlDocs = parseAllDocuments(document.getText());
    const path = getPathAt(document, position, yamlDocs);
    if (!path) return null;

    const node = path[path.length - 1];
    if (
        !isScalar(node) ||
        typeof node.value !== 'string' ||
        !new AncestryBuilder(path).parentOfKey().get()
    ) {
        return null;
    }

    if (!isTaskParam(path)) {
        return null;
    }

    if (isTaskKeyword(node.value)) {
        return null;
    }

    const moduleName = node.value;
    const fqcn = await resolveFqcn(moduleName, path, collectionsService);
    const pluginData = await collectionsService.getPluginDocumentation(fqcn, 'module');
    if (!pluginData?.doc) {
        return null;
    }

    sendOpenPluginDoc({ fqcn, pluginType: 'module' });

    const origRange = getOrigRange(node);
    const range = origRange ? toLspRange(origRange, document) : undefined;
    if (!range) {
        return null;
    }

    return [
        {
            targetUri: document.uri,
            originSelectionRange: range,
            targetRange: range,
            targetSelectionRange: range,
        },
    ];
}

/**
 * Resolves a module name to its FQCN using play/role collection context.
 *
 * Already-qualified names (>=2 dots) pass through unchanged. Short names
 * are resolved by checking each collection declared via the `collections`
 * keyword in scope, then falling back to `ansible.builtin`.
 *
 * @param name - Module name from the playbook YAML.
 * @param path - YAML node ancestry at the module key.
 * @param collectionsService - Source of cached plugin documentation.
 * @returns FQCN with confirmed documentation, or the builtin fallback.
 */
async function resolveFqcn(
    name: string,
    path: Node[],
    collectionsService: CollectionsService,
): Promise<string> {
    const dotCount = (name.match(/\./g) ?? []).length;
    if (dotCount >= 2) {
        return name;
    }

    const declaredCollections = getDeclaredCollections(path);
    for (const collection of declaredCollections) {
        const candidate = `${collection}.${name}`;
        const pluginData = await collectionsService.getPluginDocumentation(candidate, 'module');
        if (pluginData?.doc) {
            return candidate;
        }
    }

    return `ansible.builtin.${name}`;
}
