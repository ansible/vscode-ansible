import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseDocument, isMap, Scalar } from "yaml";
import { JSONSchema } from "./schemaCache";

/**
 * Provides completion suggestions from JSON schema.
 * Currently supports root-level property completions.
 */
export class SchemaCompleter {
  complete(
    doc: TextDocument,
    _pos: Position,
    schema: JSONSchema,
  ): CompletionItem[] {
    const text = doc.getText();
    const yamlDoc = parseDocument(text, { keepSourceTokens: true });

    if (!schema.properties) {
      return [];
    }

    const existingKeys = this.getExistingKeys(yamlDoc.contents);
    const required = new Set(schema.required || []);

    return Object.entries(schema.properties)
      .filter(([name]) => !existingKeys.has(name))
      .map(([name, prop]) => {
        const isReq = required.has(name);
        return {
          label: name,
          kind: CompletionItemKind.Property,
          detail: isReq ? "(required)" : prop.type?.toString(),
          documentation: prop.description,
          insertText: this.insertText(name, prop),
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: isReq ? `0_${name}` : `1_${name}`,
        };
      });
  }

  private getExistingKeys(node: unknown): Set<string> {
    const keys = new Set<string>();
    if (isMap(node)) {
      for (const pair of node.items) {
        // YAML keys are always Scalar instances
        if (pair.key instanceof Scalar) {
          keys.add(String(pair.key.value));
        }
      }
    }
    return keys;
  }

  private insertText(name: string, schema: JSONSchema): string {
    if (schema.type === "boolean") return `${name}: \${1|true,false|}`;
    if (schema.type === "array") return `${name}:\n  - $1`;
    if (schema.type === "object") return `${name}:\n  $1`;
    if (schema.enum?.length) {
      const choices = schema.enum.map((v) => this.escapeSnippet(v));
      return `${name}: \${1|${choices.join(",")}|}`;
    }
    if (schema.default !== undefined) {
      return `${name}: \${1:${this.escapeSnippet(schema.default)}}`;
    }
    return `${name}: $1`;
  }

  private escapeSnippet(value: unknown): string {
    const str = String(value);
    return str
      .replace(/\\/g, "\\\\")
      .replace(/\$/g, "\\$")
      .replace(/}/g, "\\}")
      .replace(/\|/g, "\\|")
      .replace(/,/g, "\\,");
  }
}
