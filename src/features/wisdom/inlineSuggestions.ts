import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";

import { adjustInlineSuggestionIndent } from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager } from "../../extension";
import {
  CompletionResponseParams,
  InlineSuggestionEvent,
  CompletionRequestParams,
  UserAction,
} from "../../definitions/wisdom";

const TASK_REGEX_EP =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

let suggestionId = "";
let currentSuggestion = "";
let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayTime: Date;
let inlineSuggestionDisplayed = false; // eslint-disable-line @typescript-eslint/no-unused-vars

export class WisdomInlineSuggestionProvider
  implements vscode.InlineCompletionItemProvider
{
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlineCompletionItem[]> {
    if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
      wisdomManager.wisdomStatusBar.hide();
      return [];
    }

    if (token.isCancellationRequested) {
      return [];
    }

    inlineSuggestionDisplayed = true;
    inlineSuggestionData = {};
    inlineSuggestionDisplayTime = getCurrentUTCDateTime();
    return getInlineSuggestionItems(document, position);
  }
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
  if (!wisdomSetting.enabled || !wisdomSetting.suggestions.enabled) {
    console.debug("wisdom service is disabled");
    wisdomManager.updateWisdomStatusbar();
    return [];
  }
  console.log("provideInlineCompletionItems triggered by user edits");
  const lineToExtractPrompt = document.lineAt(position.line - 1);
  const taskMatchedPattern = lineToExtractPrompt.text.match(TASK_REGEX_EP);

  const currentLineText = document.lineAt(position);

  if (!taskMatchedPattern || !currentLineText.isEmptyOrWhitespace) {
    return [];
  }

  // trigger wisdom service for task suggestions
  const inlineSuggestionItems = await getInlineSuggestions(document, position);
  return inlineSuggestionItems;
}

async function requestInlineSuggest(
  content: string,
  documentUri: string,
  activityId: string
): Promise<CompletionResponseParams> {
  const completionData: CompletionRequestParams = {
    prompt: content,
    suggestionId: suggestionId,
    metadata: {
      documentUri: documentUri,
      activityId: activityId,
    },
  };
  console.log(
    `${getCurrentUTCDateTime().toISOString()}: request data to wisdom service:\n${JSON.stringify(
      completionData
    )}`
  );

  wisdomManager.wisdomStatusBar.tooltip = "processing...";
  const outputData: CompletionResponseParams =
    await wisdomManager.apiInstance.completionRequest(completionData);
  wisdomManager.wisdomStatusBar.tooltip = "Done";

  console.log(
    `${getCurrentUTCDateTime().toISOString()}: response data from wisdom service:\n${JSON.stringify(
      outputData
    )}`
  );
  return outputData;
}

async function getInlineSuggestions(
  document: vscode.TextDocument,
  currentPosition: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
  let result: CompletionResponseParams = {
    predictions: [],
  };
  inlineSuggestionData = {};
  suggestionId = "";
  const requestTime = getCurrentUTCDateTime();
  try {
    suggestionId = uuidv4();
    const documentUri = document.uri.toString();
    let activityId: string | undefined = undefined;
    inlineSuggestionData["suggestionId"] = suggestionId;
    inlineSuggestionData["documentUri"] = documentUri;

    if (!(documentUri in wisdomManager.wisdomActivityTracker)) {
      activityId = uuidv4();
      wisdomManager.wisdomActivityTracker[documentUri] = activityId;
    } else {
      activityId = wisdomManager.wisdomActivityTracker[documentUri];
    }
    inlineSuggestionData["activityId"] = activityId;
    const range = new vscode.Range(new vscode.Position(0, 0), currentPosition);

    const documentContent = range.isEmpty
      ? ""
      : document.getText(range).trimEnd();

    wisdomManager.wisdomStatusBar.text = "$(loading~spin) Wisdom";
    result = await requestInlineSuggest(
      documentContent,
      documentUri,
      activityId
    );
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  } catch (error) {
    console.error(error);
    inlineSuggestionData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return [];
  } finally {
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  }

  const responseTime = getCurrentUTCDateTime();
  inlineSuggestionData["latency"] =
    responseTime.getTime() - requestTime.getTime();

  const inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  const insertTexts: string[] = [];
  if (result && result.predictions.length > 0) {
    result.predictions.forEach((prediction) => {
      let insertText = prediction;
      insertText = adjustInlineSuggestionIndent(prediction, currentPosition);
      insertTexts.push(insertText);

      const inlineSuggestionItem = new vscode.InlineCompletionItem(insertText);
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

// Handlers

export async function inlineSuggestionTriggerHandler() {
  // This trigger handler is called when the user explicitly triggers inline suggestion through command
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Trigger the suggestion explicitly
  console.log("inlineSuggestion Handler triggered Explicitly");
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
}

export async function inlineSuggestionCommitHandler() {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Commit the suggestion
  console.log("inlineSuggestion Commit Handler triggered");
  vscode.commands.executeCommand("editor.action.inlineSuggest.commit");

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, true);
}

export async function inlineSuggestionHideHandler() {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }

  // Hide the suggestion
  console.log("inlineSuggestion Hide Handler triggered");
  vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, false);
}

export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted = false
) {
  console.log(`User gave feedback on suggestion with ID: ${suggestionId}`);
  inlineSuggestionData["userActionTime"] =
    getCurrentUTCDateTime().getTime() - inlineSuggestionDisplayTime.getTime();

  // since user has either accepted or ignored the suggestion
  // inline suggestion is no longer displayed and we can reset the
  // the flag here
  inlineSuggestionDisplayed = false;
  if (isSuggestionAccepted) {
    inlineSuggestionData["action"] = UserAction.ACCEPT;
  } else {
    inlineSuggestionData["action"] = UserAction.IGNORE;
  }
  inlineSuggestionData["suggestionId"] = suggestionId;
  const inlineSuggestionFeedbackPayload = {
    inlineSuggestion: inlineSuggestionData,
  };
  wisdomManager.apiInstance.feedbackRequest(inlineSuggestionFeedbackPayload);
  console.debug(
    `Sent wisdomInlineSuggestionFeedbackEvent data: ${JSON.stringify(
      inlineSuggestionFeedbackPayload
    )}`
  );
  inlineSuggestionData = {};
}
