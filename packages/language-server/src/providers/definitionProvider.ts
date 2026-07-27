import { DefinitionLink } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { isScalar } from 'yaml';
import { isTaskKeyword } from '../utils/ansible';
import { toLspRange } from '../utils/misc';
import {
    AncestryBuilder,
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
    if (!isScalar(node) || !new AncestryBuilder(path).parentOfKey().get()) {
        return null;
    }

    if (!isTaskParam(path)) {
        return null;
    }

    if (isTaskKeyword(node.value as string)) {
        return null;
    }

    const moduleName = node.value as string;
    const fqcn = resolveFqcn(moduleName);
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
