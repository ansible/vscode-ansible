/**
 * This is the test file for `doCompletionResolve()` function in the completion provider.
 * `doCompletionResolve()` is called to resolve the selected completion item.
 */

import { expect } from "chai";
import { EOL } from "os";
import { doCompletionResolve } from "../../src/providers/completionProvider";
import {} from "../../src/providers/validationProvider";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager";
import {
  createTestWorkspaceManager,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
  resolveDocUri,
  getDoc,
} from "../helper";

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
      it(`should resolve completion for ${name}`, async function () {
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
      it(`should resolve completion for ${name}`, async function () {
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
    {
      name: "option expecting dictionary with `option: ${EOL}\\t\\t`",
      completionItem: {
        label: "opt_1",
        data: {
          documentUri: "dummy/uri/for/resolve_completion.yml",
          type: "dict",
          atEndOfLine: true,
          firstElementOfList: true,
        },
      },
      completionTextAtLineEnd: `opt_1:${EOL}\t\t`,
      completionTextInBetween: "opt_1",
    },
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
      it(`should resolve completion for ${name}`, async function () {
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

describe("doCompletionResolve()", () => {
  const workspaceManager = createTestWorkspaceManager();
  const fixtureFilePath = "completion/resolve_completion.yml";
  const fixtureFileUri = resolveDocUri(fixtureFilePath);
  const context = workspaceManager.getContext(fixtureFileUri);

  const textDoc = getDoc(fixtureFilePath);
  expect(context).be.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Resolve completion for module names", () => {
      describe("Resolve completion for module names when FQCN is enabled", function () {
        describe("with EE enabled @ee", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });
          testFQCNEnabled(context);

          after(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("with EE disabled", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
          testFQCNEnabled(context);
        });
      });

      describe("Resolve completion for module names when FQCN is disabled", function () {
        describe("with EE enabled @ee", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings);
            (await docSettings).ansible.useFullyQualifiedCollectionNames =
              false;
          });
          testFQCNDisabled(context);

          after(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
            (await docSettings).ansible.useFullyQualifiedCollectionNames = true;
          });
        });

        describe("with EE disabled", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
            (await docSettings).ansible.useFullyQualifiedCollectionNames =
              false;
          });
          testFQCNDisabled(context);

          after(async () => {
            setFixtureAnsibleCollectionPathEnv();
            (await docSettings).ansible.useFullyQualifiedCollectionNames = true;
          });
        });
      });
    });

    describe("Resolve completion for module options and suboptions", () => {
      describe("with EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testResolveModuleOptionCompletion(context);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("with EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testResolveModuleOptionCompletion(context);
      });
    });
  }
});
