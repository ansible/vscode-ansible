import * as vscode from "vscode";
import { window, TextDocument, Position } from "vscode";

import { v4 as uuidv4 } from "uuid";

import { removePromptFromSuggestion } from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager } from "../../extension";
import { WisdomCommands } from "../../definitions/constants";

let suggestionId = "";
let currentSuggestion = "";

interface SuggestionResult {
  predictions: string[];
}

interface RequestParams {
  context: string;
  prompt: string;
}

interface WisdomTelemetryEvent {
  request?: RequestParams;
  requestDateTime?: string;
  response?: SuggestionResult;
  responseDateTime?: string;
  documentUri?: string;
  suggestionDisplayed?: string;
  acceptedSuggestion?: boolean;
  suggestionId?: string;
  feedback?: string;
}
let telemetryData: WisdomTelemetryEvent = {};

export function inlineSuggestionProvider(): vscode.InlineCompletionItemProvider {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (
      document,
      position,
      context,
      token
    ) => {
      let insertText = "";
      const commentRegexEp =
        /(?<blank>\s*)(?<comment>#\s*)(?<description>.*)(?<end>$)/;
      const taskRegexEp =
        /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;
      const lineBefore = document.lineAt(position.line - 1).text;
      let matchedPattern = lineBefore.match(taskRegexEp);
      let isTaskNameMatch = false;

      if (position.line <= 0) {
        return;
      }
      if (matchedPattern) {
        isTaskNameMatch = true;
      } else {
        matchedPattern = lineBefore.match(commentRegexEp);
      }
      const prompt = matchedPattern?.groups?.description;
      if (!prompt) {
        return [];
      }
      if (token?.isCancellationRequested) {
        return [];
      }
      telemetryData = {};
      suggestionId = uuidv4();
      telemetryData["suggestionId"] = suggestionId;
      telemetryData["documentUri"] = document.uri.toString();
      const documentContext = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
      );
      telemetryData["request"] = {
        context: documentContext,
        prompt: prompt,
      };
      telemetryData["requestDateTime"] = getCurrentUTCDateTime();
      const result = await requestInlineSuggest(
        documentContext,
        position,
        prompt
      );
      telemetryData["response"] = result;
      telemetryData["responseDateTime"] = getCurrentUTCDateTime();
      wisdomManager.telemetry.sendTelemetry(
        "wisdomInlineSuggestionTriggerEvent",
        telemetryData
      );
      // reset telemetry data
      telemetryData = {};

      if (result && result.predictions.length > 0) {
        insertText = result.predictions[0];
        if (isTaskNameMatch) {
          insertText = removePromptFromSuggestion(
            result.predictions[0],
            lineBefore,
            position
          );
        }
        currentSuggestion = insertText;
        // let inlineSuggestionAcceptItem = new vscode.InlineCompletionItem(
        //   insertText
        // );
        // inlineSuggestionAcceptItem.command = {
        //   title: "Accept suggestion",
        //   command: "extension.onSuggestionAccepted",
        //   arguments: [suggestionId],
        // };
        //return [inlineSuggestionAcceptItem];

        let inlineSuggestionThumbsUporDownItem =
          new vscode.InlineCompletionItem(insertText);
        inlineSuggestionThumbsUporDownItem.command = {
          title: "Thumbs Up or down feedback",
          command: "extension.thumbsUpOrDown",
          arguments: [suggestionId],
        };
        return [inlineSuggestionThumbsUporDownItem];
        // return [
        //   {
        //     insertText,
        //   },
        // ];
      } else {
        return [];
      }
    },
  };
  return provider;
}

export async function requestInlineSuggest(
  documentContext: string,
  position: Position,
  prompt: string
): Promise<any> {
  console.log("provideInlineCompletionItems triggered");
  wisdomManager.wisdomStatusBar.tooltip = "processing...";
  const result = await getInlineSuggestion(documentContext, prompt);
  wisdomManager.wisdomStatusBar.tooltip = "Done";
  return result;
}
async function getInlineSuggestion(
  context: string,
  prompt: string
): Promise<any> {
  const inputData = {
    context: context,
    prompt: prompt,
  };
  console.debug(
    `request data from wisdom service:\n${JSON.stringify(inputData)}`
  );
  const outputData: SuggestionResult = await wisdomManager.apiInstance.postData(
    "/completions/",
    inputData
  );
  console.debug(
    `response data from wisdom service:\n${JSON.stringify(outputData)}`
  );
  return outputData;
}

// export function inlineSuggestionActionHandler(
//   event: vscode.TextDocumentChangeEvent
// ): void {
//   if (
//     suggestionText !== "" &&
//     event.contentChanges &&
//     event.contentChanges[0]?.text === suggestionText
//   ) {
//     telemetryData = {};
//     console.log(`User accepted suggestion with ID: ${suggestionId}`);
//     telemetryData["acceptedSuggestion"] = true;
//     telemetryData["suggestionId"] = suggestionId;
//     wisdomManager.telemetry.sendTelemetry(
//       "wisdomInlineSuggestionAcceptEvent",
//       telemetryData
//     );
//   }
//   // else {
//   //   if (suggestionId !== "") {
//   //     telemetryData = {};
//   //     console.log(`User rejected suggestion with ID: ${suggestionId}`);
//   //     telemetryData["acceptedSuggestion"] = false;
//   //     telemetryData["suggestionId"] = suggestionId;
//   //     wisdomManager.telemetry.sendTelemetry(
//   //       "wisdomInlineSuggestionRejectEvent",
//   //       telemetryData
//   //     );
//   //   }
//   // }
//   // reset telemetry data
//   telemetryData = {};

//   suggestionId = "";
//   suggestionText = "";
// }

// export async function inlineSuggestionCommitHandler(
//   textEditor: vscode.TextEditor,
//   edit: vscode.TextEditorEdit
// ) {
//   telemetryData = {};
//   console.log(`User accepted suggestion with ID: ${suggestionId}`);
//   telemetryData["suggestionId"] = suggestionId;
//   telemetryData["acceptedSuggestion"] = true;
//   wisdomManager.telemetry.sendTelemetry(
//     "wisdomInlineSuggestionAcceptEvent",
//     telemetryData
//   );
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) {
//     return;
//   }
//   const position = editor?.selection.active;
//   editor?.insertSnippet(new vscode.SnippetString(currentSuggestion), position);
//   // Reset current suggestion
//   currentSuggestion = "";

//   // Reset telemetry data
//   telemetryData = {};

//   // Reset suggestion ID
//   suggestionId = "";
// }

// export function inlineSuggestionHideHandler(editor: vscode.TextEditor): void {
//   telemetryData = {};
//   console.log(`User rejected suggestion with ID: ${suggestionId}`);
//   telemetryData["suggestionId"] = suggestionId;
//   telemetryData["acceptedSuggestion"] = false;
//   wisdomManager.telemetry.sendTelemetry(
//     "wisdomInlineSuggestionAcceptEvent",
//     telemetryData
//   );
//   return;
// }

export async function thumbsUpOrDownHandler(suggestionId: string) {
  console.log(`User gave feedback on suggestion with ID: ${suggestionId}`);
  try {
    const selection = await vscode.window.showInformationMessage(
      "Thumbs Up or Down",
      "Thumbs Up",
      "Thumbs Down"
    );
    if (selection === "Thumbs Up") {
      telemetryData = {};
      telemetryData["acceptedSuggestion"] = true;
      telemetryData["suggestionId"] = suggestionId;
      wisdomManager.telemetry.sendTelemetry(
        "wisdomInlineSuggestionThumbsUpEvent",
        telemetryData
      );
      console.log(`Sending telemetry data: ${JSON.stringify(telemetryData)}`);
      await vscode.window.showInformationMessage("Thanks for the feedback!");
    } else if (selection === "Thumbs Down") {
      telemetryData = {};
      telemetryData["acceptedSuggestion"] = false;
      telemetryData["suggestionId"] = suggestionId;
      const feedback = await vscode.window.showInputBox({
        placeHolder: "Please provide feedback",
      });
      if (feedback) {
        telemetryData["feedback"] = feedback;
        wisdomManager.telemetry.sendTelemetry(
          "wisdomInlineSuggestionThumbsDownEvent",
          telemetryData
        );
        console.log(`Sending telemetry data: ${JSON.stringify(telemetryData)}`);
        telemetryData = {};
        await vscode.window.showInformationMessage(
          `Thanks for the feedback: ${feedback}`
        );
      }
    }
  } catch (error) {
    // handle errors
    console.error(error);
  }
}
