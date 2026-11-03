import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent } from "vscode-languageserver";
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
import { doHover } from "@src/providers/hoverProvider.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";

// Interleaved @ee/@noee suites used to enable+disable EE (and clear
// docsLibrary) for every describe. Linux CI then timed out on the next
// suite's first `it` waiting for initialize(). Enable once, reuse cache.
let eeHoverReady: boolean | undefined;

const EE_PROBE_BUDGET_MS = 60_000;
const EE_PROBE_INTERVAL_MS = 3_000;
const EE_PROBE_ATTEMPT_TIMEOUT_MS = 30_000;
const EE_PROBE_TIMEOUT_MSG = "EE probe: docsLibrary exceeded attempt timeout";
const EE_SPAWN_SYNC_TIMEOUT_ENV = "ANSIBLE_LS_SPAWN_SYNC_TIMEOUT_MS";
const EE_HOVER_SETUP_HOOK_TIMEOUT_MS = EE_PROBE_BUDGET_MS * 3 + 15_000;

type EeHoverContextPair = [
  Thenable<ExtensionSettings> | undefined,
  WorkspaceFolderContext | undefined,
];

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

function setEeHoverSpawnSyncTimeout(): void {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = String(EE_PROBE_ATTEMPT_TIMEOUT_MS);
}

function clearEeHoverSpawnSyncTimeout(): void {
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
    `[hover-ee] EE docsLibrary not ready within ` +
      `${EE_PROBE_BUDGET_MS / 1000}s — @ee hover tests will skip`,
  );
  return false;
}

function uniqueEeHoverContexts(
  pairs: EeHoverContextPair[],
): Array<[Thenable<ExtensionSettings>, WorkspaceFolderContext]> {
  const seen = new Set<WorkspaceFolderContext>();
  const unique: Array<[Thenable<ExtensionSettings>, WorkspaceFolderContext]> =
    [];
  for (const [settings, context] of pairs) {
    if (!settings || !context || seen.has(context)) {
      continue;
    }
    seen.add(context);
    unique.push([settings, context]);
  }
  return unique;
}

async function prepareAllEeHoverContexts(
  pairs: EeHoverContextPair[],
): Promise<void> {
  if (skipEE()) {
    eeHoverReady = false;
    return;
  }
  setEeHoverSpawnSyncTimeout();
  setEeFixtureAnsibleCollectionPathEnv();
  const unique = uniqueEeHoverContexts(pairs);
  for (const [settings, context] of unique) {
    await enableExecutionEnvironmentSettings(settings, context);
  }
  for (const [, context] of unique) {
    if (!(await warmEeDocsLibrary(context))) {
      eeHoverReady = false;
      return;
    }
  }
  eeHoverReady = true;
}

async function teardownAllEeHoverContexts(
  pairs: EeHoverContextPair[],
): Promise<void> {
  clearEeHoverSpawnSyncTimeout();
  setFixtureAnsibleCollectionPathEnv();
  for (const [settings, context] of uniqueEeHoverContexts(pairs)) {
    await disableExecutionEnvironmentSettings(settings, context);
  }
}

function skipIfEeHoverUnavailable(ctx: { skip: () => void }): void {
  if (eeHoverReady === false) {
    ctx.skip();
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
        await context.docsLibrary,
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
        await context.docsLibrary,
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
        await context.docsLibrary,
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
        await context.docsLibrary,
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
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        await context.docsLibrary,
      );
      expect(get_hover_value(actualHover)).toContain(doc);
    });
  });
}

function testNoHover(context: WorkspaceFolderContext, textDoc: TextDocument) {
  it("should not provide hovering for values", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 13, character: 24 },
      await context.docsLibrary,
    );
    expect(actualHover).toBeNull();
  });

  it("should not provide hovering for improper module name and options", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 13, character: 8 },
      await context.docsLibrary,
    );
    expect(actualHover).toBeNull();
  });

  it("should not provide hovering for improper module option", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 14, character: 10 },
      await context.docsLibrary,
    );
    expect(actualHover).toBeNull();
  });
}

function testPlaybookAdjacentCollection(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
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
    it(`should provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        await context.docsLibrary,
      );
      expect(get_hover_value(actualHover)).toContain(doc);
    });
  });
}

function testNonPlaybookAdjacentCollection(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
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
    it(`should not provide hovering for '${word}'`, async function () {
      const actualHover = await doHover(
        textDoc,
        position,
        await context.docsLibrary,
      );

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

  const roleFixturePath = "hover/roles.yml";
  const roleFixtureUri = resolveDocUri(roleFixturePath);
  const roleContext = workspaceManager.getContext(roleFixtureUri);
  const roleTextDoc = getDoc(roleFixturePath);
  const roleDocSettings = roleContext?.documentSettings.get(roleTextDoc.uri);

  const moduleFixturePath = "hover/tasks.yml";
  const moduleFixtureUri = resolveDocUri(moduleFixturePath);
  const moduleContext = workspaceManager.getContext(moduleFixtureUri);
  const moduleTextDoc = getDoc(moduleFixturePath);
  const moduleDocSettings = moduleContext?.documentSettings.get(
    moduleTextDoc.uri,
  );

  const pacFixturePath = "playbook_adjacent_collection/playbook.yml";
  const pacFixtureUri = resolveDocUri(pacFixturePath);
  const pacContext = workspaceManager.getContext(pacFixtureUri);
  const pacTextDoc = getDoc(pacFixturePath);
  const pacDocSettings = pacContext?.documentSettings.get(pacTextDoc.uri);

  const nonAdjacentFixturePath =
    "playbook_adjacent_collection/non_adjacent_playbooks/playbook2.yml";
  const nonAdjacentFixtureUri = resolveDocUri(nonAdjacentFixturePath);
  const nonAdjacentContext = workspaceManager.getContext(nonAdjacentFixtureUri);
  const nonAdjacentTextDoc = getDoc(nonAdjacentFixturePath);
  const nonAdjacentDocSettings = nonAdjacentContext?.documentSettings.get(
    nonAdjacentTextDoc.uri,
  );

  const eeHoverContexts: EeHoverContextPair[] = [
    [docSettings, context],
    [roleDocSettings, roleContext],
    [moduleDocSettings, moduleContext],
    [pacDocSettings, pacContext],
    [nonAdjacentDocSettings, nonAdjacentContext],
  ];

  describe("@noee", function () {
    beforeAll(async () => {
      setFixtureAnsibleCollectionPathEnv();
      for (const [settings, folderContext] of uniqueEeHoverContexts(
        eeHoverContexts,
      )) {
        await disableExecutionEnvironmentSettings(settings, folderContext);
      }
    });

    describe("Play keywords hover", function () {
      if (context) {
        testPlayKeywords(context, textDoc);
      }
    });

    describe("Task keywords hover", function () {
      if (context) {
        testTaskKeywords(context, textDoc);
      }
    });

    describe("Block keywords hover", function () {
      if (context) {
        testBlockKeywords(context, textDoc);
      }
    });

    describe("Role keywords hover", function () {
      if (roleContext) {
        testRoleKeywords(roleContext, roleTextDoc);
      }
    });

    describe("Module name and options hover", function () {
      if (moduleContext) {
        testModuleNames(moduleContext, moduleTextDoc);
      }
    });

    describe("No hover", function () {
      if (moduleContext) {
        testNoHover(moduleContext, moduleTextDoc);
      }
    });

    describe("Hover for playbook adjacent collection", function () {
      if (pacContext) {
        testPlaybookAdjacentCollection(pacContext, pacTextDoc);
      }
    });

    describe("Negate hover for non playbook adjacent collection", function () {
      if (nonAdjacentContext) {
        testNonPlaybookAdjacentCollection(
          nonAdjacentContext,
          nonAdjacentTextDoc,
        );
      }
    });
  });

  describe("@ee", function () {
    beforeAll(async () => {
      await prepareAllEeHoverContexts(eeHoverContexts);
    }, EE_HOVER_SETUP_HOOK_TIMEOUT_MS);
    beforeEach(skipIfEeHoverUnavailable);
    afterAll(async () => {
      await teardownAllEeHoverContexts(eeHoverContexts);
    });

    describe("Play keywords hover", function () {
      if (context) {
        testPlayKeywords(context, textDoc);
      }
    });

    describe("Task keywords hover", function () {
      if (context) {
        testTaskKeywords(context, textDoc);
      }
    });

    describe("Block keywords hover", function () {
      if (context) {
        testBlockKeywords(context, textDoc);
      }
    });

    describe("Role keywords hover", function () {
      if (roleContext) {
        testRoleKeywords(roleContext, roleTextDoc);
      }
    });

    describe("Module name and options hover", function () {
      if (moduleContext) {
        testModuleNames(moduleContext, moduleTextDoc);
      }
    });

    describe("No hover", function () {
      if (moduleContext) {
        testNoHover(moduleContext, moduleTextDoc);
      }
    });

    describe("Hover for playbook adjacent collection", function () {
      if (pacContext) {
        testPlaybookAdjacentCollection(pacContext, pacTextDoc);
      }
    });

    describe("Negate hover for non playbook adjacent collection", function () {
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
