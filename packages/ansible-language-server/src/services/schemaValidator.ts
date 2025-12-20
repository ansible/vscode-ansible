import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { parseDocument, Document, isMap, isSeq } from "yaml";
import { JSONSchema } from "./schemaCache";

/**
 * Validates YAML documents against JSON schemas.
 */
export class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  validate(doc: TextDocument, schema: JSONSchema): Diagnostic[] {
    const text = doc.getText();

    let yamlDoc: Document;
    try {
      yamlDoc = parseDocument(text, { keepSourceTokens: true });
    } catch {
      return [];
    }

    if (yamlDoc.errors?.length) {
      return []; // YAML errors handled elsewhere
    }

    const data = yamlDoc.toJSON();
    if (data == null) {
      return [];
    }

    let validate;
    try {
      validate = this.ajv.compile(schema);
    } catch {
      return [];
    }

    if (validate(data)) {
      return [];
    }

    return (validate.errors || [])
      .map((err) => this.toDiagnostic(err, doc, yamlDoc))
      .filter((d): d is Diagnostic => d !== undefined);
  }

  private toDiagnostic(
    err: ErrorObject,
    doc: TextDocument,
    yamlDoc: Document,
  ): Diagnostic | undefined {
    return {
      range: this.getRange(err, doc, yamlDoc),
      severity: this.getSeverity(err),
      source: "ansible-schema",
      message: this.getMessage(err),
      code: err.keyword,
    };
  }

  private getSeverity(err: ErrorObject): DiagnosticSeverity {
    if (err.keyword === "additionalProperties") {
      return DiagnosticSeverity.Warning;
    }
    return DiagnosticSeverity.Error;
  }

  private getMessage(err: ErrorObject): string {
    switch (err.keyword) {
      case "required":
        return `Missing required property: "${(err.params as { missingProperty: string }).missingProperty}"`;
      case "additionalProperties":
        return `Unknown property: "${(err.params as { additionalProperty: string }).additionalProperty}"`;
      case "type":
        return `Expected ${(err.params as { type: string }).type}`;
      case "enum":
        return `Must be one of: ${JSON.stringify((err.params as { allowedValues: unknown[] }).allowedValues)}`;
      default:
        return err.message || "Schema validation error";
    }
  }

  private getRange(err: ErrorObject, doc: TextDocument, yamlDoc: Document): Range {
    const pathParts = err.instancePath.split("/").filter(Boolean);

    // For additionalProperties, append the extra property name
    if (err.keyword === "additionalProperties") {
      pathParts.push((err.params as { additionalProperty: string }).additionalProperty);
    }

    const node = this.findNode(yamlDoc.contents, pathParts);
    if (node?.range) {
      return {
        start: doc.positionAt(node.range[0]),
        end: doc.positionAt(node.range[2]),
      };
    }

    return { start: { line: 0, character: 0 }, end: { line: 0, character: 80 } };
  }

  private findNode(
    node: unknown,
    path: string[],
  ): { range?: [number, number, number] } | undefined {
    let current = node;

    for (const key of path) {
      if (!current) return undefined;

      if (isMap(current)) {
        const pair = current.items.find((p) => {
          const k = p.key;
          if (k && typeof k === "object" && "value" in k) return k.value === key;
          return k === key;
        });
        current = pair?.value;
      } else if (isSeq(current)) {
        const idx = parseInt(key, 10);
        current = !isNaN(idx) ? current.items[idx] : undefined;
      } else {
        return undefined;
      }
    }

    return current as { range?: [number, number, number] } | undefined;
  }
}
