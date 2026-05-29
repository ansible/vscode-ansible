import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupContent, Position } from "vscode-languageserver";
import { expect, beforeAll, afterAll, assert } from "vitest";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "@test/helper.js";
import { doHover } from "@src/providers/hoverProvider.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { DocsLibrary } from "@src/services/docsLibrary.js";

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

  const emptyDocsLibrary = {
    findModule: async () => [null, false],
  } as unknown as DocsLibrary;

  describe("Symbol-based hover (handler, variable, filePath, role)", function () {
    describe("handler hover", () => {
      const textDoc = getDoc("references/playbook_handlers.yml");

      it("should provide hover for handler notify", async () => {
        // 0-based line 6: `notify: Restart nginx`
        const hover = await doHover(textDoc, Position.create(6, 14), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Handler");
        expect(value).toContain("Restart nginx");
      });

      it("should provide hover for handler name in handlers section", async () => {
        // 0-based line 17: `- name: Restart nginx`
        const hover = await doHover(textDoc, Position.create(17, 14), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Handler");
        expect(value).toContain("Restart nginx");
      });

      it("should provide hover for listen value", async () => {
        // 0-based line 26: `listen: Restart nginx`
        const hover = await doHover(textDoc, Position.create(26, 14), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Handler");
      });
    });

    describe("variable hover", () => {
      const textDoc = getDoc("references/playbook_variables.yml");

      it("should provide hover for vars key", async () => {
        // 0-based line 3: `http_port: 8080`
        const hover = await doHover(textDoc, Position.create(3, 6), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Variable");
        expect(value).toContain("http_port");
      });

      it("should provide hover for register variable", async () => {
        // 0-based line 16: `register: cmd_result`
        const hover = await doHover(textDoc, Position.create(16, 16), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Variable");
        expect(value).toContain("cmd_result");
      });

      it("should provide hover for Jinja2 variable", async () => {
        // 0-based line 12: `msg: "Port is {{ http_port }}"`
        const hover = await doHover(textDoc, Position.create(12, 28), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Variable");
        expect(value).toContain("http_port");
      });

      it("should provide hover for vars_prompt variable", async () => {
        // 0-based line 6: `- name: user_password`
        const hover = await doHover(textDoc, Position.create(6, 14), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Variable");
        expect(value).toContain("user_password");
      });
    });

    describe("variable hover with argument_specs", () => {
      const textDoc = getDoc("references/roles/test_role/tasks/main.yml");

      it("should provide enriched hover for role variable with argument_specs", async () => {
        // 0-based line 3: `name: "{{ app_user }}"` — cursor on app_user
        const hover = await doHover(textDoc, Position.create(3, 14), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        // Should contain argument_specs info (type, description)
        expect(value.length).toBeGreaterThan(0);
      });
    });

    describe("filePath hover", () => {
      const textDoc = getDoc("references/playbook_includes.yml");

      it("should provide hover for include_tasks path", async () => {
        // 0-based line 6: `ansible.builtin.include_tasks: included_tasks.yml`
        const hover = await doHover(textDoc, Position.create(6, 38), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("File");
        expect(value).toContain("included_tasks");
      });

      it("should provide hover for vars_files entry", async () => {
        // 0-based line 3: `- vars/defaults.yml`
        const hover = await doHover(textDoc, Position.create(3, 10), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("File");
      });
    });

    describe("role hover", () => {
      const textDoc = getDoc("references/playbook_includes.yml");

      it("should provide hover for include_role name", async () => {
        // 0-based line 20: `name: test_role`
        const hover = await doHover(textDoc, Position.create(20, 16), emptyDocsLibrary);
        assert(hover);
        const value = get_hover_value(hover);
        expect(value).toContain("Role");
        expect(value).toContain("test_role");
      });
    });

    describe("null cases", () => {
      it("should return null for non-symbol position", async () => {
        const textDoc = getDoc("references/playbook_handlers.yml");
        // line 0: `---`
        const hover = await doHover(textDoc, Position.create(0, 0), emptyDocsLibrary);
        expect(hover).toBeNull();
      });

      it("should return null for non-existent role", async () => {
        const doc = TextDocument.create(
          "file:///tmp/test.yml", "ansible", 1,
          `---\n- hosts: all\n  tasks:\n    - ansible.builtin.include_role:\n        name: nonexistent_role_xyz\n`,
        );
        const hover = await doHover(doc, Position.create(4, 14), emptyDocsLibrary);
        expect(hover).toBeNull();
      });
    });
  });

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
