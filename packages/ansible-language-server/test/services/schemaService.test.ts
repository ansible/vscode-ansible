import { expect } from "chai";
import sinon from "sinon";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver";
import { SchemaService } from "../../src/services/schemaService";
import { SchemaValidator } from "../../src/services/schemaValidator";
import { SchemaCompleter } from "../../src/services/schemaCompleter";
import { JSONSchema } from "../../src/services/schemaCache";

const mockConnection = {
  console: {
    log: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  },
};

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
});
