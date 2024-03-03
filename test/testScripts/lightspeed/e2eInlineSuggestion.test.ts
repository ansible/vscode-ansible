import * as vscode from "vscode";
import {
  CancellationToken,
  Disposable,
  InlineCompletionContext,
  InlineCompletionList,
  InlineCompletionItemProvider,
  Position,
  ProviderResult,
  Range,
  Selection,
  TextDocument,
} from "vscode";
import { assert } from "chai";
import sinon from "sinon";

import {
  LightSpeedCommands,
  UserAction,
} from "../../../src/definitions/lightspeed";
import { lightSpeedManager } from "../../../src/extension";
import { ignorePendingSuggestion } from "../../../src/features/lightspeed/inlineSuggestions";
import { FeedbackRequestParams } from "../../../src/interfaces/lightspeed";

import { activate, getDocUri, sleep } from "../../helper";
import { integer } from "vscode-languageclient";

const INSERT_TEXT = "**** I'm not a pilot ****";

const LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME = 1000;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME = 200;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_IGNORE_WAIT_TIME =
  LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME;

const LINE_TO_ACTIVATE = 1;
const COLUMN_TO_ACTIVATE = 8;

export async function testInlineSuggestionByAnotherProvider(): Promise<void> {
  describe("Test an inline suggestion from another provider", async () => {
    let disposable: Disposable;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let executeCommandSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let feedbackRequestSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isAuthenticatedStub: any;

    before(async () => {
      // This file does not contain trigger keywords for Lightspeed
      const docUri = getDocUri("lightspeed/playbook_2.yml");
      // Spy vscode's executeCommand API
      executeCommandSpy = sinon.spy(vscode.commands, "executeCommand");
      feedbackRequestSpy = sinon.spy(
        lightSpeedManager.apiInstance,
        "feedbackRequest"
      );
      isAuthenticatedStub = sinon.stub(
        lightSpeedManager.lightSpeedAuthenticationProvider,
        "isAuthenticated"
      );
      isAuthenticatedStub.returns(Promise.resolve(true));

      // Register the bare minimum inline suggestion provider. which is
      // activated at (line, column) = (1, 8). Note numbers are zero-origin.
      disposable = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: "file", language: "ansible" },
        new AnotherInlineSuggestionProvider()
      );
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri);
    });

    it("Test an inline suggestion from another provider is committed", async function () {
      const editor = await invokeInlineSuggestion(
        LINE_TO_ACTIVATE,
        COLUMN_TO_ACTIVATE
      );

      // Issue Lightspeed's commit command, which is assigned to the Tab key, which
      // should issue vscode's commit command eventually
      await vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT
      );
      await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME);

      // Make sure vscode's commit command was issued as expected
      let foundCommitCommand = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executeCommandSpy.args.forEach((arg: any) => {
        if (arg[0] === "editor.action.inlineSuggest.commit") {
          foundCommitCommand = true;
        }
      });
      assert(foundCommitCommand);

      // Verify the committed suggestion is the expected one
      const currentPosition = editor.selection.active;
      assert(
        currentPosition.character === COLUMN_TO_ACTIVATE + INSERT_TEXT.length
      );
      const suggestionRange = new Range(
        new Position(currentPosition.line, COLUMN_TO_ACTIVATE),
        new Position(currentPosition.line, currentPosition.character)
      );
      const committedSuggestion = editor.document
        .getText(suggestionRange)
        .trim();
      assert(committedSuggestion === INSERT_TEXT);
    });

    afterEach(() => {
      executeCommandSpy.resetHistory();
      feedbackRequestSpy.resetHistory();
    });

    after(() => {
      // Dispose the bare minimum inline suggestion provider
      disposable.dispose();
      executeCommandSpy.restore();
      feedbackRequestSpy.restore();
      isAuthenticatedStub.restore();
      sinon.restore();
    });
  });
}

export async function testIgnorePendingSuggestion(): Promise<void> {
  describe("Test to ignore a pending suggestion", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let feedbackRequestSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isAuthenticatedStub: any;

    before(async () => {
      const docUri = getDocUri("lightspeed/playbook_3.yml");
      feedbackRequestSpy = sinon.spy(
        lightSpeedManager.apiInstance,
        "feedbackRequest"
      );
      isAuthenticatedStub = sinon.stub(
        lightSpeedManager.lightSpeedAuthenticationProvider,
        "isAuthenticated"
      );
      isAuthenticatedStub.returns(Promise.resolve(true));

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri);
    });

    it("Test ignorePendingSuggestion method", async () => {
      // Inline suggestion is triggered at (line, column) = (5, 4).  Note numbers are
      // zero-origin. Since the file does not contain trailing blanks, we need to send
      // four spaces through vscode API.
      await invokeInlineSuggestion(5, 0, 4);

      await ignorePendingSuggestion();
      await sleep(LIGHTSPEED_INLINE_SUGGESTION_AFTER_IGNORE_WAIT_TIME);

      const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
      assert.equal(feedbackRequestApiCalls.length, 1);
      const inputData: FeedbackRequestParams = feedbackRequestSpy.args[0][0];
      assert(inputData?.inlineSuggestion?.action === UserAction.IGNORED);
      const ret = feedbackRequestSpy.returnValues[0];
      assert(Object.keys(ret).length === 0); // ret should be equal to {}
    });

    afterEach(() => {
      feedbackRequestSpy.resetHistory();
    });

    after(() => {
      feedbackRequestSpy.restore();
      isAuthenticatedStub.restore();
      sinon.restore();
    });
  });
}

async function invokeInlineSuggestion(
  lineToActivate: integer,
  columnToActivate: integer,
  spaces = 1
): Promise<vscode.TextEditor> {
  const editor = vscode.window.activeTextEditor;
  assert(editor);
  const doc = editor?.document;
  assert(doc);

  // Set the cursor to the position where the bare minimum provider provides
  // its inline suggestion
  const newPosition = new Position(lineToActivate, columnToActivate - spaces);
  editor.selection = new Selection(newPosition, newPosition);
  editor.revealRange(new Range(newPosition, newPosition));

  for (let i = 0; i < spaces; i++) {
    await vscode.commands.executeCommand("type", { text: " " });
  }
  await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);

  return editor;
}

// "Bare minimum" VS Code inline suggestion provider
class AnotherInlineSuggestionProvider implements InlineCompletionItemProvider {
  provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    _context: InlineCompletionContext, // eslint-disable-line @typescript-eslint/no-unused-vars
    _token: CancellationToken // eslint-disable-line @typescript-eslint/no-unused-vars
  ): ProviderResult<InlineCompletionList> {
    const result: InlineCompletionList = {
      items: [],
    };

    if (
      position.line === LINE_TO_ACTIVATE &&
      position.character === COLUMN_TO_ACTIVATE
    ) {
      const text = INSERT_TEXT;
      result.items.push({
        insertText: text,
      });
    }

    return result;
  }
}
