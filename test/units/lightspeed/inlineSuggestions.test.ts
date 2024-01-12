
import * as assert from 'assert';
import { after } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../extension';


console.log(vscode.Position);

// import { TextDocument, Position, InlineCompletionContext, CancellationToken } from "vscode";
// import { LightSpeedInlineSuggestionProvider } from "../../../src/features/lightspeed/inlineSuggestions";

// function create_inline_suggestion_provider(): LightSpeedInlineSuggestionProvider {
//     const provider = new LightSpeedInlineSuggestionProvider();

//     return provider;
    
// } 


// describe("testing the error handling", () => {
//   it("err generic", () => {
//     const provider = create_inline_suggestion_provider();
//     assert.equal(
//       provider,
//       "Failed to fetch inline suggestion from Ansible Lightspeed with status code: 200. Try again after some time."
//     );
//   });
// });
