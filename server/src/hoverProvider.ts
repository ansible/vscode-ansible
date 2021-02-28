import { Hover } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Scalar } from 'yaml/types';
import { getNodeAt } from './utils';

export class AnsibleHoverProvider {
  doHover(document: TextDocument, position: Position): Hover | null {
    const yamlDocs = parseAllDocuments(document.getText());
    const node = getNodeAt(document, position, yamlDocs);
    if (node && node instanceof Scalar) {
      return {
        contents: node.value,
      };
    }
    return null;
  }
}
