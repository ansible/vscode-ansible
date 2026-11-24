import { TextDocument } from "vscode-languageserver-textdocument";
import { expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
  setEeFixtureAnsibleCollectionPathEnv,
  skipEE,
} from "@test/helper.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { getDefinition } from "@src/providers/definitionProvider.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { fileExists, terminateTrackedAsyncSpawns } from "@src/utils/misc.js";
import { URI } from "vscode-uri";
import * as path from "node:path";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";

// Run @noee before @ee so disabling EE does not leave docsLibrary init hung on CI.
let eeDefinitionReady: boolean | undefined;

const EE_PROBE_BUDGET_MS = 60_000;
const EE_PROBE_INTERVAL_MS = 3_000;
const EE_PROBE_ATTEMPT_TIMEOUT_MS = 30_000;
const EE_INFLIGHT_DRAIN_BUDGET_MS = EE_PROBE_ATTEMPT_TIMEOUT_MS;
const EE_PROBE_TIMEOUT_MSG = "EE probe: docsLibrary exceeded attempt timeout";
const EE_SPAWN_SYNC_TIMEOUT_ENV = "ANSIBLE_LS_SPAWN_SYNC_TIMEOUT_MS";
const EE_TRACK_ASYNC_SPAWN_ENV = "ANSIBLE_LS_TRACK_ASYNC_SPAWN";
const EE_REQUIRED_FIXTURE_MODULE = "org_1.coll_3.module_3";
const EE_DEFINITION_SETUP_HOOK_TIMEOUT_MS =
  EE_PROBE_BUDGET_MS + EE_INFLIGHT_DRAIN_BUDGET_MS + 15_000;

function isTransientEeReadinessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof Error && "code" in err
      ? String((err as NodeJS.ErrnoException).code)
      : "";
  if (msg.includes(EE_PROBE_TIMEOUT_MSG)) {
    return true;
  }
  if (code === "ETIMEDOUT" || msg.includes("ETIMEDOUT")) {
    return true;
  }
  if (msg.includes("Failed to initialize execution environment")) {
    return true;
  }
  if (/Process '.*' exited with code/.test(msg)) {
    return true;
  }
  return false;
}

function setEeDefinitionSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = String(EE_PROBE_ATTEMPT_TIMEOUT_MS);
  process.env[EE_TRACK_ASYNC_SPAWN_ENV] = "1";
}

function clearEeDefinitionSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = undefined;
  process.env[EE_TRACK_ASYNC_SPAWN_ENV] = undefined;
  terminateTrackedAsyncSpawns();
}

/**
 * Wait for an abandoned `docsLibrary` init before `clearCachedServices`.
 * A timed-out probe can still be copying plugin docs into the host cache;
 * starting another attempt on the same path can skip `cp` and write a
 * success marker over a partial cache.
 */
type DrainResult =
  | { outcome: "succeeded" }
  | { outcome: "timeout" }
  | { outcome: "failed"; error: unknown };

async function hasRequiredEeFixtureModule(
  docsLibrary: DocsLibrary,
): Promise<boolean> {
  const [module] = await docsLibrary.findModule(EE_REQUIRED_FIXTURE_MODULE);
  return module !== undefined;
}

async function drainAbandonedDocsLibraryInit(
  initPromise: Thenable<DocsLibrary>,
  budgetMs: number,
): Promise<DrainResult> {
  terminateTrackedAsyncSpawns();
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let result: DrainResult = { outcome: "timeout" };
  try {
    await Promise.race([
      Promise.resolve(initPromise).then(
        () => {
          result = { outcome: "succeeded" };
        },
        (err: unknown) => {
          result = { outcome: "failed", error: err };
        },
      ),
      new Promise<void>((resolve) => {
        drainTimer = setTimeout(resolve, budgetMs);
      }),
    ]);
  } finally {
    if (drainTimer !== undefined) {
      clearTimeout(drainTimer);
    }
  }
  return result;
}

async function warmEeDocsLibrary(
  context: WorkspaceFolderContext,
): Promise<boolean> {
  const deadline = Date.now() + EE_PROBE_BUDGET_MS;
  while (Date.now() < deadline) {
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    const initPromise = context.docsLibrary;
    try {
      const remainingMs = Math.min(
        EE_PROBE_ATTEMPT_TIMEOUT_MS,
        deadline - Date.now(),
      );
      const docsLibrary = await Promise.race([
        initPromise,
        new Promise<never>((_, reject) => {
          attemptTimer = setTimeout(
            () => reject(new Error(EE_PROBE_TIMEOUT_MSG)),
            remainingMs,
          );
        }),
      ]);
      if (await hasRequiredEeFixtureModule(docsLibrary)) {
        return true;
      }
      context.clearCachedServices();
    } catch (err: unknown) {
      if (!isTransientEeReadinessError(err)) {
        throw err;
      }
      const drain = await drainAbandonedDocsLibraryInit(
        initPromise,
        EE_INFLIGHT_DRAIN_BUDGET_MS,
      );
      if (drain.outcome === "succeeded") {
        const docsLibrary = await initPromise;
        if (await hasRequiredEeFixtureModule(docsLibrary)) {
          return true;
        }
      } else if (drain.outcome === "timeout") {
        break;
      } else if (!isTransientEeReadinessError(drain.error)) {
        throw drain.error;
      }
      context.clearCachedServices();
    } finally {
      if (attemptTimer !== undefined) {
        clearTimeout(attemptTimer);
      }
    }
    await new Promise<void>((r) => setTimeout(r, EE_PROBE_INTERVAL_MS));
  }

  console.warn(
    `[definition-ee] EE docsLibrary not ready within ` +
      `${EE_PROBE_BUDGET_MS / 1000}s — @ee definition tests will skip`,
  );
  return false;
}

async function prepareEeDefinitionContext(
  docSettings: Thenable<ExtensionSettings> | undefined,
  context: WorkspaceFolderContext | undefined,
): Promise<void> {
  if (skipEE()) {
    eeDefinitionReady = false;
    return;
  }
  if (!docSettings || !context) {
    eeDefinitionReady = false;
    return;
  }
  setEeDefinitionSpawnSyncTimeout();
  setEeFixtureAnsibleCollectionPathEnv();
  await enableExecutionEnvironmentSettings(docSettings, context);
  eeDefinitionReady = await warmEeDocsLibrary(context);
}

async function teardownEeDefinitionContext(
  docSettings: Thenable<ExtensionSettings> | undefined,
  context: WorkspaceFolderContext | undefined,
): Promise<void> {
  clearEeDefinitionSpawnSyncTimeout();
  setFixtureAnsibleCollectionPathEnv();
  if (docSettings && context) {
    await disableExecutionEnvironmentSettings(docSettings, context);
  }
}

function skipIfEeDefinitionUnavailable(ctx: { skip: () => void }): void {
  if (eeDefinitionReady === false) {
    ctx.skip();
  }
}

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

    describe("@ee", function () {
      beforeAll(async () => {
        await prepareEeDefinitionContext(docSettings, context);
      }, EE_DEFINITION_SETUP_HOOK_TIMEOUT_MS);
      beforeEach(skipIfEeDefinitionUnavailable);
      afterAll(async () => {
        await teardownEeDefinitionContext(docSettings, context);
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

    it("does not report templated references as unresolved", async function () {
      const doc = getDoc(playbook);
      const onUnresolvedReference = vi.fn();
      await getDefinition(
        doc,
        { line: 21, character: 18 },
        docsLibrary,
        [],
        onUnresolvedReference,
      );

      expect(onUnresolvedReference).not.toHaveBeenCalled();
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
      {
        name: "copy with remote_src enabled through task args",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.copy:\n        src: static.txt\n        dest: /tmp/x\n      args:\n        remote_src: true\n",
        reference: "static.txt",
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
      {
        name: "copy source provided through task args",
        text: "- hosts: localhost\n  tasks:\n    - ansible.builtin.copy:\n        dest: /tmp/x\n      args:\n        src: static.txt\n",
        reference: "static.txt",
        expected: "definition/file_reference/files/static.txt",
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
      { value: '"0"', resolves: true },
      { value: '"1"', resolves: false },
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

    it.each([
      { value: "0", resolves: true },
      { value: "1", resolves: false },
    ])(
      "handles numeric remote_src $value",
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

    it("gives module options precedence over task args", async function () {
      const text = `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: static.txt
        dest: /tmp/x
        remote_src: false
      args:
        remote_src: true
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

      expect(result).toHaveLength(1);
    });

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

    describe("path safety", function () {
      const defAt = async (
        text: string,
        reference: string,
        offset = 0,
        onUnresolvedReference?: (reference: string) => void,
      ) => {
        const doc = TextDocument.create(
          URI.file(resolveDocUri(playbook)).toString(),
          "ansible",
          1,
          text,
        );
        return getDefinition(
          doc,
          doc.positionAt(text.indexOf(reference) + offset),
          docsLibrary,
          [],
          onUnresolvedReference,
        );
      };

      const fsPathOf = (
        result: Awaited<ReturnType<typeof getDefinition>>,
      ): string | undefined => {
        const target = result?.[0]?.targetUri;
        return target ? URI.parse(target).fsPath.toLowerCase() : undefined;
      };

      it.each([
        "../../../../../../../../etc/passwd",
        "../../../../../../../../../../Windows/win.ini",
        "/etc/passwd",
      ])(
        "does not resolve %s outside the allowed roots",
        async (ref: string) => {
          const text = `- hosts: localhost
  tasks:
    - ansible.builtin.template:
        src: ${ref}
        dest: /tmp/x
`;
          expect(await defAt(text, ref)).toBeNull();
        },
      );

      it("does not expand ~ to the home directory", async function () {
        const text = `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: ~/
        dest: /tmp/x
`;
        expect(await defAt(text, "~/")).toBeNull();
      });

      it("resolves an absolute path that is inside an allowed root", async function () {
        const abs = path.join(
          resolveDocUri("definition/file_reference"),
          "files",
          "static.txt",
        );
        const text = `- hosts: localhost
  tasks:
    - ansible.builtin.copy:
        src: '${abs}'
        dest: /tmp/x
`;
        const result = await defAt(text, abs);
        expect(result).toHaveLength(1);
        expect(fsPathOf(result)).toBe(abs.toLowerCase());
      });

      it("resolves include_vars dir to a directory", async function () {
        const text = `- hosts: localhost
  tasks:
    - ansible.builtin.include_vars:
        dir: files/directory
`;
        const result = await defAt(text, "files/directory");
        expect(result).toHaveLength(1);
        expect(fsPathOf(result)).toBe(
          resolveDocUri(
            "definition/file_reference/files/directory",
          ).toLowerCase(),
        );
      });

      it("resolves a reference that is the root itself", async function () {
        const text = `- hosts: localhost
  tasks:
    - ansible.builtin.include_vars:
        dir: .
`;
        const result = await defAt(text, "dir: .", 5);
        expect(result).toHaveLength(1);
        expect(fsPathOf(result)).toBe(
          resolveDocUri("definition/file_reference").toLowerCase(),
        );
      });
    });
  });
});
