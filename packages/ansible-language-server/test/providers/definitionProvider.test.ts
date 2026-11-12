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
import { fileExists } from "@src/utils/misc.js";
import { URI } from "vscode-uri";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";

// Run @noee before @ee so disabling EE does not leave docsLibrary init hung on CI.
let eeDefinitionReady: boolean | undefined;

const EE_PROBE_BUDGET_MS = 60_000;
const EE_PROBE_INTERVAL_MS = 3_000;
const EE_PROBE_ATTEMPT_TIMEOUT_MS = 30_000;
const EE_PROBE_TIMEOUT_MSG = "EE probe: docsLibrary exceeded attempt timeout";
const EE_SPAWN_SYNC_TIMEOUT_ENV = "ANSIBLE_LS_SPAWN_SYNC_TIMEOUT_MS";
const EE_DEFINITION_SETUP_HOOK_TIMEOUT_MS = EE_PROBE_BUDGET_MS + 15_000;

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
}

function clearEeDefinitionSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = undefined;
}

async function warmEeDocsLibrary(
  context: WorkspaceFolderContext,
): Promise<boolean> {
  const deadline = Date.now() + EE_PROBE_BUDGET_MS;
  while (Date.now() < deadline) {
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remainingMs = Math.min(
        EE_PROBE_ATTEMPT_TIMEOUT_MS,
        deadline - Date.now(),
      );
      await Promise.race([
        context.docsLibrary,
        new Promise<never>((_, reject) => {
          attemptTimer = setTimeout(
            () => reject(new Error(EE_PROBE_TIMEOUT_MSG)),
            remainingMs,
          );
        }),
      ]);
      return true;
    } catch (err: unknown) {
      if (!isTransientEeReadinessError(err)) {
        throw err;
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
});
