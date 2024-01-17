import * as assert from "assert";
import { after } from "mocha";

import {TextDocument, Position, InlineCompletionContext, commands} from "vscode";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as myExtension from '../extension';

// import { TextDocument, Position, InlineCompletionContext, CancellationToken } from "vscode";
import { onTextEditorNotActive } from "../../../src/features/lightspeed/inlinesuggestion/completionState";
import { SuggestionDisplayed } from "../../../src/features/lightspeed/inlinesuggestion/suggestionDisplayed";

// function create_inline_suggestion_provider(): LightSpeedInlineSuggestionProvider {
//     const provider = new LightSpeedInlineSuggestionProvider();

//     return provider;

// }

describe("testing the callbacks", () => {
    it("TextEditorNotActive", async function () {

        const suggestionDisplayed = new SuggestionDisplayed();
        const document: Partial<TextDocument> = {};
        const position: Partial<Position> = {};
        const context: Partial<InlineCompletionContext> = {};
        const executeCommand = {};


        
        const items = await onTextEditorNotActive(suggestionDisplayed,
                                            document as TextDocument,
                                            position as Position,context as InlineCompletionContext,
                                           executeCommand as typeof commands.executeCommand
                                           );
        console.log(items);
        assert.equal(items.length, 0);
    });
});
