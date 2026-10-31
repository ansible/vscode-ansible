import { TextDocument } from "vscode-languageserver-textdocument";
import { expect, beforeAll, afterAll, vi } from "vitest";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
  setEeFixtureAnsibleCollectionPathEnv,
} from "@test/helper.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { getDefinition } from "@src/providers/definitionProvider.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { fileExists } from "@src/utils/misc.js";
import { URI } from "vscode-uri";
import * as path from "node:path";

function testModuleNamesForDefinition(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "definition for builtin modules (ansible.builtin.debug)",
      position: { line: 5, character: 8 },
      selectionRange: {
        start: { line: 5, character: 6 },
        end: { line: 5, character: 27 },
      },
      provideDefinition: true,
    },
    {
      word: "no definition for invalid module names",
      position: { line: 13, character: 8 },
      selectionRange: {
        start: { line: 13, character: 6 },
        end: { line: 13, character: 15 },
      },
      provideDefinition: false,
    },
    {
      word: "definition for collection modules (org_1.coll_3.module_3)",
      position: { line: 18, character: 8 },
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
        setEeFixtureAnsibleCollectionPathEnv();
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

  describe("Edge cases with mocked DocsLibrary", function () {
    it("returns null when path cannot be resolved", async function () {
      const doc = TextDocument.create(
        "file:///tmp/def.yml",
        "ansible",
        1,
        `# comment only
`,
      );
      const docsLibrary = {
        findModule: vi.fn().mockResolvedValue([undefined, undefined]),
      } as unknown as DocsLibrary;

      const result = await getDefinition(
        doc,
        { line: 0, character: 0 },
        docsLibrary,
      );
      expect(result).toBeNull();
    });

    it("returns null when cursor is on a non-task key", async function () {
      const doc = TextDocument.create(
        "file:///tmp/def2.yml",
        "ansible",
        1,
        `- hosts: localhost
  tasks: []
`,
      );
      const docsLibrary = {
        findModule: vi.fn().mockResolvedValue([undefined, undefined]),
      } as unknown as DocsLibrary;

      const result = await getDefinition(
        doc,
        { line: 0, character: 4 },
        docsLibrary,
      );
      expect(result).toBeNull();
    });
  });

  describe("File reference definitions", function () {
    const docsLibrary = {
      findModule: vi.fn().mockResolvedValue([undefined, undefined]),
    } as unknown as DocsLibrary;

    const playbook = "definition/file_reference/playbook.yml";
    const roleTasks = "definition/file_reference/roles/web/tasks/main.yml";

    const cases = [
      {
        name: "template src is found in the templates directory",
        file: playbook,
        position: { line: 6, character: 15 },
        expected: "definition/file_reference/templates/myfile.txt.j2",
      },
      {
        name: "copy src is found in the files directory",
        file: playbook,
        position: { line: 11, character: 15 },
        expected: "definition/file_reference/files/static.txt",
      },
      {
        name: "short module names are supported",
        file: playbook,
        position: { line: 34, character: 15 },
        expected: "definition/file_reference/templates/myfile.txt.j2",
      },
      {
        name: "free-form include_tasks value is resolved",
        file: playbook,
        position: { line: 30, character: 40 },
        expected: "definition/file_reference/extra_tasks.yml",
      },
      {
        name: "role template is found in the role templates directory",
        file: roleTasks,
        position: { line: 3, character: 12 },
        expected: "definition/file_reference/roles/web/templates/nginx.conf.j2",
      },
      {
        name: "role copy is found in the role files directory",
        file: roleTasks,
        position: { line: 8, character: 12 },
        expected: "definition/file_reference/roles/web/files/motd.txt",
      },
    ];

    cases.forEach(({ name, file, position, expected }) => {
      it(`resolves: ${name}`, async function () {
        const doc = getDoc(file);
        const result = await getDefinition(doc, position, docsLibrary);
        expect(result).toHaveLength(1);
        const definition = result?.[0];
        expect(definition).toBeDefined();
        if (definition) {
          expect(URI.parse(definition.targetUri).fsPath.toLowerCase()).toBe(
            resolveDocUri(expected).toLowerCase(),
          );
          expect(definition.originSelectionRange).toBeDefined();
        }
      });
    });

    const nullCases = [
      {
        name: "file does not exist",
        position: { line: 16, character: 15 },
      },
      {
        name: "value contains a Jinja expression",
        position: { line: 21, character: 18 },
      },
      {
        name: "option is a destination on the managed host (dest)",
        position: { line: 27, character: 16 },
      },
    ];

    nullCases.forEach(({ name, position }) => {
      it(`returns null when ${name}`, async function () {
        const doc = getDoc(playbook);
        const result = await getDefinition(doc, position, docsLibrary);
        expect(result).toBeNull();
      });
    });

    it("reports when a static file reference cannot be found", async function () {
      const doc = getDoc(playbook);
      const onUnresolvedReference = vi.fn();
      await getDefinition(
        doc,
        { line: 16, character: 15 },
        docsLibrary,
        [],
        onUnresolvedReference,
      );

      expect(onUnresolvedReference).toHaveBeenCalledWith("absent.txt");
    });

    it("falls back to the basedir passed by the caller", async function () {
      const doc = TextDocument.create(
        URI.file(resolveDocUri("elsewhere.yml")).toString(),
        "ansible",
        1,
        `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: static.txt
        dest: /tmp/x
`,
      );
      const base = resolveDocUri("definition/file_reference");
      const result = await getDefinition(
        doc,
        { line: 3, character: 14 },
        docsLibrary,
        [base],
      );
      expect(result).toHaveLength(1);
      const definition = result?.[0];
      expect(definition).toBeDefined();
      if (definition) {
        expect(URI.parse(definition.targetUri).fsPath.toLowerCase()).toBe(
          path.join(base, "files", "static.txt").toLowerCase(),
        );
      }
    });

    it("resolves top-level import_playbook references", async function () {
      const text = "- ansible.builtin.import_playbook: imported_playbook.yml\n";
      const doc = TextDocument.create(
        URI.file(resolveDocUri(playbook)).toString(),
        "ansible",
        1,
        text,
      );
      const result = await getDefinition(
        doc,
        doc.positionAt(text.indexOf("imported_playbook.yml")),
        docsLibrary,
      );

      expect(result).toHaveLength(1);
      const definition = result?.[0];
      expect(definition).toBeDefined();
      if (definition) {
        expect(URI.parse(definition.targetUri).fsPath.toLowerCase()).toBe(
          resolveDocUri(
            "definition/file_reference/imported_playbook.yml",
          ).toLowerCase(),
        );
      }
    });

    it("does not resolve nested import_playbook references", async function () {
      const text = `- hosts: localhost
  tasks:
    - ansible.builtin.import_playbook: imported_playbook.yml
`;
      const doc = TextDocument.create(
        URI.file(resolveDocUri(playbook)).toString(),
        "ansible",
        1,
        text,
      );
      const result = await getDefinition(
        doc,
        doc.positionAt(text.indexOf("imported_playbook.yml")),
        docsLibrary,
      );

      expect(result).toBeNull();
    });

    it.each([
      {
        name: "copy with remote_src enabled",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.copy:\n        src: static.txt\n        dest: /tmp/x\n        remote_src: true\n",
        reference: "static.txt",
      },
      {
        name: "unarchive with remote_src enabled",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.unarchive:\n        src: static.txt\n        dest: /tmp/x\n        remote_src: true\n",
        reference: "static.txt",
      },
      {
        name: "assemble by default",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.assemble:\n        src: assemble_fragments\n        dest: /tmp/x\n",
        reference: "assemble_fragments",
      },
    ])(
      "does not resolve managed-host sources for $name",
      async function ({
        text,
        reference,
      }: {
        text: string;
        reference: string;
      }) {
        const doc = TextDocument.create(
          URI.file(resolveDocUri(playbook)).toString(),
          "ansible",
          1,
          text,
        );
        const result = await getDefinition(
          doc,
          doc.positionAt(text.indexOf(reference)),
          docsLibrary,
        );

        expect(result).toBeNull();
      },
    );

    it.each([
      {
        name: "copy source directory",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.copy:\n        src: directory\n        dest: /tmp/x\n",
        reference: "directory",
        expected: "definition/file_reference/files/directory",
      },
      {
        name: "controller-side assemble source directory",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.assemble:\n        src: assemble_fragments\n        dest: /tmp/x\n        remote_src: false\n",
        reference: "assemble_fragments",
        expected: "definition/file_reference/files/assemble_fragments",
      },
    ])(
      "resolves directory references for $name",
      async function ({
        text,
        reference,
        expected,
      }: {
        text: string;
        reference: string;
        expected: string;
      }) {
        const doc = TextDocument.create(
          URI.file(resolveDocUri(playbook)).toString(),
          "ansible",
          1,
          text,
        );
        const result = await getDefinition(
          doc,
          doc.positionAt(text.indexOf(reference)),
          docsLibrary,
        );

        expect(result).toHaveLength(1);
        const definition = result?.[0];
        expect(definition).toBeDefined();
        if (definition) {
          expect(URI.parse(definition.targetUri).fsPath.toLowerCase()).toBe(
            resolveDocUri(expected).toLowerCase(),
          );
        }
      },
    );

    it("does not resolve an unarchive source directory", async function () {
      const text = `- hosts: localhost
  tasks:
    - ansible.builtin.unarchive:
        src: directory
        dest: /tmp/x
`;
      const doc = TextDocument.create(
        URI.file(resolveDocUri(playbook)).toString(),
        "ansible",
        1,
        text,
      );
      const result = await getDefinition(
        doc,
        doc.positionAt(text.indexOf("directory")),
        docsLibrary,
      );

      expect(result).toBeNull();
    });

    it.each([
      { value: '"yes"', resolves: false },
      { value: '"on"', resolves: false },
      { value: '"true"', resolves: false },
      { value: '"no"', resolves: true },
      { value: '"off"', resolves: true },
      { value: '"false"', resolves: true },
      { value: '"maybe"', resolves: false },
    ])(
      "handles string remote_src $value",
      async function ({
        value,
        resolves,
      }: {
        value: string;
        resolves: boolean;
      }) {
        const text = `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: static.txt
        dest: /tmp/x
        remote_src: ${value}
`;
        const doc = TextDocument.create(
          URI.file(resolveDocUri(playbook)).toString(),
          "ansible",
          1,
          text,
        );
        const result = await getDefinition(
          doc,
          doc.positionAt(text.indexOf("static.txt")),
          docsLibrary,
        );

        if (resolves) {
          expect(result).toHaveLength(1);
        } else {
          expect(result).toBeNull();
        }
      },
    );

    it("returns null for a top-level free-form value outside a task", async function () {
      const text = "include_tasks: extra_tasks.yml\n";
      const doc = TextDocument.create(
        URI.file(resolveDocUri(playbook)).toString(),
        "ansible",
        1,
        text,
      );
      const result = await getDefinition(
        doc,
        doc.positionAt(text.indexOf("extra_tasks.yml")),
        docsLibrary,
      );
      expect(result).toBeNull();
    });

    it("returns null for a top-level module option outside a task", async function () {
      const text = "template:\n  src: myfile.txt.j2\n";
      const doc = TextDocument.create(
        URI.file(resolveDocUri(playbook)).toString(),
        "ansible",
        1,
        text,
      );
      const result = await getDefinition(
        doc,
        doc.positionAt(text.indexOf("myfile.txt.j2")),
        docsLibrary,
      );
      expect(result).toBeNull();
    });
  });
});
