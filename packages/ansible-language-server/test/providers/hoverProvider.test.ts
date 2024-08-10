import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent, Position } from "vscode-languageserver";
import { expect } from "chai";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper";
import { doHover } from "../../src/providers/hoverProvider";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager";

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
      position: { line: 0, character: 4 } as Position,
      doc: "Identifier. Can be used for documentation, or in tasks/handlers.",
    },
    {
      word: "host",
      position: { line: 1, character: 4 } as Position,
      doc: "A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.",
    },
    {
      word: "tasks",
      position: { line: 3, character: 4 } as Position,
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
        expect(get_hover_value(actualHover)).includes(doc);
      } else {
        expect(false);
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
      position: { line: 6, character: 8 } as Position,
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
        expect(get_hover_value(actualHover)).includes(doc);
      } else {
        expect(false);
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
      position: { line: 11, character: 8 } as Position,
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
        expect(get_hover_value(actualHover)).includes(doc);
      } else {
        expect(false);
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
      position: { line: 6, character: 8 } as Position,
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
        expect(get_hover_value(actualHover)).includes(doc);
      } else {
        expect(false);
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
      position: { line: 4, character: 8 } as Position,
      doc: "Print statements during execution",
    },
    {
      word: "ansible.builtin.debug -> msg",
      position: { line: 5, character: 10 } as Position,
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
      expect(get_hover_value(actualHover)).includes(doc);
    });
  });
}

function testNoHover(context: WorkspaceFolderContext, textDoc: TextDocument) {
  it("should not provide hovering for values", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 13, character: 24 } as Position,
      await context.docsLibrary,
    );
    expect(actualHover).to.be.null;
  });

  it("should not provide hovering for improper module name and options", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 13, character: 8 } as Position,
      await context.docsLibrary,
    );
    expect(actualHover).to.be.null;
  });

  it("should not provide hovering for improper module option", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 14, character: 10 } as Position,
      await context.docsLibrary,
    );
    expect(actualHover).to.be.null;
  });
}

function testPlaybookAdjacentCollection(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "playbook adjacent module name",
      position: { line: 5, character: 19 } as Position,
      doc: "This is a test module for playbook adjacent collection",
    },
    {
      word: "playbook adjacent module option",
      position: { line: 6, character: 11 } as Position,
      doc: "Option 1",
    },
    {
      word: "playbook adjacent module sub option",
      position: { line: 7, character: 19 } as Position,
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
      expect(get_hover_value(actualHover)).includes(doc);
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
      position: { line: 5, character: 19 } as Position,
      doc: "",
    },
    {
      word: "non playbook adjacent module option",
      position: { line: 6, character: 11 } as Position,
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
        expect(actualHover).to.be.null;
      } else {
        expect(
          get_hover_value(actualHover),
          `actual hover -> ${actualHover}`,
        ).includes(doc);
      }
    });
  });
}

describe("doHover()", () => {
  const workspaceManager = createTestWorkspaceManager();
  let fixtureFilePath = "hover/tasks.yml";
  let fixtureFileUri = resolveDocUri(fixtureFilePath);
  let context = workspaceManager.getContext(fixtureFileUri);

  let textDoc = getDoc(fixtureFilePath);
  let docSettings = context?.documentSettings.get(textDoc.uri);
  expect(docSettings !== undefined);

  describe("Play keywords hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });
      if (context) {
        testPlayKeywords(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
      if (context) {
        testPlayKeywords(context, textDoc);
      }
    });
  });

  describe("Task keywords hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });
      if (context) {
        testTaskKeywords(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
      if (context) {
        testTaskKeywords(context, textDoc);
      }
    });
  });

  describe("Block keywords hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testBlockKeywords(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testBlockKeywords(context, textDoc);
      }
    });
  });
  fixtureFilePath = "hover/roles.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);

  textDoc = getDoc(fixtureFilePath);
  docSettings = context?.documentSettings.get(textDoc.uri);

  describe("Role keywords hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testRoleKeywords(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testRoleKeywords(context, textDoc);
      }
    });
  });

  fixtureFilePath = "hover/tasks.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);

  textDoc = getDoc(fixtureFilePath);
  docSettings = context?.documentSettings.get(textDoc.uri);

  describe("Module name and options hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testModuleNames(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testModuleNames(context, textDoc);
      }
    });
  });

  describe("No hover", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testNoHover(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testNoHover(context, textDoc);
      }
    });
  });

  fixtureFilePath = "playbook_adjacent_collection/playbook.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  docSettings = context?.documentSettings.get(textDoc.uri);

  describe("Hover for playbook adjacent collection", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testPlaybookAdjacentCollection(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testPlaybookAdjacentCollection(context, textDoc);
      }
    });
  });

  fixtureFilePath =
    "playbook_adjacent_collection/non_adjacent_playbooks/playbook2.yml";
  fixtureFileUri = resolveDocUri(fixtureFilePath);
  context = workspaceManager.getContext(fixtureFileUri);
  textDoc = getDoc(fixtureFilePath);
  docSettings = context?.documentSettings.get(textDoc.uri);

  describe("Negate hover for non playbook adjacent collection", () => {
    describe("With EE enabled @ee", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testNonPlaybookAdjacentCollection(context, textDoc);
      }

      after(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", () => {
      before(async () => {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testNonPlaybookAdjacentCollection(context, textDoc);
      }
    });
  });
});
