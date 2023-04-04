import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

import { adjustInlineSuggestionIndent } from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager } from "../../extension";
import {
  CompletionResponseParams,
  InlineSuggestionEvent,
  CompletionRequestParams,
  UserAction,
} from "../../definitions/wisdom";
import { WisdomCommands } from "../../definitions/constants";
import { shouldRequestInlineSuggestions } from "./utils/data";

const TASK_REGEX_EP =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

let suggestionId = "";
let currentSuggestion = "";
let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayTime: Date;
let inlineSuggestionDisplayed = false;
let previousTriggerPosition: vscode.Position;
let cachedCompletionItem: vscode.InlineCompletionItem[];

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
      inlineSuggestionDisplayed = false;
      return [];
    }

    if (token.isCancellationRequested) {
      inlineSuggestionDisplayed = false;
      return [];
    }
    if (document.languageId !== "ansible") {
      wisdomManager.wisdomStatusBar.hide();
      inlineSuggestionDisplayed = false;
      return [];
    }
    const wisdomSetting = wisdomManager.settingsManager.settings.wisdomService;
    if (!wisdomSetting.enabled || !wisdomSetting.suggestions.enabled) {
      console.debug("[project-wisdom] Project Wisdom service is disabled.");
      wisdomManager.updateWisdomStatusbar();
      inlineSuggestionDisplayed = false;
      return [];
    }

    if (!wisdomSetting.basePath) {
      vscode.window.showErrorMessage(
        "Base path for Project Wisdom service is empty. Please provide a base path"
      );
      inlineSuggestionDisplayed = false;
      return [];
    }

    // If users continue to without pressing configured keys to
    // either accept or reject the suggestion, we will consider it as ignored.
    if (inlineSuggestionDisplayed) {
      /* The following approach is implemented to address a specific issue related to the
       * behavior of inline suggestion in the 'automated' trigger scenario:
       *
       * Whenever the toolbar appears on the suggestion, the method provideInlineCompletionItems
       * is called again with trigger kind as 'invoke'. This results in a new request for inline
       * suggestion, causing the current suggestion to disappear.
       *
       * To resolve this issue, we have implemented a mechanism to keep track of the previous and current
       * cursor position of the trigger. We cache and return the same completion item when the cursor
       * position remains unchanged, thus avoiding the disappearance of the current suggestion.
       *
       * It is important to note that the entire flow is triggered whenever the user makes any changes.
       * As a result, we always make a new request for inline suggestion whenever any changes are made
       * in the editor.
       */

      if (_.isEqual(position, previousTriggerPosition)) {
        return cachedCompletionItem;
      }

      vscode.commands.executeCommand(WisdomCommands.WISDOM_SUGGESTION_HIDE);
      return [];
    }
    const lineToExtractPrompt = document.lineAt(position.line - 1);
    const taskMatchedPattern = lineToExtractPrompt.text.match(TASK_REGEX_EP);

    const currentLineText = document.lineAt(position);

    if (!taskMatchedPattern || !currentLineText.isEmptyOrWhitespace) {
      inlineSuggestionDisplayed = false;
      return [];
    }
    inlineSuggestionData = {};
    inlineSuggestionDisplayTime = getCurrentUTCDateTime();
    const suggestionItems = getInlineSuggestionItems(document, position);
    return suggestionItems;
  }
}

async function getInlineSuggestionItems(
  document: vscode.TextDocument,
  currentPosition: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
  let result: CompletionResponseParams = {
    predictions: [],
  };
  inlineSuggestionData = {};
  suggestionId = "";
  const requestTime = getCurrentUTCDateTime();
  console.log(
    "[inline-suggestions] Inline suggestions triggered by user edits."
  );
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

    if (!shouldRequestInlineSuggestions(documentContent)) {
      return [];
    }
    wisdomManager.wisdomStatusBar.text = "$(loading~spin) Wisdom";
    result = await requestInlineSuggest(
      documentContent,
      documentUri,
      activityId
    );
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  } catch (error) {
    inlineSuggestionData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return [];
  } finally {
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  }
  if (!result || !result.predictions || result.predictions.length === 0) {
    console.error("[inline-suggestions] Inline suggestions not found.");
    return [];
  }

  const responseTime = getCurrentUTCDateTime();
  inlineSuggestionData["latency"] =
    responseTime.getTime() - requestTime.getTime();

  const inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  const insertTexts: string[] = [];
  result.predictions.forEach((prediction) => {
    let insertText = prediction;
    insertText = adjustInlineSuggestionIndent(prediction, currentPosition);
    insertTexts.push(insertText);

    const inlineSuggestionItem = new vscode.InlineCompletionItem(insertText);
    inlineSuggestionUserActionItems.push(inlineSuggestionItem);
  });
  // currentSuggestion is used in user action handlers
  // to track the suggestion that user is currently working on
  currentSuggestion = insertTexts[0];

  // previousTriggerPosition is used to track the cursor position
  // on hover when the suggestion is displayed
  previousTriggerPosition = currentPosition;

  console.log(
    `[inline-suggestions] Received Inline Suggestion\n:${currentSuggestion}`
  );
  cachedCompletionItem = inlineSuggestionUserActionItems;
  wisdomManager.attributionsProvider.suggestionDetails = [
    {
      suggestionId: suggestionId,
      suggestion: currentSuggestion,
    },
  ];
  // if the suggestion is not empty then we set the flag to true
  // indicating that the suggestion is displayed and will be used
  // to track the user action on the suggestion in scenario where
  // the user continued to type without accepting or rejecting the suggestion
  inlineSuggestionDisplayed = true;
  return inlineSuggestionUserActionItems;
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
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion request send to Project Wisdom service.`
  );

  wisdomManager.wisdomStatusBar.tooltip = "processing...";
  const outputData: CompletionResponseParams =
    await wisdomManager.apiInstance.completionRequest(completionData);
  wisdomManager.wisdomStatusBar.tooltip = "Done";

  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion response received from Project Wisdom service.`
  );
  return outputData;
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
  console.log(
    "[inline-suggestions] Inline Suggestion Handler triggered using command."
  );
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
  console.log("[inline-suggestions] User accepted the inline suggestion.");
  vscode.commands.executeCommand("editor.action.inlineSuggest.commit");

  vscode.commands.executeCommand(WisdomCommands.WISDOM_FETCH_TRAINING_MATCHES);

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, true);
}

export async function inlineSuggestionHideHandler() {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }

  // Hide the suggestion
  console.log("[inline-suggestions] User ignored the inline suggestion.");
  vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, false);
}

export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted = false
) {
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
    `[project-wisdom-feedback] User action event wisdomInlineSuggestionFeedbackEvent sent.`
  );
  inlineSuggestionData = {};
}
