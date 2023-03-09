import * as vscode from "vscode";
import { window } from "vscode";

import { v4 as uuidv4 } from "uuid";

import {
  convertToSnippetString,
  removePromptFromSuggestion,
} from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager } from "../../extension";
import { WisdomCommands } from "../../definitions/constants";
import { resetKeyInput, getKeyInput } from "../../utils/keyInputUtils";
import {
  SuggestionResult,
  WisdomTelemetryEvent,
  RequestParams,
} from "../../definitions/wisdom";

let suggestionId = "";
let currentSuggestion = "";
const taskRegexEp =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

let telemetryData: WisdomTelemetryEvent = {};
export function inlineSuggestionProvider(): vscode.InlineCompletionItemProvider {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (
      document,
      position,
      context,
      token
    ) => {
      if (token.isCancellationRequested) {
        return [];
      }
      const keyInput = getKeyInput();
      if (keyInput !== "enter") {
        return [];
      }
      resetKeyInput();
      if (window.activeTextEditor?.document.languageId !== "ansible") {
        wisdomManager.wisdomStatusBar.hide();
        return [];
      }
      return getInlineSuggestionItems(document, position);
    },
  };
  return provider;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function inlineSuggestionTriggerHandler(
  textEditor: vscode.TextEditor
): Promise<vscode.InlineCompletionItem[]> {
  const document = textEditor.document;
  const position = textEditor.selection.active;

  return getInlineSuggestionItems(document, position);
}

async function getInlineSuggestionItems(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
  if (document.languageId !== "ansible") {
    wisdomManager.wisdomStatusBar.hide();
    return [];
  }
  const wisdomSetting = wisdomManager.settingsManager.settings.wisdomService;
  if (!wisdomSetting.enabled && !wisdomSetting.suggestions.enabled) {
    console.debug("wisdom service is disabled");
    wisdomManager.updateWisdomStatusbar();
    return [];
  }
  console.log("provideInlineCompletionItems triggered by user edits");
  const lineToExtractPrompt = document.lineAt(position.line - 1);
  const taskMatchedPattern = lineToExtractPrompt.text.match(taskRegexEp);

  // prompt is the format expected by wisdom service
  // eg. "-name: create a new file"
  let prompt: string | undefined = undefined;

  // promptDescription is the task name or comment
  // eg. "create a new file" and is used to identify
  // the duplicate suggestion line from the wisdom service
  // response and remove it from the inline suggestion list
  let promptDescription: string | undefined = undefined;

  if (taskMatchedPattern) {
    promptDescription = taskMatchedPattern?.groups?.description;
    prompt = `${lineToExtractPrompt.text}`;
  } else {
    return [];
  }
  if (!prompt) {
    return [];
  }
  if (promptDescription === undefined) {
    promptDescription = prompt;
  }
  const inlineSuggestionItems = await getInlineSuggestions(document, position);
  return inlineSuggestionItems;
}
export async function requestInlineSuggest(
  documentContent: string
): Promise<SuggestionResult> {
  wisdomManager.wisdomStatusBar.tooltip = "processing...";
  const result = await getInlineSuggestion(documentContent);
  wisdomManager.wisdomStatusBar.tooltip = "Done";
  return result;
}
async function getInlineSuggestion(content: string): Promise<SuggestionResult> {
  const inputData: RequestParams = {
    prompt: content,
    userId: await (
      await wisdomManager.telemetry.redhatService.getIdManager()
    ).getRedHatUUID(),
    suggestionId: suggestionId,
  };
  console.log(
    `${getCurrentUTCDateTime()}: request data to wisdom service:\n${JSON.stringify(
      inputData
    )}`
  );
  const outputData: SuggestionResult = await wisdomManager.apiInstance.postData(
    "/completions/",
    inputData
  );
  console.log(
    `${getCurrentUTCDateTime()}: response data from wisdom service:\n${JSON.stringify(
      outputData
    )}`
  );
  return outputData;
}

async function getInlineSuggestions(
  document: vscode.TextDocument,
  currentPosition: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
  let result: SuggestionResult = {
    predictions: [],
  };
  telemetryData = {};
  const requestTime = getCurrentUTCDateTime();
  telemetryData["requestDateTime"] = requestTime.toISOString();
  try {
    suggestionId = uuidv4();
    telemetryData["suggestionId"] = suggestionId;
    telemetryData["documentUri"] = document.uri.toString();
    const range = new vscode.Range(new vscode.Position(0, 0), currentPosition);

    const documentContent = range.isEmpty ? "" : document.getText(range).trim();
    telemetryData["request"] = {
      prompt: documentContent,
    };

    wisdomManager.wisdomStatusBar.text = "Processing...";
    result = await requestInlineSuggest(documentContent);
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  } catch (error) {
    console.error(error);
    telemetryData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return [];
  } finally {
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  }

  telemetryData["response"] = result;
  const responseTime = getCurrentUTCDateTime();
  telemetryData["responseDateTime"] = responseTime.toISOString();
  telemetryData["duration"] = responseTime.getTime() - requestTime.getTime();
  wisdomManager.telemetry.sendTelemetry(
    "wisdomInlineSuggestionTriggerEvent",
    telemetryData
  );
  // Note: Do not reset suggestionId here as it is used to track user action
  //       and will be rest in the user action handlers.
  // reset telemetry data
  telemetryData = {};
  const inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  const insertTexts: string[] = [];
  if (result && result.predictions.length > 0) {
    result.predictions.forEach((prediction) => {
      let insertText = prediction;
      insertText = removePromptFromSuggestion(prediction, currentPosition);
      insertTexts.push(insertText);

      // completion item is converted from PLAIN-TEXT to SNIPPET-STRING
      // in order to support tab-stops for automatically placing and switching cursor positions
      const inlineSuggestionItem = new vscode.InlineCompletionItem(
        new vscode.SnippetString(convertToSnippetString(insertText))
      );
      inlineSuggestionUserActionItems.push(inlineSuggestionItem);
    });
    // currently we only support one inline suggestion
    // currentSuggestion is used in user action handlers
    // to track the suggestion that user is currently working on
    currentSuggestion = insertTexts[0];
  }
  console.log(currentSuggestion);
  return inlineSuggestionUserActionItems;
}

export async function inlineSuggestionCommitHandler(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  textEditor: vscode.TextEditor,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  edit: vscode.TextEditorEdit
) {
  if (window.activeTextEditor?.document.languageId !== "ansible") {
    return [];
  }
  console.log("inlineSuggestionCommitHandler triggered");
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Commit the suggestion
  vscode.commands.executeCommand("editor.action.inlineSuggest.commit");

  // Send telemetry for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, true);
}

export async function inlineSuggestionHideHandler(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  textEditor: vscode.TextEditor,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  edit: vscode.TextEditorEdit
) {
  if (window.activeTextEditor?.document.languageId !== "ansible") {
    return [];
  }
  console.log("inlineSuggestionHideHandler triggered");
  vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

  // Send telemetry for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, false);
}
export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted = false
) {
  console.log(`User gave feedback on suggestion with ID: ${suggestionId}`);
  telemetryData = {};
  if (isSuggestionAccepted) {
    telemetryData["userAction"] = "accept";
  } else {
    telemetryData["userAction"] = "ignore";
  }
  telemetryData["suggestionId"] = suggestionId;
  wisdomManager.telemetry.sendTelemetry(
    "wisdomInlineSuggestionUserActionEvent",
    telemetryData
  );
  console.debug(
    `Sent wisdomInlineSuggestionUserActionEvent telemetry event data: ${JSON.stringify(
      telemetryData
    )}`
  );
  telemetryData = {};
}
