import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseDocument, isMap, isSeq, Scalar } from "yaml";
import { JSONSchema } from "./schemaCache";

/**
 * Provides completion suggestions from JSON schema.
 */
export class SchemaCompleter {
  complete(
    doc: TextDocument,
    pos: Position,
    schema: JSONSchema,
  ): CompletionItem[] {
    const text = doc.getText();
    const offset = doc.offsetAt(pos);

    let yamlDoc;
    try {
      yamlDoc = parseDocument(text, { keepSourceTokens: true });
    } catch {
      return [];
    }

    const path = this.findPath(yamlDoc.contents, offset, []);
    const schemaAtPath = this.getSchemaAtPath(schema, path);
    if (!schemaAtPath?.properties) {
      return [];
    }

    const existingKeys = this.getExistingKeys(yamlDoc.contents, path);
    const required = new Set(schemaAtPath.required || []);

    return Object.entries(schemaAtPath.properties)
      .filter(([name]) => !existingKeys.has(name))
      .map(([name, prop]) => {
        const propSchema = prop;
        const isReq = required.has(name);
        return {
          label: name,
          kind: CompletionItemKind.Property,
          detail: isReq ? "(required)" : propSchema.type?.toString(),
          documentation: propSchema.description,
          insertText: this.insertText(name, propSchema),
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: isReq ? `0_${name}` : `1_${name}`,
        };
      });
  }

  private findPath(node: unknown, offset: number, path: string[]): string[] {
    if (!node) return path;

    if (isMap(node)) {
      for (const pair of node.items) {
        const p = pair;
        const range = (p as unknown as { range?: [number, number, number] })
          .range;
        if (range && offset >= range[0] && offset <= range[2]) {
          const key = this.scalarValue(p.key);
          if (key) {
            const valRange = (p.value as { range?: [number, number, number] })
              ?.range;
            if (valRange && offset >= valRange[0]) {
              return this.findPath(p.value, offset, [...path, key]);
            }
          }
          return path;
        }
      }
      return path;
    }

    if (isSeq(node)) {
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        const range = (item as { range?: [number, number, number] })?.range;
        if (range && offset >= range[0] && offset <= range[2]) {
          return this.findPath(item, offset, [...path, String(i)]);
        }
      }
    }

    return path;
  }

  private getSchemaAtPath(
    schema: JSONSchema,
    path: string[],
  ): JSONSchema | undefined {
    let current: JSONSchema | undefined = schema;

    for (const key of path) {
      if (!current) return undefined;

      if (/^\d+$/.test(key) && current.items) {
        current = Array.isArray(current.items)
          ? current.items[0]
          : current.items;
      } else if (current.properties?.[key]) {
        current = current.properties[key];
      } else if (typeof current.additionalProperties === "object") {
        current = current.additionalProperties;
      } else {
        return undefined;
      }
    }

    return current;
  }

  private getExistingKeys(node: unknown, path: string[]): Set<string> {
    let current = node;
    for (const key of path) {
      if (!current) return new Set();
      if (isMap(current)) {
        const pair = current.items.find((p) => this.scalarValue(p.key) === key);
        current = pair ? pair.value : undefined;
      } else if (isSeq(current)) {
        const idx = parseInt(key, 10);
        current = !isNaN(idx) ? current.items[idx] : undefined;
      } else {
        return new Set();
      }
    }

    const keys = new Set<string>();
    if (isMap(current)) {
      for (const pair of current.items) {
        const k = this.scalarValue(pair.key);
        if (k) keys.add(k);
      }
    }
    return keys;
  }

  private insertText(name: string, schema: JSONSchema): string {
    if (schema.type === "boolean") return `${name}: \${1|true,false|}`;
    if (schema.type === "array") return `${name}:\n  - $1`;
    if (schema.type === "object") return `${name}:\n  $1`;
    if (schema.enum?.length) {
      return `${name}: \${1|${schema.enum.join(",")}|}`;
    }
    if (schema.default !== undefined) {
      return `${name}: \${1:${schema.default}}`;
    }
    return `${name}: $1`;
  }

  private scalarValue(node: unknown): string | undefined {
    if (node instanceof Scalar) return String(node.value);
    if (typeof node === "string") return node;
    return undefined;
  }
}
