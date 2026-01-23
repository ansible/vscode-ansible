import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { parseDocument, Document } from "yaml";
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
    const yamlDoc = parseDocument(text, { keepSourceTokens: true });

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

    // AJV populates errors array when validation fails
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

  private getRange(
    _err: ErrorObject,
    doc: TextDocument,
    yamlDoc: Document,
  ): Range {
    // Use document root range - simple and always works
    // keepSourceTokens guarantees range exists
    const root = yamlDoc.contents as { range: [number, number, number] };
    return {
      start: doc.positionAt(root.range[0]),
      end: doc.positionAt(root.range[2]),
    };
  }
}
