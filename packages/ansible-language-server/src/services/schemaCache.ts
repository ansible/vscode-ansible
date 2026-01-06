import { Connection } from "vscode-languageserver";

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema | JSONSchema[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  [key: string]: unknown;
}

/**
 * Simple in-memory cache for JSON schemas with 24h TTL.
 */
export class SchemaCache {
  private connection: Connection;
  private cache = new Map<string, { schema: JSONSchema; expires: number }>();
  private readonly TTL = 24 * 60 * 60 * 1000;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getSchema(url: string): Promise<JSONSchema | undefined> {
    const cached = this.cache.get(url);
    if (cached && Date.now() < cached.expires) {
      return cached.schema;
    }

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const schema = (await resp.json()) as JSONSchema;
      this.cache.set(url, { schema, expires: Date.now() + this.TTL });
      this.connection.console.info(`Fetched schema: ${url}`);
      return schema;
    } catch (err) {
      this.connection.console.warn(`Failed to fetch schema ${url}: ${err}`);
      // Return stale cache if available
      return cached?.schema;
    }
  }

  invalidate(url?: string): void {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }
}
