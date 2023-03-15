import * as vscode from "vscode";

import { v4 as uuidv4 } from "uuid";

import { adjustInlineSuggestionIndent } from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager } from "../../extension";
import { WisdomCommands } from "../../definitions/constants";
import { resetKeyInput, getKeyInput } from "../../utils/keyInputUtils";
import {
  CompletionResponseParams,
  InlineSuggestionEvent,
  CompletionRequestParams,
  UserAction,
} from "../../definitions/wisdom";

let suggestionId = "";
let currentSuggestion = "";
const taskRegexEp =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayed = false;
let inlineSuggestionDisplayTime: Date;

export class WisdomInlineSuggestionProvider
  implements vscode.InlineCompletionItemProvider
{
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlineCompletionItem[]> {
    if (token.isCancellationRequested) {
      return [];
    }
    // If users continue to without pressing configured keys to
    // either accept or reject the suggestion, we will consider it as ignored.
    if (inlineSuggestionDisplayed) {
      vscode.commands.executeCommand(WisdomCommands.WISDOM_SUGGESTION_HIDE);
      inlineSuggestionDisplayed = false;
    }
    const keyInput = getKeyInput();
    if (keyInput !== "enter") {
      return [];
    }
    resetKeyInput();
    // reset the feedback data
    inlineSuggestionData = {};
    if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
      wisdomManager.wisdomStatusBar.hide();
      return [];
    }
    inlineSuggestionDisplayed = true;
    inlineSuggestionDisplayTime = getCurrentUTCDateTime();
    return getInlineSuggestionItems(document, position);
  }
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

    wisdomManager.wisdomStatusBar.text = "Processing...";
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

export async function inlineSuggestionCommitHandler(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  textEditor: vscode.TextEditor,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  edit: vscode.TextEditorEdit
) {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return [];
  }
  console.log("inlineSuggestionCommitHandler triggered");
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // Commit the suggestion
  vscode.commands.executeCommand("editor.action.inlineSuggest.commit");

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(document, suggestionId, true);
}

export async function inlineSuggestionHideHandler(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  textEditor: vscode.TextEditor,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  edit: vscode.TextEditorEdit
) {
  console.log("inlineSuggestionHideHandler triggered");
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return [];
  }

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
