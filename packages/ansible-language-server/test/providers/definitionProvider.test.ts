import { TextDocument } from "vscode-languageserver-textdocument";
import { expect } from "chai";
import {
  createTestWorkspaceManager,
  getDoc,
  resolveDocUri,
  enableExecutionEnvironmentSettings,
  disableExecutionEnvironmentSettings,
  setFixtureAnsibleCollectionPathEnv,
} from "../helper";
import { Position } from "vscode-languageserver";
import { WorkspaceFolderContext } from "../../src/services/workspaceManager";
import { getDefinition } from "../../src/providers/definitionProvider";
import { fileExists } from "../../src/utils/misc";
import { URI } from "vscode-uri";

function testModuleNamesForDefinition(
  context: WorkspaceFolderContext,
  textDoc: TextDocument,
) {
  const tests = [
    {
      word: "definition for builtin modules (ansible.builtin.debug)",
      position: { line: 5, character: 8 } as Position,
      selectionRange: {
        start: { line: 5, character: 6 },
        end: { line: 5, character: 27 },
      },
      provideDefinition: true,
    },
    {
      word: "no definition for invalid module names",
      position: { line: 13, character: 8 } as Position,
      selectionRange: {
        start: { line: 13, character: 6 },
        end: { line: 13, character: 15 },
      },
      provideDefinition: false,
    },
    {
      word: "definition for collection modules (org_1.coll_3.module_3)",
      position: { line: 18, character: 8 } as Position,
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
        expect(actualDefinition).to.be.null;
        return;
      }

      expect(actualDefinition).to.have.length(1);
      if (actualDefinition) {
        const definition = actualDefinition[0];
        // file uri check
        expect(definition.targetUri.startsWith("file:///")).to.be.true;
        expect(definition.targetUri).satisfy((fileUri: string) =>
          fileExists(URI.parse(fileUri).path),
        );

        // nodule name range check in the playbook
        expect(definition.originSelectionRange).to.deep.equal(selectionRange);

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
    describe("With EE enabled @ee", function () {
      before(async function () {
        setFixtureAnsibleCollectionPathEnv(
          "/home/runner/.ansible/collections:/usr/share/ansible/collections",
        );
        if (docSettings) {
          await enableExecutionEnvironmentSettings(docSettings);
        }
      });

      if (context) {
        testModuleNamesForDefinition(context, textDoc);
      }

      after(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
    });

    describe("With EE disabled", function () {
      before(async function () {
        setFixtureAnsibleCollectionPathEnv();
        if (docSettings) {
          await disableExecutionEnvironmentSettings(docSettings);
        }
      });
      if (context) {
        testModuleNamesForDefinition(context, textDoc);
      }
    });
  });
});
