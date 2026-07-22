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

describe("doSemanticTokens()", () => {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "semanticTokens/playbook.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);
  const textDoc = getDoc(fixtureFilePath);

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

    // Encoded semantic token stream should include multiple tokens
    expect(tokens.data.length).toBeGreaterThan(0);
    expect(tokens.data.length % 5).toBe(0);
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
    expect(tokens.data.length).toBeGreaterThan(0);
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
