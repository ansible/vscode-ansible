import { TextDocument } from "vscode-languageserver-textdocument";
import { expect } from "chai";
import {
  Position,
  CompletionItemKind,
  CompletionItem,
} from "vscode-languageserver";
import {
  doCompletion,
  doCompletionResolve,
} from "../../src/providers/completionProvider";
import {} from "../../src/providers/validationProvider";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager";
import {
  createTestWorkspaceManager,
  getDoc,
  smartFilter,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
  setAnsibleConfigEnv,
  unsetAnsibleConfigEnv,
} from "../helper";

function testPlayKeywords(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "name",
      position: { line: 0, character: 2 } as Position,
      triggerCharacter: "",
      completion: "name",
    },
    {
      name: "hosts",
      position: { line: 2, character: 5 } as Position,
      triggerCharacter: "hos",
      completion: "hosts",
    },
  ];

  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testRoleKeywords(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "name",
      position: { line: 4, character: 6 } as Position,
      triggerCharacter: "",
      completion: "name",
    },
    {
      name: "when",
      position: { line: 5, character: 8 } as Position,
      triggerCharacter: "wh",
      completion: "when",
    },
  ];

  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testBlockKeywords(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "become_user",
      position: { line: 8, character: 13 } as Position,
      triggerCharacter: "user",
      completion: "become_user",
    },
    {
      name: "become",
      position: { line: 7, character: 8 } as Position,
      triggerCharacter: "be",
      completion: "become",
    },
  ];
  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testTaskKeywords(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "loop",
      position: { line: 10, character: 9 } as Position,
      triggerCharacter: "loop",
      completion: "loop",
    },
    {
      name: "debugger",
      position: { line: 13, character: 9 } as Position,
      triggerCharacter: "deb",
      completion: "debugger",
    },
  ];
  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testModuleNames(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "with name as first option always",
      position: { line: 6, character: 6 } as Position,
      triggerCharacter: "",
      completion: "name",
    },
    {
      name: "`ansible.builtin.ping` with `ping`",
      position: { line: 7, character: 8 } as Position,
      triggerCharacter: "ping",
      completion: "ansible.builtin.ping",
    },
    {
      name: "`ansible.builtin.debug` with `debu`", // cspell: ignore debu
      position: { line: 7, character: 8 } as Position,
      triggerCharacter: "debu",
      completion: "ansible.builtin.debug",
    },
    {
      name: "list for all modules under ansible namespace with `ansible.`",
      position: { line: 7, character: 8 } as Position,
      triggerCharacter: "ansible.",
      completion: "ansible.",
    },
    {
      name: "list for all the modules under ansible.builtin with `ansible.builtin.`",
      position: { line: 7, character: 8 } as Position,
      triggerCharacter: "ansible.builtin.",
      completion: "ansible.builtin.",
    },
    {
      name: "list for all the collection modules starting with `c` under org_1 namespace with `org_1.c`",
      position: { line: 16, character: 13 } as Position,
      triggerCharacter: "org_1.c",
      completion: "org_1.c",
    },
    {
      name: "list for all the modules under coll_4 in org_1 with `org_1.coll_4.`",
      position: { line: 16, character: 19 } as Position,
      triggerCharacter: "org_1.coll_4.",
      completion: "org_1.coll_4.",
    },
    {
      name: "list for all the modules under coll_5 in org_1 with `org_1.coll_5.`",
      position: { line: 34, character: 19 } as Position,
      triggerCharacter: "org_1.coll_5.",
      completion: "org_1.coll_5.sub_coll_1.module_1",
    },
  ];

  tests.forEach(({ name, position, triggerCharacter, completion }) => {
    it(`should provide completion for ${name}`, async function () {
      expect(context).is.not.undefined;
      if (context) {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).to.contain(completion);
          expect(filteredCompletion[0].textEdit?.newText).to.contain(
            completion,
          );
        }
      }
    });
  });
}

function testModuleOptions(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "builtin module option (ansible.builtin.debug -> msg)",
      position: { line: 8, character: 9 } as Position,
      triggerCharacter: "m",
      completion: "msg",
    },
    {
      name: "collection module option (org_1.coll_4.module_1 -> opt_1)",
      position: { line: 17, character: 8 } as Position,
      triggerCharacter: "",
      completion: "opt_1",
    },
    {
      name: "collection module sub option (org_1.coll_4.module_1 -> opt_1 -> sub_opt_1)",
      position: { line: 21, character: 12 } as Position,
      triggerCharacter: "1",
      completion: "sub_opt_1",
    },
    {
      name: "collection module sub option (org_1.coll_4.module_1 -> opt_1 -> sub_opt_2 -> sub_sub_opt_3 -> sub_sub_sub_opt_2)",
      position: { line: 26, character: 20 } as Position,
      triggerCharacter: "2",
      completion: "sub_sub_sub_opt_2",
    },
    {
      name: "only non repeating options",
      position: { line: 9, character: 9 } as Position,
      triggerCharacter: "m",
      completion: "",
    },
    {
      name: "only non repeating suboptions",
      position: { line: 29, character: 20 } as Position,
      triggerCharacter: "1",
      completion: "",
    },
  ];

  tests.forEach(({ name, position, triggerCharacter, completion }) => {
    it(`should provide completion for ${name}`, async function () {
      expect(context).is.not.undefined;
      if (context) {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      }
    });
  });
}

function testModuleOptionsValues(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "builtin module option (ansible.builtin.debug -> msg)",
      position: { line: 8, character: 13 } as Position,
      triggerCharacter: "",
      completion: ["Hello world!"],
    },
    {
      name: "collection module option (org_1.coll_4.module_1 -> opt_3)",
      position: { line: 30, character: 15 } as Position,
      triggerCharacter: "3",
      completion: ["choice_3"],
    },
    {
      name: "collection module sub option (org_1.coll_4.module_1 -> opt_1 -> sub_opt_1)",
      position: { line: 18, character: 23 } as Position,
      triggerCharacter: "1",
      completion: ["choice_1"],
    },
    {
      name: "default first",
      position: { line: 30, character: 15 } as Position,
      triggerCharacter: "",
      completion: ["choice_4", "choice_1", "choice_2", "choice_3"],
    },
    {
      name: "boolean values",
      position: { line: 31, character: 15 } as Position,
      triggerCharacter: "",
      completion: ["false", "true"],
    },
  ];

  tests.forEach(({ name, position, triggerCharacter, completion }) => {
    it(`should provide completion for ${name}`, async function () {
      expect(context).is.not.undefined;
      if (context) {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const labelCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        ).map((completion) => {
          return completion.label;
        });

        if (!completion) {
          expect(labelCompletion.length).be.equal(0);
        } else {
          expect(labelCompletion).be.deep.equal(completion);
        }

        const newTextCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        ).map((completion) => {
          return completion.textEdit?.newText;
        });

        if (!completion) {
          expect(newTextCompletion.length).be.equal(0);
        } else {
          expect(newTextCompletion).be.deep.equal(completion);
        }
      }
    });
  });
}

function testModuleNamesWithoutFQCN(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "`ping` with `pin` (ansible.builtin.ping)",
      position: { line: 7, character: 9 } as Position,
      triggerCharacter: "pin",
      completion: "ping",
    },
    {
      name: "module option for ping (ping -> data)",
      position: { line: 8, character: 8 } as Position,
      triggerCharacter: "",
      completion: "data",
    },
    {
      name: "`module_3` from `org_1.coll_3` with `module_3` (org_1.coll_3.module_3)",
      position: { line: 11, character: 14 } as Position,
      triggerCharacter: "module_3",
      completion: "module_3",
    },
    {
      name: "module sub option for module_3 (org_1.coll_3.module_3 -> opt_1 -> sub_opt_2)",
      position: { line: 13, character: 13 } as Position,
      triggerCharacter: "2",
      completion: "sub_opt_2",
    },
  ];

  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        //   Update setting to stop using FQCN for module names
        const docSettings = context.documentSettings.get(textDoc.uri);
        const cachedDefaultSetting = (await docSettings).validation.lint
          .enabled;
        (await docSettings).ansible.useFullyQualifiedCollectionNames = false;

        const actualCompletion = await doCompletion(textDoc, position, context);

        // Revert back the default settings
        (await docSettings).ansible.useFullyQualifiedCollectionNames =
          cachedDefaultSetting;

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testPlaybookAdjacentCollection(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "playbook adjacent module (adjacent_org.adjacent_coll.module_1)",
      position: { line: 5, character: 19 } as Position,
      triggerCharacter: "adjacent_org.",
      completion: "adjacent_org.adjacent_coll.module_1",
    },
    {
      name: "playbook adjacent module option (adjacent_org.adjacent_coll.module_1 -> opt_1)",
      position: { line: 6, character: 11 } as Position,
      triggerCharacter: "opt",
      completion: "opt_1",
    },
    {
      name: "playbook adjacent module sub option (adjacent_org.adjacent_coll.module_1 -> opt_1 -> sub_opt_1)",
      position: { line: 7, character: 19 } as Position,
      triggerCharacter: "sub_opt",
      completion: "sub_opt_1",
    },
  ];
  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testNonPlaybookAdjacentCollection(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "non playbook adjacent module (adjacent_org.adjacent_coll.module_1)",
      position: { line: 5, character: 19 } as Position,
      triggerCharacter: "adjacent_org.",
      completion: "",
    },
    {
      name: "non playbook adjacent module option (adjacent_org.adjacent_coll.module_1 -> opt_1)",
      position: { line: 6, character: 11 } as Position,
      triggerCharacter: "opt",
      completion: "",
    },
  ];
  expect(context).is.not.undefined;
  if (context) {
    tests.forEach(({ name, position, triggerCharacter, completion }) => {
      it(`should not provide completion for ${name}`, async function () {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        );

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion[0].label).be.equal(completion);
          expect(filteredCompletion[0].textEdit?.newText).be.equal(completion);
        }
      });
    });
  }
}

function testHostValues(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "hello-worlds group",
      position: { line: 2, character: 9 } as Position,
      triggerCharacter: "hello",
      completion: ["hello-worlds", "hello.world.1", "hello.world.2"],
    },
    {
      name: "test-inventories group",
      position: { line: 2, character: 9 } as Position,
      triggerCharacter: "inventor",
      completion: ["test-inventories", "test.inventory.3", "test.inventory.4"],
    },
    {
      name: "localhost",
      position: { line: 2, character: 14 } as Position,
      triggerCharacter: "local",
      completion: ["localhost"],
    },
    {
      name: "all",
      position: { line: 2, character: 9 } as Position,
      triggerCharacter: "all",
      completion: ["all"],
    },
  ];

  tests.forEach(({ name, position, triggerCharacter, completion }) => {
    it(`should provide completion for ${name} as hosts value`, async function () {
      expect(context).is.not.undefined;
      if (context) {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        ).map((completion) => {
          return completion.label;
        });

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion).be.deep.equal(completion);
        }
      }
    });
  });
}

function testVarsCompletionInsideJinja(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      name: "variables defined at task level",
      position: { line: 36, character: 17 } as Position,
      triggerCharacter: "",
      completion: ["url", "home", "os", "password", "username"],
    },
    {
      name: "variables defined at block level",
      position: { line: 30, character: 47 } as Position,
      triggerCharacter: "var",
      completion: ["task_var", "block_var_1", "block_var_2"],
    },
    {
      name: "variables defined at play level",
      position: { line: 14, character: 35 } as Position,
      triggerCharacter: "",
      completion: ["home", "os", "password", "username"],
    },
    {
      name: "variables defined inside a vars file",
      position: { line: 51, character: 33 } as Position,
      triggerCharacter: "",
      completion: [
        "filepath",
        "mode",
        "default_var_1",
        "default_var_2",
        "default_var_3",
      ],
    },
  ];

  tests.forEach(({ name, position, triggerCharacter, completion }) => {
    it(`should provide completion for ${name}`, async function () {
      expect(context).is.not.undefined;
      if (context) {
        const actualCompletion = await doCompletion(textDoc, position, context);

        const filteredCompletion = smartFilter(
          actualCompletion,
          triggerCharacter,
        ).map((completion) => {
          return completion.label;
        });

        if (!completion) {
          expect(filteredCompletion.length).be.equal(0);
        } else {
          expect(filteredCompletion).be.deep.equal(completion);
        }
      }
    });
  });
}

function testModuleKindAndDocumentation(
  context: WorkspaceFolderContext | undefined,
  textDoc: TextDocument,
) {
  const tests = [
    {
      moduleName: "org_1.coll_6.module_1",
      kind: CompletionItemKind.Reference,
      documentation:
        "***Redirected to: org_1.coll_6.sub_coll_1.module_1***\n\n*Test module*\n\n**Description**\n\n- This is a test module 1\n\n**Notes**\n\n- This is a dummy module",
    },
    {
      moduleName: "org_1.coll_6.module_2",
      kind: CompletionItemKind.Class,
      documentation:
        "*Test module*\n\n**Description**\n\n- This is a test module 2\n\n**Notes**\n\n- This is a dummy module",
    },
    {
      moduleName: "org_1.coll_6.sub_coll_1.module_1",
      kind: CompletionItemKind.Class,
      documentation:
        "*Test module*\n\n**Description**\n\n- This is a test module 1\n\n**Notes**\n\n- This is a dummy module",
    },
    {
      moduleName: "org_1.coll_6.sub_coll_1.module_2",
      kind: CompletionItemKind.Reference,
      documentation:
        "**DEPRECATED**\n\nUsage of org_1.coll_6.sub_coll_1.module_2 is deprecated.\n\nRemoval date: undefined, removal version: undefined\n\n***Redirected to: org_1.coll_6.module_2***\n\n*Test module*\n\n**Description**\n\n- This is a test module 2\n\n**Notes**\n\n- This is a dummy module",
    },
  ];

  tests.forEach(({ moduleName, kind, documentation }) => {
    let resolvedItem: CompletionItem;
    const position = { line: 34, character: 19 } as Position;

    expect(context).is.not.undefined;
    if (context) {
      before(async () => {
        const completion = await doCompletion(textDoc, position, context);
        const filteredCompletion = completion.filter(
          (item) => item.label === moduleName,
        );
        expect(filteredCompletion.length).be.equal(1);
        expect(filteredCompletion[0].label).be.equal(moduleName);
        resolvedItem = await doCompletionResolve(
          filteredCompletion[0],
          context,
        );
      });
      it(`should provide completion kind ${kind} for ${moduleName}`, () => {
        expect(resolvedItem.kind).be.equal(kind);
      });
      it(`should provide documentation for ${moduleName}`, () => {
        let doc = resolvedItem.documentation;
        if (typeof doc !== "string" && doc) {
          doc = doc["value"];
        }
        expect(doc).be.equal(documentation);
      });
    }
  });
}

describe("doCompletion()", () => {
  const workspaceManager = createTestWorkspaceManager();
  let fixtureFilePath = "completion/simple_tasks.yml";
  let fixtureFileUri = resolveDocUri(fixtureFilePath);
  let context = workspaceManager.getContext(fixtureFileUri);

  let textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for host values with static inventory file", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testHostValues(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });
      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);

          setAnsibleConfigEnv();
        });

        testHostValues(context, textDoc);

        after(() => {
          unsetAnsibleConfigEnv();
        });
      });
    });

    describe("Completion for play keywords", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testPlayKeywords(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testPlayKeywords(context, textDoc);
      });
    });
  }
  fixtureFilePath = "completion/with_roles.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);

  textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for role keywords", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testRoleKeywords(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testRoleKeywords(context, textDoc);
      });
    });
  }
  fixtureFilePath = "completion/with_blocks.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for block keywords", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testBlockKeywords(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testBlockKeywords(context, textDoc);
      });
    });
  }
  fixtureFilePath = "completion/simple_tasks.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for task keywords", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testTaskKeywords(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testTaskKeywords(context, textDoc);
      });
    });
    describe("Completion for module names (with different trigger scenarios)", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testModuleNames(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testModuleNames(context, textDoc);
      });
    });

    describe("Check module kind and documentation of completion item", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testModuleKindAndDocumentation(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testModuleKindAndDocumentation(context, textDoc);
      });
    });

    describe("Completion for module options and suboptions", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testModuleOptions(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testModuleOptions(context, textDoc);
      });
    });

    describe("Completion for option and suboption values", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testModuleOptionsValues(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testModuleOptionsValues(context, textDoc);
      });
    });
  }
  fixtureFilePath = "completion/tasks_without_fqcn.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    let docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for module name without FQCN", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testModuleNamesWithoutFQCN(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testModuleNamesWithoutFQCN(context, textDoc);
      });
    });

    describe("Completion for variables inside jinja inline brackets", () => {
      fixtureFilePath = "completion/playbook_with_vars.yml";
      fixtureFileUri = resolveDocUri(fixtureFilePath);
      context = workspaceManager.getContext(fixtureFileUri);
      textDoc = getDoc(fixtureFilePath);
      expect(context).is.not.undefined;
      if (context) {
        docSettings = context.documentSettings.get(textDoc.uri);

        describe("With EE enabled @ee", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv(
              "/home/runner/.ansible/collections:/usr/share/ansible/collections",
            );
            await enableExecutionEnvironmentSettings(docSettings);
          });

          testVarsCompletionInsideJinja(context, textDoc);

          after(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });
        });

        describe("With EE disabled", () => {
          before(async () => {
            setFixtureAnsibleCollectionPathEnv();
            await disableExecutionEnvironmentSettings(docSettings);
          });

          testVarsCompletionInsideJinja(context, textDoc);
        });
      }
    });
  }
  fixtureFilePath = "playbook_adjacent_collection/playbook.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Completion for playbook adjacent collection", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testPlaybookAdjacentCollection(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testPlaybookAdjacentCollection(context, textDoc);
      });
    });
  }
  fixtureFilePath =
    "playbook_adjacent_collection/non_adjacent_playbooks/playbook2.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  expect(context).is.not.undefined;
  if (context) {
    const docSettings = context.documentSettings.get(textDoc.uri);

    describe("Negate completion for non playbook adjacent collection", () => {
      describe("With EE enabled @ee", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv(
            "/home/runner/.ansible/collections:/usr/share/ansible/collections",
          );
          await enableExecutionEnvironmentSettings(docSettings);
        });

        testNonPlaybookAdjacentCollection(context, textDoc);

        after(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });
      });

      describe("With EE disabled", () => {
        before(async () => {
          setFixtureAnsibleCollectionPathEnv();
          await disableExecutionEnvironmentSettings(docSettings);
        });

        testNonPlaybookAdjacentCollection(context, textDoc);
      });
    });
  }
});
