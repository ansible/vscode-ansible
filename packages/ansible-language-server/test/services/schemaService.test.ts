import { expect } from "chai";
import sinon from "sinon";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver";
import { SchemaService } from "../../src/services/schemaService";
import { SchemaValidator } from "../../src/services/schemaValidator";
import { SchemaCompleter } from "../../src/services/schemaCompleter";
import { JSONSchema, SchemaCache } from "../../src/services/schemaCache";

const mockConnection = {
  console: {
    log: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  },
};

describe("SchemaCache", () => {
  let cache: SchemaCache;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cache = new SchemaCache(mockConnection as any);
    fetchStub = sinon.stub(global, "fetch");
  });

  afterEach(() => {
    fetchStub.restore();
    sinon.reset();
  });

  it("fetches and caches schema", async () => {
    const mockSchema = { type: "object", properties: {} };
    fetchStub.resolves({
      ok: true,
      json: async () => mockSchema,
    } as Response);

    const result = await cache.getSchema("http://test.com/schema.json");
    expect(result).to.deep.equal(mockSchema);
  });

  it("returns cached schema on second call", async () => {
    const mockSchema = { type: "object", properties: {} };
    fetchStub.resolves({
      ok: true,
      json: async () => mockSchema,
    } as Response);

    await cache.getSchema("http://test.com/schema.json");
    const result = await cache.getSchema("http://test.com/schema.json");
    expect(result).to.deep.equal(mockSchema);
    expect(fetchStub.calledOnce).to.be.true;
  });

  it("handles fetch error gracefully", async () => {
    fetchStub.rejects(new Error("Network error"));

    const result = await cache.getSchema("http://test.com/schema.json");
    expect(result).to.be.undefined;
  });

  it("handles non-ok response", async () => {
    fetchStub.resolves({
      ok: false,
      status: 404,
    } as Response);

    const result = await cache.getSchema("http://test.com/schema.json");
    expect(result).to.be.undefined;
  });

  it("invalidates specific URL", () => {
    cache.invalidate("http://test.com/schema.json");
    // No error should be thrown
  });

  it("invalidates all cache", () => {
    cache.invalidate();
    // No error should be thrown
  });
});

describe("SchemaService", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new SchemaService(mockConnection as any);

  it("matches meta/main.yml files", () => {
    expect(service.getSchemaUrlForUri("file:///role/meta/main.yml")).to.include(
      "meta.json",
    );
    expect(
      service.getSchemaUrlForUri("file:///role/meta/main.yaml"),
    ).to.include("meta.json");
  });

  it("matches meta/runtime.yml files", () => {
    expect(
      service.getSchemaUrlForUri("file:///coll/meta/runtime.yml"),
    ).to.include("meta-runtime.json");
  });

  it("ignores non-meta files", () => {
    expect(service.getSchemaUrlForUri("file:///role/tasks/main.yml")).to.be
      .undefined;
    expect(service.getSchemaUrlForUri("file:///playbook.yml")).to.be.undefined;
  });

  it("shouldValidateWithSchema returns correct boolean", () => {
    const metaDoc = TextDocument.create(
      "file:///meta/main.yml",
      "ansible",
      1,
      "",
    );
    const taskDoc = TextDocument.create(
      "file:///tasks/main.yml",
      "ansible",
      1,
      "",
    );
    expect(service.shouldValidateWithSchema(metaDoc)).to.be.true;
    expect(service.shouldValidateWithSchema(taskDoc)).to.be.false;
  });

  it("handles invalid URI gracefully", () => {
    const result = service.getSchemaUrlForUri("not-a-valid-uri");
    expect(result).to.be.undefined;
  });

  it("handles URI that throws during parsing", () => {
    // Empty string causes URI.parse to work but returns empty path
    const result = service.getSchemaUrlForUri("");
    expect(result).to.be.undefined;
  });

  it("getSchemaForDocument returns undefined for non-meta files", async () => {
    const taskDoc = TextDocument.create(
      "file:///tasks/main.yml",
      "ansible",
      1,
      "",
    );
    const result = await service.getSchemaForDocument(taskDoc);
    expect(result).to.be.undefined;
  });

  it("getSchemaForDocument attempts to fetch for meta files", async () => {
    const metaDoc = TextDocument.create(
      "file:///meta/main.yml",
      "ansible",
      1,
      "",
    );
    // This will try to fetch but may fail - we just test it doesn't throw
    const result = await service.getSchemaForDocument(metaDoc);
    // Result may be undefined if fetch fails, or schema if it succeeds
    expect(result === undefined || typeof result === "object").to.be.true;
  });
});

describe("SchemaValidator", () => {
  const validator = new SchemaValidator();

  const schema: JSONSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      count: { type: "number" },
    },
    required: ["name"],
    additionalProperties: false,
  };

  it("returns no errors for valid doc", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "name: test\ncount: 5",
    );
    expect(validator.validate(doc, schema)).to.be.empty;
  });

  it("reports missing required property", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "count: 5");
    const diags = validator.validate(doc, schema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].message).to.include("name");
    expect(diags[0].severity).to.equal(DiagnosticSeverity.Error);
  });

  it("warns on unknown property", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "name: test\nextra: bad",
    );
    const diags = validator.validate(doc, schema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].message).to.include("extra");
    expect(diags[0].severity).to.equal(DiagnosticSeverity.Warning);
  });

  it("handles empty document", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    expect(validator.validate(doc, schema)).to.be.empty;
  });

  it("reports enum validation errors", () => {
    const enumSchema: JSONSchema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "inactive"] },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "status: invalid",
    );
    const diags = validator.validate(doc, enumSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].message).to.include("Must be one of:");
  });

  it("reports type validation errors", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "name: test\ncount: invalid",
    );
    const diags = validator.validate(doc, schema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].message).to.include("Expected");
  });

  it("validates array items", () => {
    const arraySchema: JSONSchema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
            },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "items:\n  - id: invalid",
    );
    const diags = validator.validate(doc, arraySchema);
    expect(diags).to.have.lengthOf(1);
  });

  it("handles YAML parse errors gracefully", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "invalid: yaml: content:",
    );
    const diags = validator.validate(doc, schema);
    expect(diags).to.be.empty;
  });

  it("uses default error message for unknown keywords", () => {
    const patternSchema: JSONSchema = {
      type: "object",
      properties: {
        email: { type: "string", pattern: "^[a-z]+$" },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "email: UPPERCASE",
    );
    const diags = validator.validate(doc, patternSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].code).to.equal("pattern");
  });

  it("provides diagnostic for deeply nested missing required field", () => {
    const deepSchema: JSONSchema = {
      type: "object",
      properties: {
        level1: {
          type: "object",
          required: ["required_field"],
          properties: {
            required_field: { type: "string" },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "level1: {}",
    );
    const diags = validator.validate(doc, deepSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("validates additional properties at root level", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "name: test\nextra: value",
    );
    const diags = validator.validate(doc, schema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range.start.line).to.be.greaterThanOrEqual(0);
  });

  it("handles invalid schema compilation gracefully", () => {
    const invalidSchema = {
      type: "invalid_type_that_causes_error",
      properties: {},
    } as unknown as JSONSchema;
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "name: test",
    );
    const diags = validator.validate(doc, invalidSchema);
    expect(diags).to.be.empty;
  });

  it("handles document with YAML syntax errors", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "key: [unclosed bracket",
    );
    const diags = validator.validate(doc, schema);
    expect(diags).to.be.empty;
  });

  it("handles nested array validation with proper range", () => {
    const nestedSchema: JSONSchema = {
      type: "object",
      properties: {
        list: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "list:\n  - value: test\n    extra: bad",
    );
    const diags = validator.validate(doc, nestedSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range.start.line).to.be.greaterThanOrEqual(0);
  });

  it("handles error path through scalar value", () => {
    // Schema expects nested object but YAML has scalar - validates type mismatch
    const nestedObjSchema: JSONSchema = {
      type: "object",
      properties: {
        config: {
          type: "object",
          properties: {
            setting: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "config:\n  unknown: value",
    );
    const diags = validator.validate(doc, nestedObjSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("handles deeply nested additional properties error", () => {
    const deepSchema: JSONSchema = {
      type: "object",
      properties: {
        level1: {
          type: "object",
          properties: {
            level2: {
              type: "object",
              additionalProperties: false,
              properties: {
                known: { type: "string" },
              },
            },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "level1:\n  level2:\n    unknown: value",
    );
    const diags = validator.validate(doc, deepSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].message).to.include("unknown");
  });

  it("handles validation error in array item", () => {
    const arraySchema: JSONSchema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
            },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "items:\n  - name: ok\n  - name: ok\n    extra: bad",
    );
    const diags = validator.validate(doc, arraySchema);
    expect(diags).to.have.lengthOf(1);
  });

  it("validates minItems constraint", () => {
    // Test with minItems violation which doesn't point to a specific node
    const minItemsSchema: JSONSchema = {
      type: "object",
      properties: {
        list: {
          type: "array",
          minItems: 2,
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "list:\n  - one",
    );
    const diags = validator.validate(doc, minItemsSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("validates nested object type when scalar provided", () => {
    // Schema expects nested object but value is scalar
    // Validates type mismatch at nested level
    const nestedSchema: JSONSchema = {
      type: "object",
      properties: {
        config: {
          type: "object",
          required: ["nested"],
          properties: {
            nested: { type: "string" },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "config:\n  other: value",
    );
    const diags = validator.validate(doc, nestedSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("handles root-level validation error", () => {
    // Error at root level - tests empty path handling
    const rootSchema: JSONSchema = {
      type: "object",
      required: ["mandatory"],
      properties: {
        mandatory: { type: "string" },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "other: value",
    );
    const diags = validator.validate(doc, rootSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("handles error on non-existent nested path", () => {
    // Schema that causes error on deep path that doesn't exist in YAML
    const nestedReqSchema: JSONSchema = {
      type: "object",
      properties: {
        parent: {
          type: "object",
          properties: {
            child: {
              type: "object",
              required: ["deep_required"],
              properties: {
                deep_required: { type: "string" },
              },
            },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "parent:\n  child: {}\n",
    );
    const diags = validator.validate(doc, nestedReqSchema);
    expect(diags).to.have.lengthOf(1);
    expect(diags[0].range).to.exist;
  });

  it("returns valid range when node found is undefined in path", () => {
    // Test case where path points to non-existent key
    const strictSchema: JSONSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        known: { type: "string" },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "unknown_key: value\n",
    );
    const diags = validator.validate(doc, strictSchema);
    expect(diags.length).to.be.greaterThan(0);
    expect(diags[0].range.start).to.exist;
    expect(diags[0].range.end).to.exist;
  });
});

describe("SchemaCompleter", () => {
  const completer = new SchemaCompleter();

  const schema: JSONSchema = {
    type: "object",
    properties: {
      author: { type: "string", description: "The author" },
      version: { type: "string" },
      tags: { type: "array" },
    },
    required: ["author"],
  };

  it("suggests properties at root level", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    const labels = items.map((i) => i.label);
    expect(labels).to.include("author");
    expect(labels).to.include("version");
  });

  it("excludes existing keys", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "author: me\n",
    );
    const items = completer.complete(doc, { line: 1, character: 0 }, schema);
    const labels = items.map((i) => i.label);
    expect(labels).to.not.include("author");
    expect(labels).to.include("version");
  });

  it("prioritizes required properties", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    const authorItem = items.find((i) => i.label === "author");
    const versionItem = items.find((i) => i.label === "version");
    expect(authorItem?.sortText).to.match(/^0_/);
    expect(versionItem?.sortText).to.match(/^1_/);
  });

  it("generates enum snippet for enum properties", () => {
    const enumSchema: JSONSchema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "inactive", "pending"] },
      },
    };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(
      doc,
      { line: 0, character: 0 },
      enumSchema,
    );
    const statusItem = items.find((i) => i.label === "status");
    expect(statusItem?.insertText).to.include("active,inactive,pending");
  });

  it("generates default value snippet for properties with defaults", () => {
    const defaultSchema: JSONSchema = {
      type: "object",
      properties: {
        timeout: { type: "number", default: 30 },
      },
    };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(
      doc,
      { line: 0, character: 0 },
      defaultSchema,
    );
    const timeoutItem = items.find((i) => i.label === "timeout");
    expect(timeoutItem?.insertText).to.include("30");
  });

  it("generates boolean snippet for boolean properties", () => {
    const boolSchema: JSONSchema = {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
    };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(
      doc,
      { line: 0, character: 0 },
      boolSchema,
    );
    const enabledItem = items.find((i) => i.label === "enabled");
    expect(enabledItem?.insertText).to.include("true,false");
  });

  it("generates object snippet for object properties", () => {
    const objSchema: JSONSchema = {
      type: "object",
      properties: {
        config: { type: "object" },
      },
    };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(doc, { line: 0, character: 0 }, objSchema);
    const configItem = items.find((i) => i.label === "config");
    expect(configItem?.insertText).to.equal("config:\n  $1");
  });

  it("returns empty when no schema properties", () => {
    const emptySchema: JSONSchema = { type: "object" };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(
      doc,
      { line: 0, character: 0 },
      emptySchema,
    );
    expect(items).to.be.empty;
  });

  it("handles map without matching key in getExistingKeys", () => {
    const schema2: JSONSchema = {
      type: "object",
      properties: {
        parent: {
          type: "object",
          properties: {
            child: { type: "string" },
          },
        },
      },
    };
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "other: value\n",
    );
    const items = completer.complete(doc, { line: 1, character: 0 }, schema2);
    const labels = items.map((i) => i.label);
    expect(labels).to.include("parent");
  });

  it("handles YAML that throws during parsing", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "\t\t\tinvalid",
    );
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles severely malformed YAML", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "---\n%invalid directive\n...",
    );
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles cursor inside a key value", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "author: some value here",
    );
    const items = completer.complete(doc, { line: 0, character: 10 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles cursor at key boundary", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "author: x\nversion: y\n",
    );
    const items = completer.complete(doc, { line: 0, character: 5 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles completion after colon", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "author:");
    const items = completer.complete(doc, { line: 0, character: 7 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles empty key scenario", () => {
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, ": value");
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles multiline with cursor in middle", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "author: test\nversion: 1.0\ntags:\n  - one",
    );
    const items = completer.complete(doc, { line: 1, character: 8 }, schema);
    expect(items).to.be.an("array");
  });

  it("handles schema with array property", () => {
    const arraySchema: JSONSchema = {
      type: "object",
      properties: {
        list: {
          type: "array",
          items: { type: "string" },
        },
      },
    };
    const doc = TextDocument.create("file:///test.yml", "yaml", 1, "");
    const items = completer.complete(
      doc,
      { line: 0, character: 0 },
      arraySchema,
    );
    expect(items.map((i) => i.label)).to.include("list");
  });

  it("handles existing keys with anchors", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "&anchor author: test\n",
    );
    const items = completer.complete(doc, { line: 1, character: 0 }, schema);
    // Should still filter out 'author' even with anchor syntax
    expect(items).to.be.an("array");
  });

  it("handles non-map YAML content", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "- item1\n- item2",
    );
    const items = completer.complete(doc, { line: 0, character: 0 }, schema);
    // Should return all properties since no existing keys found in array
    expect(items.map((i) => i.label)).to.include("author");
  });

  it("handles document with complex keys", () => {
    const doc = TextDocument.create(
      "file:///test.yml",
      "yaml",
      1,
      "author: me\n",
    );
    const items = completer.complete(doc, { line: 1, character: 0 }, schema);
    expect(items.map((i) => i.label)).to.not.include("author");
  });
});
