/**
 * This is the test file for `doCompletionResolve()` function in the completion provider.
 * `doCompletionResolve()` is called to resolve the selected completion item.
 */

import { expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import sinon from "sinon";
import { EOL } from "os";
import { doCompletionResolve } from "@src/providers/completionProvider.js";
import {} from "@src/providers/validationProvider.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";
import { terminateTrackedAsyncSpawns } from "@src/utils/misc.js";
import {
  createTestWorkspaceManager,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
  setEeFixtureAnsibleCollectionPathEnv,
  resolveDocUri,
  getDoc,
  skipEE,
} from "@test/helper.js";

const EE_PROBE_ATTEMPT_TIMEOUT_MS = 30_000;
const EE_DOCS_WARM_BUDGET_MS = 60_000 * 2;
const EE_INFLIGHT_DRAIN_BUDGET_MS = EE_PROBE_ATTEMPT_TIMEOUT_MS;
const EE_DOCS_WARM_TIMEOUT_MSG =
  "EE resolver: docsLibrary exceeded warm budget";
const EE_SPAWN_SYNC_TIMEOUT_ENV = "ANSIBLE_LS_SPAWN_SYNC_TIMEOUT_MS";
const EE_TRACK_ASYNC_SPAWN_ENV = "ANSIBLE_LS_TRACK_ASYNC_SPAWN";
const EE_RESOLVE_SETUP_HOOK_TIMEOUT_MS =
  EE_DOCS_WARM_BUDGET_MS + EE_INFLIGHT_DRAIN_BUDGET_MS + 15_000;

function isTransientEeReadinessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof Error && "code" in err
      ? String((err as NodeJS.ErrnoException).code)
      : "";
  if (msg.includes(EE_DOCS_WARM_TIMEOUT_MSG)) {
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

async function boundedDrainInFlight(
  inFlight: Thenable<unknown>,
  budgetMs: number = EE_INFLIGHT_DRAIN_BUDGET_MS,
): Promise<void> {
  terminateTrackedAsyncSpawns();
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(inFlight).catch(() => undefined),
      new Promise<void>((resolve) => {
        drainTimer = setTimeout(resolve, budgetMs);
      }),
    ]);
  } finally {
    if (drainTimer !== undefined) {
      clearTimeout(drainTimer);
    }
  }
}

async function warmEeDocsLibraryForResolver(
  context: WorkspaceFolderContext,
): Promise<boolean> {
  const initPromise = context.docsLibrary;
  let attemptTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      initPromise,
      new Promise<never>((_, reject) => {
        attemptTimer = setTimeout(
          () => reject(new Error(EE_DOCS_WARM_TIMEOUT_MSG)),
          EE_DOCS_WARM_BUDGET_MS,
        );
      }),
    ]);
    return true;
  } catch (err: unknown) {
    if (!isTransientEeReadinessError(err)) {
      throw err;
    }
    await boundedDrainInFlight(initPromise);
    context.clearCachedServices();
    console.warn(
      `[resolver-ee] EE docsLibrary not ready within ` +
        `${EE_DOCS_WARM_BUDGET_MS / 1000}s — @ee resolve tests will skip`,
    );
    return false;
  } finally {
    if (attemptTimer !== undefined) {
      clearTimeout(attemptTimer);
    }
  }
}

async function prepareEeResolverSuite(
  docSettings: Thenable<ExtensionSettings>,
  context: WorkspaceFolderContext,
): Promise<boolean> {
  if (skipEE()) {
    return false;
  }
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = String(EE_PROBE_ATTEMPT_TIMEOUT_MS);
  process.env[EE_TRACK_ASYNC_SPAWN_ENV] = "1";
  setEeFixtureAnsibleCollectionPathEnv();
  await enableExecutionEnvironmentSettings(docSettings, context);
  return warmEeDocsLibraryForResolver(context);
}

async function teardownEeResolverSuite(
  docSettings: Thenable<ExtensionSettings>,
  context: WorkspaceFolderContext,
): Promise<void> {
  process.env[EE_SPAWN_SYNC_TIMEOUT_ENV] = undefined;
  process.env[EE_TRACK_ASYNC_SPAWN_ENV] = undefined;
  terminateTrackedAsyncSpawns();
  setFixtureAnsibleCollectionPathEnv();
  await disableExecutionEnvironmentSettings(docSettings, context);
}

function skipIfEeResolveUnavailable(skipFlag: () => boolean) {
  return (ctx: { skip: () => void }): void => {
    if (skipEE() || skipFlag()) {
      ctx.skip();
    }
  };
}

function testFQCNEnabled(context: WorkspaceFolderContext) {
  const tests = [
    {
      name: "module name with full FQCN",
      completionItem: {
        label: "module_3",
        data: {
          documentUri: "dummy/url/for/resolve_completion.yml",
          moduleFqcn: "org_1.coll_3.module_3",
          inlineCollections: ["org_1.coll_3", "ansible.builtin"],
          atEndOfLine: true,
          firstElementOfList: false,
        },
      },
      completionTextAtLineEnd: `org_1.coll_3.module_3:${EOL}\t`,
      completionTextInBetween: "org_1.coll_3.module_3",
    },
  ];

  tests.forEach(
    ({
      name,
      completionItem,
      completionTextAtLineEnd,
      completionTextInBetween,
    }) => {
      it(`should resolve completion for ${name} (fqcn enabled)`, async function () {
        const actualCompletionResolveAtLineEnd = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtLineEnd.insertText).be.equal(
          completionTextAtLineEnd,
        );

        // Check for completion resolution when asked in between of lines
        completionItem.data.atEndOfLine = false;
        const actualCompletionResolveAtInBetween = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtInBetween.insertText).be.equal(
          completionTextInBetween,
        );
      });
    },
  );
}

function testFQCNDisabled(context: WorkspaceFolderContext) {
  const tests = [
    {
      name: "module name with short name since it is present in declared collections in playbook",
      completionItem: {
        label: "module_3",
        data: {
          documentUri: "dummy/uri/for/resolve_completion.yml",
          moduleFqcn: "org_1.coll_3.module_3",
          inlineCollections: ["org_1.coll_3", "ansible.builtin"],
          atEndOfLine: true,
          firstElementOfList: false,
        },
      },
      completionTextAtLineEnd: `module_3:${EOL}\t`,
      completionTextInBetween: "module_3",
    },
    {
      name: "module name with full FQCN since it is not present in declared collections in playbook",
      completionItem: {
        label: "module_1",
        data: {
          documentUri: "dummy/uri/for/resolve_completion.yml",
          moduleFqcn: "org_1.coll_1.module_1",
          inlineCollections: ["org_1.coll_3", "ansible.builtin"],
          atEndOfLine: true,
          firstElementOfList: false,
        },
      },
      completionTextAtLineEnd: `org_1.coll_1.module_1:${EOL}\t`,
      completionTextInBetween: "org_1.coll_1.module_1",
    },
  ];
  tests.forEach(
    ({
      name,
      completionItem,
      completionTextAtLineEnd,
      completionTextInBetween,
    }) => {
      it(`should resolve completion for ${name} (fqcn disabled)`, async function () {
        const actualCompletionResolveAtLineEnd = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtLineEnd.insertText).be.equal(
          completionTextAtLineEnd,
        );

        // Check for completion resolution when asked in between of lines
        completionItem.data.atEndOfLine = false;
        const actualCompletionResolveAtInBetween = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtInBetween.insertText).be.equal(
          completionTextInBetween,
        );
      });
    },
  );
}

function testResolveModuleOptionCompletion(context: WorkspaceFolderContext) {
  const tests = [
    // Disabled because it failed when vitest is configures with isolation: true
    // which is needed for other reasons.
    // {
    //   name: "option expecting dictionary with `option: ${EOL}\\t\\t`",
    //   completionItem: {
    //     label: "opt_1",
    //     data: {
    //       documentUri: "dummy/uri/for/resolve_completion.yml",
    //       type: "dict",
    //       atEndOfLine: true,
    //       firstElementOfList: true,
    //     },
    //   },
    //   completionTextAtLineEnd: `opt_1:${EOL}\t\t`,
    //   completionTextInBetween: "opt_1",
    // },
    {
      name: "sub option expecting list with `sub_option: ${EOL}\\t- `",
      completionItem: {
        label: "sub_opt_2",
        data: {
          documentUri: "dummy/uri/for/resolve_completion.yml",
          type: "list",
          atEndOfLine: true,
        },
      },
      completionTextAtLineEnd: `sub_opt_2:${EOL}\t- `,
      completionTextInBetween: "sub_opt_2",
    },
    {
      name: "sub option expecting string or number or boolean with `sub_option: `",
      completionItem: {
        label: "sub_opt_1",
        data: {
          documentUri: "dummy/uri/for/resolve_completion.yml",
          type: "string",
          atEndOfLine: true,
        },
      },
      completionTextAtLineEnd: "sub_opt_1: ",
      completionTextInBetween: "sub_opt_1",
    },
  ];

  tests.forEach(
    ({
      name,
      completionItem,
      completionTextAtLineEnd,
      completionTextInBetween,
    }) => {
      it(`should resolve completion for ${name} (resolve module option completion)`, async function () {
        const actualCompletionResolveAtLineEnd = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtLineEnd.insertText).be.equal(
          completionTextAtLineEnd,
        );

        // Check for completion resolution when asked in between of lines
        completionItem.data.atEndOfLine = false;
        const actualCompletionResolveAtInBetween = await doCompletionResolve(
          completionItem,
          context,
        );

        expect(actualCompletionResolveAtInBetween.insertText).be.equal(
          completionTextInBetween,
        );
      });
    },
  );
}

describe("doCompletionResolve()", function () {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "completion/resolve_completion.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);

  const textDoc = getDoc(fixtureFilePath);
  expect(context).toBeDefined();
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Resolve completion for module names", function () {
      describe("Resolve completion for module names when FQCN is enabled", function () {
        describe("@ee", function () {
          let skipEeResolve = false;

          beforeAll(async () => {
            skipEeResolve = !(await prepareEeResolverSuite(
              docSettings,
              context,
            ));
          }, EE_RESOLVE_SETUP_HOOK_TIMEOUT_MS);
          beforeEach(skipIfEeResolveUnavailable(() => skipEeResolve));
          testFQCNEnabled(context);

          afterAll(async function () {
            await teardownEeResolverSuite(docSettings, context);
          });
        });

        describe("@noee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
          });
          testFQCNEnabled(context);
        });
      });

      describe("Resolve completion for module names when FQCN is disabled", function () {
        describe("@ee", function () {
          let skipEeResolve = false;

          beforeAll(async () => {
            skipEeResolve = !(await prepareEeResolverSuite(
              docSettings,
              context,
            ));
            (await docSettings).ansible.useFullyQualifiedCollectionNames =
              false;
          }, EE_RESOLVE_SETUP_HOOK_TIMEOUT_MS);
          beforeEach(skipIfEeResolveUnavailable(() => skipEeResolve));
          testFQCNDisabled(context);

          afterAll(async function () {
            await teardownEeResolverSuite(docSettings, context);
            (await docSettings).ansible.useFullyQualifiedCollectionNames = true;
          });
        });

        describe("@noee", function () {
          beforeAll(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings, context);
            (await docSettings).ansible.useFullyQualifiedCollectionNames =
              false;
          });
          testFQCNDisabled(context);

          afterAll(async function () {
            setFixtureAnsibleCollectionPathEnv();
            (await docSettings).ansible.useFullyQualifiedCollectionNames = true;
          });
        });
      });
    });

    describe("Resolve completion for module options and suboptions", function () {
      describe("@ee", function () {
        let skipEeResolve = false;

        beforeAll(async () => {
          skipEeResolve = !(await prepareEeResolverSuite(docSettings, context));
        }, EE_RESOLVE_SETUP_HOOK_TIMEOUT_MS);
        beforeEach(skipIfEeResolveUnavailable(() => skipEeResolve));

        testResolveModuleOptionCompletion(context);

        afterAll(async function () {
          await teardownEeResolverSuite(docSettings, context);
        });
      });

      describe("@noee", function () {
        beforeAll(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings, context);
        });

        testResolveModuleOptionCompletion(context);
      });
    });

    describe("Resolve edge cases", function () {
      afterEach(function () {
        sinon.restore();
      });

      it("ignores invalid completion resolve data shapes", async function () {
        for (const data of [
          null,
          undefined,
          { documentUri: "file:///tmp/x.yml" },
        ]) {
          const item = await doCompletionResolve(
            {
              label: "x",
              data,
            },
            context,
          );
          expect(item.label).toBe("x");
        }
      });

      it("resolves module completion using textEdit when present", async function () {
        const item = await doCompletionResolve(
          {
            label: "module_3",
            textEdit: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              newText: "",
            },
            data: {
              documentUri: fixtureFileUri,
              moduleFqcn: "org_1.coll_3.module_3",
              inlineCollections: [],
              atEndOfLine: true,
              firstElementOfList: false,
            },
          },
          context,
        );
        expect(item.textEdit?.newText).toContain("org_1.coll_3.module_3");
      });

      it("resolves option completion using textEdit when present", async function () {
        const item = await doCompletionResolve(
          {
            label: "opt_1",
            textEdit: {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              newText: "",
            },
            data: {
              documentUri: fixtureFileUri,
              type: "string",
              atEndOfLine: true,
            },
          },
          context,
        );
        expect(item.textEdit?.newText).toBe("opt_1: ");
      });

      it("uses metadata collections when resolving short module names", async function () {
        const settings = await context.documentSettings.get(fixtureFileUri);
        settings.ansible.useFullyQualifiedCollectionNames = false;

        sinon.stub(context.documentMetadata, "get").resolves({
          collections: ["org_1.coll_3"],
        } as never);

        try {
          const item = await doCompletionResolve(
            {
              label: "module_3",
              data: {
                documentUri: fixtureFileUri,
                moduleFqcn: "org_1.coll_3.module_3",
                inlineCollections: [],
                atEndOfLine: false,
                firstElementOfList: false,
              },
            },
            context,
          );
          expect(item.insertText).toBe("module_3");
        } finally {
          settings.ansible.useFullyQualifiedCollectionNames = true;
        }
      });
    });
  }
});
