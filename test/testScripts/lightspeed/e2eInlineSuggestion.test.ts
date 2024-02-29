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
import { activate, getDocUri, sleep } from "../../helper";
import { LightSpeedCommands } from "../../../src/definitions/lightspeed";
import sinon from "sinon";

const INSERT_TEXT = "**** I'm not a pilot ****";

const LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME = 1000;
const LIGHTSPEED_INLINE_SUGGESTION_AFTER_COMMIT_WAIT_TIME = 200;

const LINE_TO_ACTIVATE = 1;
const COLUMN_TO_ACTIVATE = 8;

export async function testInlineSuggestionByAnotherProvider(): Promise<void> {
  describe("Test an inline suggestion from another provider", async () => {
    let disposable: Disposable;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let executeCommandSpy: any;

    before(async () => {
      // This file does not contain trigger keywords for Lightspeed
      const docUri = getDocUri("lightspeed/playbook_2.yml");
      // Spy vscode's executeCommand API
      executeCommandSpy = sinon.spy(vscode.commands, "executeCommand");

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
      const editor = vscode.window.activeTextEditor;
      assert(editor);
      const doc = editor?.document;
      assert(doc);

      // Set the cursor to the position where the bare minimum provider provides
      // its inline suggestion
      const newPosition = new Position(
        LINE_TO_ACTIVATE,
        COLUMN_TO_ACTIVATE - 1
      );
      editor.selection = new Selection(newPosition, newPosition);
      editor.revealRange(new Range(newPosition, newPosition));

      await vscode.commands.executeCommand("type", { text: " " });
      await sleep(LIGHTSPEED_INLINE_SUGGESTION_WAIT_TIME);

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
      const committedSuggestion = doc.getText(suggestionRange).trim();
      assert(committedSuggestion === INSERT_TEXT);
    });

    after(() => {
      // Dispose the bare minimum inline suggestion provider
      disposable.dispose();
      executeCommandSpy.restore();
    });
  });
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
