import { expect, beforeAll, afterAll } from "vitest";
import { SemanticTokenTypes } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  doSemanticTokens,
  tokenModifiers,
  tokenTypes,
} from "@src/providers/semanticTokenProvider.js";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  setFixtureAnsibleCollectionPathEnv,
} from "@test/helper.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { IModuleMetadata, IOption } from "@src/interfaces/module.js";

type DecodedToken = {
  line: number;
  start: number;
  length: number;
  typeIndex: number;
  modifiers: number;
};

function decodeSemanticTokens(data: number[] | Uint32Array): DecodedToken[] {
  const tokens: DecodedToken[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;
    tokens.push({
      line,
      start: character,
      length: data[i + 2],
      typeIndex: data[i + 3],
      modifiers: data[i + 4],
    });
  }
  return tokens;
}

function tokenTypeIndexes(tokens: DecodedToken[]): Set<number> {
  return new Set(tokens.map((t) => t.typeIndex));
}

describe("doSemanticTokens()", () => {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "semanticTokens/playbook.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);
  const textDoc = getDoc(fixtureFilePath);

  const methodType = tokenTypes.indexOf(SemanticTokenTypes.method);
  const classType = tokenTypes.indexOf(SemanticTokenTypes.class);
  const keywordType = tokenTypes.indexOf(SemanticTokenTypes.keyword);
  const propertyType = tokenTypes.indexOf(SemanticTokenTypes.property);

  beforeAll(() => {
    setFixtureAnsibleCollectionPathEnv();
  });

  afterAll(() => {
    setFixtureAnsibleCollectionPathEnv();
  });

  it("exports token legend lists", () => {
    expect(tokenTypes).toContain(SemanticTokenTypes.keyword);
    expect(tokenModifiers.length).toBeGreaterThan(0);
  });

  it("returns empty tokens for an empty document", async () => {
    const emptyDoc = TextDocument.create(
      "file:///tmp/empty.yml",
      "ansible",
      1,
      "",
    );
    const docsLibrary = {
      findModule: async () => [undefined, undefined],
    } as unknown as DocsLibrary;

    const tokens = await doSemanticTokens(emptyDoc, docsLibrary);
    expect(tokens.data).toEqual([]);
  });

  it("marks play, role, block, task keywords and module options", async () => {
    expect(context).toBeDefined();
    if (!context) {
      return;
    }

    const tokens = await doSemanticTokens(textDoc, await context.docsLibrary);
    expect(tokens.data.length % 5).toBe(0);

    const decoded = decodeSemanticTokens(tokens.data);
    expect(decoded.length).toBeGreaterThan(0);

    const types = tokenTypeIndexes(decoded);
    // Play/task keywords, module names, and ordinary/nested keys
    expect(types.has(keywordType)).toBe(true);
    expect(types.has(classType)).toBe(true);
    expect(types.has(propertyType)).toBe(true);

    // Representative positions from semanticTokens/playbook.yml
    // line 1: "name" (play keyword), line 2: "hosts", line 14: module FQCN
    expect(
      decoded.some(
        (t) => t.line === 1 && t.typeIndex === keywordType && t.length === 4,
      ),
    ).toBe(true);
    expect(
      decoded.some(
        (t) => t.line === 2 && t.typeIndex === keywordType && t.length === 5,
      ),
    ).toBe(true);
    expect(
      decoded.some((t) => t.line === 14 && t.typeIndex === classType),
    ).toBe(true);
  });

  it("marks module parameters for dict, list, unknown options and args", async () => {
    const options = new Map<string, IOption>([
      [
        "opt_1",
        {
          name: "opt_1",
          required: false,
          type: "list",
          suboptions: new Map([
            ["sub_opt_1", { name: "sub_opt_1", required: true, type: "str" }],
            [
              "sub_opt_2",
              {
                name: "sub_opt_2",
                required: false,
                type: "list",
                suboptions: new Map([
                  [
                    "sub_sub_opt_1",
                    { name: "sub_sub_opt_1", required: true, type: "str" },
                  ],
                ]),
              },
            ],
          ]),
        },
      ],
      ["opt_2", { name: "opt_2", required: false, type: "str" }],
      [
        "opt_dict",
        {
          name: "opt_dict",
          required: false,
          type: "dict",
          suboptions: new Map([
            ["nested_a", { name: "nested_a", required: false, type: "int" }],
            [
              "nested_b",
              {
                name: "nested_b",
                required: false,
                type: "dict",
                suboptions: new Map([
                  ["deeper", { name: "deeper", required: false, type: "int" }],
                ]),
              },
            ],
          ]),
        },
      ],
    ]);

    const module: IModuleMetadata = {
      source: "/tmp/module_1.py",
      sourceLineRange: [0, 10],
      fqcn: "org_1.coll_1.module_1",
      namespace: "org_1",
      collection: "coll_1",
      name: "module_1",
      rawDocumentationFragments: new Map(),
      documentation: {
        module: "module_1",
        deprecated: false,
        options,
      },
      errors: [],
    };

    const docsLibrary = {
      findModule: async (name: string) => {
        if (
          name === "org_1.coll_1.module_1" ||
          name === "ansible.builtin.debug"
        ) {
          return [module, name];
        }
        return [undefined, undefined];
      },
    } as unknown as DocsLibrary;

    const tokens = await doSemanticTokens(textDoc, docsLibrary);
    const decoded = decodeSemanticTokens(tokens.data);
    const types = tokenTypeIndexes(decoded);

    expect(types.has(methodType)).toBe(true);
    expect(types.has(propertyType)).toBe(true);
    expect(types.has(classType)).toBe(true);
    expect(types.has(keywordType)).toBe(true);

    // Known options / nested suboptions → method
    expect(
      decoded.some(
        (t) => t.line === 15 && t.typeIndex === methodType && t.length === 5,
      ),
    ).toBe(true); // opt_1
    expect(
      decoded.some(
        (t) => t.line === 16 && t.typeIndex === methodType && t.length === 9,
      ),
    ).toBe(true); // sub_opt_1
    expect(
      decoded.some(
        (t) => t.line === 21 && t.typeIndex === methodType && t.length === 5,
      ),
    ).toBe(true); // opt_2
    expect(
      decoded.some(
        (t) => t.line === 24 && t.typeIndex === methodType && t.length === 8,
      ),
    ).toBe(true); // nested_a
    // Unknown option keys under a known module are not classified as method
    expect(
      decoded.some(
        (t) => t.line === 22 && t.typeIndex === methodType && t.length === 11,
      ),
    ).toBe(false); // unknown_opt
    // Ordinary / non-module keys → property (e.g. custom_play_key, env vars)
    expect(
      decoded.some(
        (t) => t.line === 3 && t.typeIndex === propertyType && t.length === 15,
      ),
    ).toBe(true); // custom_play_key
    // args is a task keyword
    expect(
      decoded.some(
        (t) => t.line === 29 && t.typeIndex === keywordType && t.length === 4,
      ),
    ).toBe(true); // args
  });

  it("handles documents without YAML contents", async () => {
    const commentOnly = TextDocument.create(
      "file:///tmp/comments.yml",
      "ansible",
      1,
      "# just a comment\n",
    );
    const docsLibrary = {
      findModule: async () => [undefined, undefined],
    } as unknown as DocsLibrary;

    const tokens = await doSemanticTokens(commentOnly, docsLibrary);
    expect(tokens.data).toEqual([]);
  });
});
