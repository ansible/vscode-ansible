import { Connection } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { SchemaCache, JSONSchema } from "./schemaCache";

// Schema mappings for Ansible metadata files
// All schemas are from the official ansible-lint repository
const SCHEMA_MAPPINGS = [
  {
    pattern: /[/\\]meta[/\\]main\.ya?ml$/i,
    url: "https://raw.githubusercontent.com/ansible/ansible-lint/main/src/ansiblelint/schemas/meta.json",
  },
  {
    pattern: /[/\\]meta[/\\]runtime\.ya?ml$/i,
    url: "https://raw.githubusercontent.com/ansible/ansible-lint/main/src/ansiblelint/schemas/meta-runtime.json",
  },
  // Add more official schemas here as needed:
  // galaxy.yml, requirements.yml, execution-environment.yml, etc.
];

/**
 * Manages JSON schema operations for Ansible metadata files.
 */
export class SchemaService {
  private cache: SchemaCache;

  constructor(connection: Connection) {
    this.cache = new SchemaCache(connection);
  }

  getSchemaUrlForUri(uri: string): string | undefined {
    const filePath = URI.parse(uri).fsPath || uri;

    for (const { pattern, url } of SCHEMA_MAPPINGS) {
      if (pattern.test(filePath)) {
        return url;
      }
    }
    return undefined;
  }

  shouldValidateWithSchema(doc: TextDocument): boolean {
    return this.getSchemaUrlForUri(doc.uri) !== undefined;
  }

  async getSchemaForDocument(
    doc: TextDocument,
  ): Promise<JSONSchema | undefined> {
    const url = this.getSchemaUrlForUri(doc.uri);
    if (!url) return undefined;
    return this.cache.getSchema(url);
  }
}
