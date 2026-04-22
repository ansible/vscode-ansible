import { TextDocument } from "vscode-languageserver-textdocument";
import { expect, beforeAll, afterAll, assert } from "vitest";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "@test/helper.js";
import { Position } from "vscode-languageserver";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { getDefinition } from "@src/providers/definitionProvider.js";
import { fileExists } from "@src/utils/misc.js";
import { URI } from "vscode-uri";
import { DocsLibrary } from "@src/services/docsLibrary.js";

function testModuleNamesForDefinition(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "definition for builtin modules (ansible.builtin.debug)",
      position: { line: 5, character: 8 } as Position,
      selectionRange: {
        start: { line: 5, character: 6 },
        end: { line: 5, character: 27 },
      },
      provideDefinition: true,
    },
    {
      word: "no definition for invalid module names",
      position: { line: 13, character: 8 } as Position,
      selectionRange: {
        start: { line: 13, character: 6 },
        end: { line: 13, character: 15 },
      },
      provideDefinition: false,
    },
    {
      word: "definition for collection modules (org_1.coll_3.module_3)",
      position: { line: 18, character: 8 } as Position,
      selectionRange: {
        start: { line: 18, character: 6 },
        end: { line: 18, character: 27 },
      },
      provideDefinition: true,
    },
  ];

  tests.forEach(({ word, position, selectionRange, provideDefinition }) => {
    it(`should provide '${word}'`, async function () {
      const actualDefinition = await getDefinition(
        textDoc,
        position,
        await context.docsLibrary,
      );

      if (!provideDefinition) {
        expect(actualDefinition).toBeNull();
        return;
      }

      expect(actualDefinition).toHaveLength(1);
      if (actualDefinition) {
        const definition = actualDefinition[0];
        // file uri check
        expect(definition.targetUri.startsWith("file:///")).toBe(true);
        expect(definition.targetUri).satisfy((fileUri: string) =>
          fileExists(URI.parse(fileUri).path),
        );

        // nodule name range check in the playbook
        expect(definition.originSelectionRange).toEqual(selectionRange);

        // original document range checks
        expect(definition).to.haveOwnProperty("targetRange");
        expect(definition).to.haveOwnProperty("targetSelectionRange");
      }
    });
  });
}

describe("getDefinition()", function () {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "definition/playbook_for_module_definition.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);

  const textDoc = getDoc(fixtureFilePath);
  const docSettings = context?.documentSettings.get(textDoc.uri);

  describe("Module name definitions", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings, context);
        }
      });

      if (context) {
        testModuleNamesForDefinition(context, textDoc);
      }

      afterAll(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
      if (context) {
        testModuleNamesForDefinition(context, textDoc);
      }
    });
  });
});

describe("Symbol-based definitions", () => {
  const emptyDocsLibrary = {
    findModule: async () => [null, false],
  } as unknown as DocsLibrary;

  describe("handler definitions", () => {
    const textDoc = getDoc("references/playbook_handlers.yml");

    it("should provide definition from notify scalar", async () => {
      // line 6: `notify: Restart nginx` — cursor on handler name
      const result = await getDefinition(
        textDoc,
        Position.create(6, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].targetUri).toBe(textDoc.uri);
    });

    it("should provide definition from notify list item", async () => {
      // line 13: `- Restart nginx` in notify list
      const result = await getDefinition(
        textDoc,
        Position.create(13, 10),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should provide definition from handler name (self-reference)", async () => {
      // line 17: `- name: Restart nginx` in handlers section
      const result = await getDefinition(
        textDoc,
        Position.create(17, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should provide definition from listen", async () => {
      // line 26: `listen: Restart nginx`
      const result = await getDefinition(
        textDoc,
        Position.create(26, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("variable definitions", () => {
    const textDoc = getDoc("references/playbook_variables.yml");

    it("should provide definition for vars key", async () => {
      // line 3: `http_port: 8080` — cursor on "http_port"
      const result = await getDefinition(
        textDoc,
        Position.create(3, 6),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toBe(textDoc.uri);
    });

    it("should provide definition from Jinja2 variable reference", async () => {
      // line 12: `msg: "Port is {{ http_port }}"` — cursor on http_port
      const result = await getDefinition(
        textDoc,
        Position.create(12, 28),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
    });

    it("should provide definition from register value", async () => {
      // line 16: `register: cmd_result`
      const result = await getDefinition(
        textDoc,
        Position.create(16, 16),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
    });

    it("should provide definition for vars_prompt name", async () => {
      // line 6: `- name: user_password`
      const result = await getDefinition(
        textDoc,
        Position.create(6, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
    });
  });

  describe("file path definitions", () => {
    const textDoc = getDoc("references/playbook_includes.yml");

    it("should provide definition for include_tasks", async () => {
      // line 6: `ansible.builtin.include_tasks: included_tasks.yml`
      const result = await getDefinition(
        textDoc,
        Position.create(6, 38),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("included_tasks.yml");
    });

    it("should provide definition for template src", async () => {
      // line 10: `src: template.conf.j2`
      const result = await getDefinition(
        textDoc,
        Position.create(10, 16),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("template.conf.j2");
    });

    it("should provide definition for vars_files entry", async () => {
      // line 3: `- vars/defaults.yml`
      const result = await getDefinition(
        textDoc,
        Position.create(3, 10),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("vars/defaults.yml");
    });
  });

  describe("role definitions", () => {
    const textDoc = getDoc("references/playbook_includes.yml");

    it("should provide definition for include_role name", async () => {
      // line 20: `name: test_role`
      const result = await getDefinition(
        textDoc,
        Position.create(20, 16),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("tasks/main.yml");
    });

    it("should resolve role via rolesPaths parameter", async () => {
      // Same role, but explicitly passing rolesPaths
      const rolesDir = resolveDocUri("references/roles");
      const result = await getDefinition(
        textDoc,
        Position.create(20, 16),
        emptyDocsLibrary,
        [rolesDir],
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("tasks/main.yml");
    });
  });

  describe("cross-file role definitions", () => {
    const textDoc = getDoc("references/roles/test_role/tasks/main.yml");

    it("should provide handler definition within role", async () => {
      // line 11: `notify: Restart app`
      const result = await getDefinition(
        textDoc,
        Position.create(11, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Definition should be in handlers/main.yml
      const handlerDef = result.find((d) =>
        d.targetUri.includes("handlers/main.yml"),
      );
      expect(handlerDef).toBeDefined();
    });

    it("should provide variable definition within role", async () => {
      // line 3: `name: "{{ app_user }}"` — cursor on app_user
      const result = await getDefinition(
        textDoc,
        Position.create(3, 14),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
    });

    it("should provide filePath definition for template in role", async () => {
      // line 9: `src: app.conf.j2`
      const result = await getDefinition(
        textDoc,
        Position.create(9, 10),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("templates/app.conf.j2");
    });

    it("should provide filePath definition for include_tasks in role", async () => {
      // line 14: `ansible.builtin.include_tasks: sub_tasks.yml`
      const result = await getDefinition(
        textDoc,
        Position.create(14, 36),
        emptyDocsLibrary,
      );
      assert(result);
      expect(result).toHaveLength(1);
      expect(result[0].targetUri).toContain("sub_tasks.yml");
    });
  });

  describe("null cases", () => {
    it("should return null for non-symbol position", async () => {
      const textDoc = getDoc("references/playbook_includes.yml");
      // line 0: `---` — no symbol here
      const result = await getDefinition(
        textDoc,
        Position.create(0, 0),
        emptyDocsLibrary,
      );
      expect(result).toBeNull();
    });

    it("should return null for non-existent role", async () => {
      const content = `---
- hosts: all
  tasks:
    - ansible.builtin.include_role:
        name: nonexistent_role_xyz
`;
      const doc = TextDocument.create("file:///tmp/test.yml", "ansible", 1, content);
      const result = await getDefinition(
        doc,
        Position.create(4, 14),
        emptyDocsLibrary,
      );
      expect(result).toBeNull();
    });

    it("should return null for handler with no definitions found", async () => {
      const content = `---
- hosts: all
  tasks:
    - name: test
      ansible.builtin.debug:
        msg: hello
      notify: Nonexistent handler name xyz
`;
      const doc = TextDocument.create("file:///tmp/test.yml", "ansible", 1, content);
      const result = await getDefinition(
        doc,
        Position.create(6, 16),
        emptyDocsLibrary,
      );
      expect(result).toBeNull();
    });

    it("should return null for variable with no definitions found", async () => {
      const content = `---
- hosts: all
  tasks:
    - ansible.builtin.debug:
        msg: "{{ undefined_var_xyz }}"
`;
      const doc = TextDocument.create("file:///tmp/test.yml", "ansible", 1, content);
      const result = await getDefinition(
        doc,
        Position.create(4, 18),
        emptyDocsLibrary,
      );
      expect(result).toBeNull();
    });

    it("should return null for non-existent file path", async () => {
      const content = `---
- hosts: all
  tasks:
    - ansible.builtin.include_tasks: nonexistent_file_xyz.yml
`;
      const doc = TextDocument.create("file:///tmp/test.yml", "ansible", 1, content);
      const result = await getDefinition(
        doc,
        Position.create(3, 40),
        emptyDocsLibrary,
      );
      expect(result).toBeNull();
    });
  });
});
