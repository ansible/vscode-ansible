import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent, Position } from "vscode-languageserver";
import { expect, beforeAll, afterAll } from "vitest";
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
      expect(get_hover_value(actualHover)).toContain(doc);
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
    expect(actualHover).toBeNull();
  });

  it("should not provide hovering for improper module name and options", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 13, character: 8 } as Position,
      await context.docsLibrary,
    );
    expect(actualHover).toBeNull();
  });

  it("should not provide hovering for improper module option", async function () {
    const actualHover = await doHover(
      textDoc,
      { line: 14, character: 10 } as Position,
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
        expect(actualHover).toBeNull();
      } else {
        expect(
          get_hover_value(actualHover),
          `actual hover -> ${actualHover}`,
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
  expect(docSettings !== undefined);

  describe("Play keywords hover", function () {
    describe("@ee", function () {
      beforeAll(async () => {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (moduleDocSettings && moduleContext) {
          await enableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });

      if (moduleContext) {
        testModuleNames(moduleContext, moduleTextDoc);
      }

      afterAll(async function () {
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (moduleDocSettings && moduleContext) {
          await enableExecutionEnvironmentSettings(
            moduleDocSettings,
            moduleContext,
          );
        }
      });

      if (moduleContext) {
        testNoHover(moduleContext, moduleTextDoc);
      }

      afterAll(async function () {
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (pacDocSettings && pacContext) {
          await enableExecutionEnvironmentSettings(pacDocSettings, pacContext);
        }
      });

      if (pacContext) {
        testPlaybookAdjacentCollection(pacContext, pacTextDoc);
      }

      afterAll(async function () {
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
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (nonAdjacentDocSettings && nonAdjacentContext) {
          await enableExecutionEnvironmentSettings(
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

      afterAll(async function () {
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
});
