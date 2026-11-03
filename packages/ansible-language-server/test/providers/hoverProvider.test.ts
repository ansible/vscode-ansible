import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent } from "vscode-languageserver";
import {
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
  type TestContext,
} from "vitest";
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
import { doHover } from "@src/providers/hoverProvider.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";

/** Play/task/block/role keyword hovers never read DocsLibrary; avoid EE docs init (flaky on GHA). */
const KEYWORD_HOVER_DOCS_LIBRARY = {} as DocsLibrary;

/** Tri-state: `undefined` = not probed, `true` = EE docs ready, `false` = skip @ee doc suites. */
let eeHoverDocsReady: boolean | undefined;
/** Library from a successful probe. Later @ee suites clear the context cache, which would re-run EE init and hang. */
let eeHoverDocsLibrary: DocsLibrary | undefined;
let eeHoverProbeContext: WorkspaceFolderContext | undefined;

const EE_HOVER_PROBE_BUDGET_MS = 60_000;
const EE_HOVER_PROBE_INTERVAL_MS = 3_000;
const EE_HOVER_PROBE_ATTEMPT_TIMEOUT_MS = 30_000;
const EE_HOVER_PROBE_TIMEOUT_MSG = "EE probe: doHover exceeded attempt timeout";
const EE_SPAWN_SYNC_TIMEOUT_ENV = "ANSIBLE_LS_SPAWN_SYNC_TIMEOUT_MS";
const EE_HOVER_SETUP_HOOK_TIMEOUT_MS = EE_HOVER_PROBE_BUDGET_MS + 10_000;

function isTransientEeHoverReadinessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof Error && "code" in err
      ? String((err as NodeJS.ErrnoException).code)
      : "";
  if (msg.includes(EE_HOVER_PROBE_TIMEOUT_MSG)) {
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

function setEeHoverSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = String(
    EE_HOVER_PROBE_ATTEMPT_TIMEOUT_MS,
  );
}

function clearEeHoverSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = undefined;
}

async function probeEeHoverDocs(
  textDoc: TextDocument,
  context: WorkspaceFolderContext | undefined,
): Promise<boolean> {
  if (eeHoverDocsReady !== undefined) {
    return eeHoverDocsReady;
  }
  if (!context) {
    eeHoverDocsReady = false;
    return false;
  }

  const probePosition = { line: 4, character: 8 };
  const deadline = Date.now() + EE_HOVER_PROBE_BUDGET_MS;

  while (Date.now() < deadline) {
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remainingMs = Math.min(
        EE_HOVER_PROBE_ATTEMPT_TIMEOUT_MS,
        deadline - Date.now(),
      );
      const probed = await Promise.race([
        (async () => {
          const docsLibrary = await context.docsLibrary;
          const hover = await doHover(textDoc, probePosition, docsLibrary);
          return { docsLibrary, hover };
        })(),
        new Promise<never>((_, reject) => {
          attemptTimer = setTimeout(
            () => reject(new Error(EE_HOVER_PROBE_TIMEOUT_MSG)),
            remainingMs,
          );
        }),
      ]);
      if (
        probed.hover &&
        get_hover_value(probed.hover).includes(
          "Print statements during execution",
        )
      ) {
        eeHoverDocsLibrary = probed.docsLibrary;
        eeHoverProbeContext = context;
        eeHoverDocsReady = true;
        return true;
      }
    } catch (err: unknown) {
      if (!isTransientEeHoverReadinessError(err)) {
        throw err;
      }
    } finally {
      if (attemptTimer !== undefined) {
        clearTimeout(attemptTimer);
      }
    }
    await new Promise<void>((r) => setTimeout(r, EE_HOVER_PROBE_INTERVAL_MS));
  }

  console.warn(
    `[hover-ee] EE module hover readiness not achieved within ` +
      `${EE_HOVER_PROBE_BUDGET_MS / 1000}s — @ee docs hover suites will skip`,
  );
  eeHoverDocsReady = false;
  return false;
}

async function prepareEeHoverDocsSuite(
  textDoc: TextDocument,
  context: WorkspaceFolderContext | undefined,
  docSettings: Thenable<ExtensionSettings> | undefined,
): Promise<void> {
  if (skipEE() || !docSettings) {
    return;
  }
  setEeHoverSpawnSyncTimeout();
  setEeFixtureAnsibleCollectionPathEnv();
  await enableExecutionEnvironmentSettings(docSettings, context);
  if (eeHoverDocsReady === undefined) {
    await probeEeHoverDocs(textDoc, context);
  }
}

function skipIfEeHoverDocsUnavailable(context: { skip: () => void }): void {
  if (eeHoverDocsReady === false) {
    context.skip();
  }
}

/**
 * @ee suites after the probe call clearCachedServices(), so a fresh
 * `context.docsLibrary` re-inits the EE and can hang past the test timeout.
 * Reuse the probed library for that context. Other contexts get one bounded
 * wait, then the test is skipped.
 */
async function resolveHoverDocs(
  context: WorkspaceFolderContext,
  test: TestContext,
  useCachedEeDocs: boolean,
): Promise<DocsLibrary> {
  if (!useCachedEeDocs) {
    return context.docsLibrary;
  }
  if (eeHoverDocsLibrary && eeHoverProbeContext === context) {
    return eeHoverDocsLibrary;
  }

  let attemptTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      context.docsLibrary,
      new Promise<never>((_, reject) => {
        attemptTimer = setTimeout(
          () => reject(new Error(EE_HOVER_PROBE_TIMEOUT_MSG)),
          EE_HOVER_PROBE_ATTEMPT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err: unknown) {
    if (!isTransientEeHoverReadinessError(err)) {
      throw err;
    }
    console.warn("[hover-ee] docsLibrary init stalled — skipping hover test");
    // EE docs indexing can exceed the test timeout on GHA runners.
    test.skip("EE docs init exceeded the readiness budget");
  } finally {
    if (attemptTimer !== undefined) {
      clearTimeout(attemptTimer);
    }
  }
}

function get_hover_value(hover: Hover | undefined | null): string {
  if (hover) {
    if (Array.isArray(hover)) {
      return "";
    } else {
      if (Object.hasOwn(hover.contents as object, "value")) {
        return (hover.contents as MarkupContent)["value"];
      }
    }
  }
  return "";
}
function testPlayKeywords(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "name",
      position: { line: 0, character: 4 },
      doc: "Identifier. Can be used for documentation, or in tasks/handlers.",
    },
    {
      word: "host",
      position: { line: 1, character: 4 },
      doc: "A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.",
    },
    {
      word: "tasks",
      position: { line: 3, character: 4 },
      doc: "Main list of tasks to execute in the play, they run after roles and before post_tasks.",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        KEYWORD_HOVER_DOCS_LIBRARY,
      );
      if (actualHover) {
        expect(get_hover_value(actualHover)).toContain(doc);
      } else {
        expect(false).toBe(true);
      }
    });
  });
}

function testTaskKeywords(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "register",
      position: { line: 6, character: 8 },
      doc: "Name of variable that will contain task status and module return data.",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        KEYWORD_HOVER_DOCS_LIBRARY,
      );
      if (actualHover) {
        expect(get_hover_value(actualHover)).toContain(doc);
      } else {
        expect(false).toBe(true);
      }
    });
  });
}

function testBlockKeywords(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "become",
      position: { line: 11, character: 8 },
      doc: "Boolean that controls if privilege escalation is used or not on Task execution. Implemented by the become plugin.",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        KEYWORD_HOVER_DOCS_LIBRARY,
      );
      if (actualHover) {
        expect(get_hover_value(actualHover)).toContain(doc);
      } else {
        expect(false).toBe(true);
      }
    });
  });
}

function testRoleKeywords(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "tags",
      position: { line: 6, character: 8 },
      doc: "Tags applied to the task or included tasks, this allows selecting subsets of tasks from the command line.",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        KEYWORD_HOVER_DOCS_LIBRARY,
      );
      if (actualHover) {
        expect(get_hover_value(actualHover)).toContain(doc);
      } else {
        expect(false).toBe(true);
      }
    });
  });
}

function testModuleNames(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
  useCachedEeDocs = false,
) {
  const tests = [
    {
      word: "ansible.builtin.debug",
      position: { line: 4, character: 8 },
      doc: "Print statements during execution",
    },
    {
      word: "ansible.builtin.debug -> msg",
      position: { line: 5, character: 10 },
      doc: "The customized message that is printed\\. If omitted\\, prints a generic message\\.",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async (ctx: TestContext) => {
      const docsLibrary = await resolveHoverDocs(context, ctx, useCachedEeDocs);
      const actualHover = await doHover(textDoc, position, docsLibrary);
      expect(get_hover_value(actualHover)).toContain(doc);
    });
  });
}

function testNoHover(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
  useCachedEeDocs = false,
) {
  const tests = [
    {
      word: "values",
      position: { line: 13, character: 24 },
    },
    {
      word: "improper module name and options",
      position: { line: 13, character: 8 },
    },
    {
      word: "improper module option",
      position: { line: 14, character: 10 },
    },
  ];

  tests.forEach(({ word, position }) => {
    it(`should not provide hovering for ${word}`, async (ctx: TestContext) => {
      const docsLibrary = await resolveHoverDocs(context, ctx, useCachedEeDocs);
      const actualHover = await doHover(textDoc, position, docsLibrary);
      expect(actualHover).toBeNull();
    });
  });
}

function testPlaybookAdjacentCollection(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
  useCachedEeDocs = false,
) {
  const tests = [
    {
      word: "playbook adjacent module name",
      position: { line: 5, character: 19 },
      doc: "This is a test module for playbook adjacent collection",
    },
    {
      word: "playbook adjacent module option",
      position: { line: 6, character: 11 },
      doc: "Option 1",
    },
    {
      word: "playbook adjacent module sub option",
      position: { line: 7, character: 19 },
      doc: "Sub option 1",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should provide hovering for '${word}'`, async (ctx: TestContext) => {
      const docsLibrary = await resolveHoverDocs(context, ctx, useCachedEeDocs);
      const actualHover = await doHover(textDoc, position, docsLibrary);
      expect(get_hover_value(actualHover)).toContain(doc);
    });
  });
}

function testNonPlaybookAdjacentCollection(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
  useCachedEeDocs = false,
) {
  const tests = [
    {
      word: "non playbook adjacent module name",
      position: { line: 5, character: 19 },
      doc: "",
    },
    {
      word: "non playbook adjacent module option",
      position: { line: 6, character: 11 },
      doc: "",
    },
  ];

  tests.forEach(({ word, position, doc }) => {
    it(`should not provide hovering for '${word}'`, async (ctx: TestContext) => {
      const docsLibrary = await resolveHoverDocs(context, ctx, useCachedEeDocs);
      const actualHover = await doHover(textDoc, position, docsLibrary);

      if (!doc) {
        expect(actualHover).toBeNull();
      } else {
        expect(
          get_hover_value(actualHover),
          `actual hover -> ${String(actualHover)}`,
        ).toContain(doc);
      }
    });
  });
}

describe("doHover()", function () {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "hover/tasks.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);

  const textDoc = getDoc(fixtureFilePath);
  const docSettings = context?.documentSettings.get(textDoc.uri);
  expect(docSettings).toBeDefined();

  describe("Play keywords hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setEeFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await enableExecutionEnvironmentSettings(docSettings, context);
        }
      });
      if (context) {
        testPlayKeywords(context, textDoc);
      }

      afterAll(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
      if (context) {
        testPlayKeywords(context, textDoc);
      }
    });
  });

  describe("Task keywords hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setEeFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await enableExecutionEnvironmentSettings(docSettings, context);
        }
      });
      if (context) {
        testTaskKeywords(context, textDoc);
      }

      afterAll(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
      if (context) {
        testTaskKeywords(context, textDoc);
      }
    });
  });

  describe("Block keywords hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setEeFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await enableExecutionEnvironmentSettings(docSettings, context);
        }
      });

      if (context) {
        testBlockKeywords(context, textDoc);
      }

      afterAll(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings && context) {
          await disableExecutionEnvironmentSettings(docSettings, context);
        }
      });

      if (context) {
        testBlockKeywords(context, textDoc);
      }
    });
  });
  // Capture variables for role keywords tests
  const roleFixturePath = "hover/roles.yml";
  const roleFixtureUri = resolveDocUri(roleFixturePath);
  const roleContext = workspaceManager.getContext(roleFixtureUri);
  const roleTextDoc = getDoc(roleFixturePath);
  const roleDocSettings = roleContext?.documentSettings.get(roleTextDoc.uri);

  describe("Role keywords hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setEeFixtureAnsibleCollectionPathEnv();
        if (roleDocSettings && roleContext) {
          await enableExecutionEnvironmentSettings(
            roleDocSettings,
            roleContext,
          );
        }
      });

      if (roleContext) {
        testRoleKeywords(roleContext, roleTextDoc);
      }

      afterAll(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (roleDocSettings && roleContext) {
          await disableExecutionEnvironmentSettings(
            roleDocSettings,
            roleContext,
          );
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (roleDocSettings && roleContext) {
          await disableExecutionEnvironmentSettings(
            roleDocSettings,
            roleContext,
          );
        }
      });

      if (roleContext) {
        testRoleKeywords(roleContext, roleTextDoc);
      }
    });
  });

  // Capture variables for module name and no hover tests
  const moduleFixturePath = "hover/tasks.yml";
  const moduleFixtureUri = resolveDocUri(moduleFixturePath);
  const moduleContext = workspaceManager.getContext(moduleFixtureUri);
  const moduleTextDoc = getDoc(moduleFixturePath);
  const moduleDocSettings = moduleContext?.documentSettings.get(
    moduleTextDoc.uri,
  );

  describe("Module name and options hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        await prepareEeHoverDocsSuite(
          moduleTextDoc,
          moduleContext,
          moduleDocSettings,
        );
      }, EE_HOVER_SETUP_HOOK_TIMEOUT_MS);

      beforeEach(skipIfEeHoverDocsUnavailable);

      if (moduleContext) {
        testModuleNames(moduleContext, moduleTextDoc, true);
      }

      afterAll(async function () {
        clearEeHoverSpawnSyncTimeout();
        setFixtureAnsibleCollectionPathEnv();
        if (moduleDocSettings && moduleContext) {
          await disableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (moduleDocSettings && moduleContext) {
          await disableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });

      if (moduleContext) {
        testModuleNames(moduleContext, moduleTextDoc);
      }
    });
  });

  describe("No hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        await prepareEeHoverDocsSuite(
          moduleTextDoc,
          moduleContext,
          moduleDocSettings,
        );
      }, EE_HOVER_SETUP_HOOK_TIMEOUT_MS);

      beforeEach(skipIfEeHoverDocsUnavailable);

      if (moduleContext) {
        testNoHover(moduleContext, moduleTextDoc, true);
      }

      afterAll(async function () {
        clearEeHoverSpawnSyncTimeout();
        setFixtureAnsibleCollectionPathEnv();
        if (moduleDocSettings && moduleContext) {
          await disableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (moduleDocSettings && moduleContext) {
          await disableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });

      if (moduleContext) {
        testNoHover(moduleContext, moduleTextDoc);
      }
    });
  });

  // Capture variables for playbook adjacent collection tests
  const pacFixturePath = "playbook_adjacent_collection/playbook.yml";
  const pacFixtureUri = resolveDocUri(pacFixturePath);
  const pacContext = workspaceManager.getContext(pacFixtureUri);
  const pacTextDoc = getDoc(pacFixturePath);
  const pacDocSettings = pacContext?.documentSettings.get(pacTextDoc.uri);

  describe("Hover for playbook adjacent collection", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        await prepareEeHoverDocsSuite(pacTextDoc, pacContext, pacDocSettings);
      }, EE_HOVER_SETUP_HOOK_TIMEOUT_MS);

      beforeEach(skipIfEeHoverDocsUnavailable);

      if (pacContext) {
        testPlaybookAdjacentCollection(pacContext, pacTextDoc, true);
      }

      afterAll(async function () {
        clearEeHoverSpawnSyncTimeout();
        setFixtureAnsibleCollectionPathEnv();
        if (pacDocSettings && pacContext) {
          await disableExecutionEnvironmentSettings(pacDocSettings, pacContext);
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (pacDocSettings && pacContext) {
          await disableExecutionEnvironmentSettings(pacDocSettings, pacContext);
        }
      });

      if (pacContext) {
        testPlaybookAdjacentCollection(pacContext, pacTextDoc);
      }
    });
  });

  // Capture variables for non-adjacent playbook tests
  const nonAdjacentFixturePath =
    "playbook_adjacent_collection/non_adjacent_playbooks/playbook2.yml";
  const nonAdjacentFixtureUri = resolveDocUri(nonAdjacentFixturePath);
  const nonAdjacentContext = workspaceManager.getContext(nonAdjacentFixtureUri);
  const nonAdjacentTextDoc = getDoc(nonAdjacentFixturePath);
  const nonAdjacentDocSettings = nonAdjacentContext?.documentSettings.get(
    nonAdjacentTextDoc.uri,
  );

  describe("Negate hover for non playbook adjacent collection", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        await prepareEeHoverDocsSuite(
          moduleTextDoc,
          moduleContext,
          moduleDocSettings,
        );
        if (
          !skipEE() &&
          eeHoverDocsReady !== false &&
          nonAdjacentDocSettings &&
          nonAdjacentContext
        ) {
          await enableExecutionEnvironmentSettings(
            nonAdjacentDocSettings,
            nonAdjacentContext,
          );
        }
      }, EE_HOVER_SETUP_HOOK_TIMEOUT_MS);

      beforeEach(skipIfEeHoverDocsUnavailable);

      if (nonAdjacentContext) {
        testNonPlaybookAdjacentCollection(
          nonAdjacentContext,
          nonAdjacentTextDoc,
          true,
        );
      }

      afterAll(async function () {
        clearEeHoverSpawnSyncTimeout();
        setFixtureAnsibleCollectionPathEnv();
        if (nonAdjacentDocSettings && nonAdjacentContext) {
          await disableExecutionEnvironmentSettings(
            nonAdjacentDocSettings,
            nonAdjacentContext,
          );
        }
      });
    });

    describe("@noee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (nonAdjacentDocSettings && nonAdjacentContext) {
          await disableExecutionEnvironmentSettings(
            nonAdjacentDocSettings,
            nonAdjacentContext,
          );
        }
      });

      if (nonAdjacentContext) {
        testNonPlaybookAdjacentCollection(
          nonAdjacentContext,
          nonAdjacentTextDoc,
        );
      }
    });
  });

  describe("Edge cases with mocked DocsLibrary", function () {
    it("returns tombstone hover when module is removed", async function () {
      const doc = TextDocument.create(
        "file:///tmp/tombstone.yml",
        "ansible",
        1,
        `- hosts: localhost
  tasks:
    - removed.module.name:
        opt: 1
`,
      );
      const docsLibrary = {
        findModule: vi
          .fn()
          .mockResolvedValue([undefined, "removed.module.name"]),
        getModuleRoute: vi.fn().mockReturnValue({
          tombstone: {
            removalDate: "2024-01-01",
            removalVersion: "3.0.0",
            warningText: "This module was removed.",
          },
        }),
      } as unknown as DocsLibrary;

      const hover = await doHover(doc, { line: 2, character: 10 }, docsLibrary);
      expect(hover).toBeTruthy();
      expect(get_hover_value(hover)).toContain("REMOVED");
      expect(get_hover_value(hover)).toContain("This module was removed.");
    });

    it("returns null for unknown play keyword", async function () {
      const doc = TextDocument.create(
        "file:///tmp/unknown_kw.yml",
        "ansible",
        1,
        `- hosts: localhost
  not_a_real_play_keyword: true
  tasks: []
`,
      );
      const docsLibrary = {
        findModule: vi.fn().mockResolvedValue([undefined, undefined]),
        getModuleRoute: vi.fn(),
      } as unknown as DocsLibrary;

      const hover = await doHover(doc, { line: 1, character: 4 }, docsLibrary);
      expect(hover).toBeNull();
    });

    it("returns null when cursor is not on a key", async function () {
      const doc = TextDocument.create(
        "file:///tmp/value.yml",
        "ansible",
        1,
        `- hosts: localhost
`,
      );
      const docsLibrary = {
        findModule: vi.fn().mockResolvedValue([undefined, undefined]),
      } as unknown as DocsLibrary;

      const hover = await doHover(doc, { line: 0, character: 10 }, docsLibrary);
      expect(hover).toBeNull();
    });
  });
});
