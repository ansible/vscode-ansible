import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

import { adjustInlineSuggestionIndent } from "../utils/lightspeed";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { lightSpeedManager } from "../../extension";
import {
  CompletionResponseParams,
  InlineSuggestionEvent,
  CompletionRequestParams,
  UserAction,
} from "../../definitions/lightspeed";
import { LightSpeedCommands } from "../../definitions/constants";
import { shouldRequestInlineSuggestions } from "./utils/data";

const TASK_REGEX_EP =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

let suggestionId = "";
let currentSuggestion = "";
let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayTime: Date;
let _inlineSuggestionDisplayed = false;
let previousTriggerPosition: vscode.Position;
let _cachedCompletionItem: vscode.InlineCompletionItem[];

export class LightSpeedInlineSuggestionProvider
  implements vscode.InlineCompletionItemProvider
{
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlineCompletionItem[]> {
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      resetInlineSuggestionDisplayed();
      return [];
    }
    if (activeTextEditor.document.languageId !== "ansible") {
      lightSpeedManager.lightSpeedStatusBar.hide();
      resetInlineSuggestionDisplayed();
      return [];
    }

    if (token.isCancellationRequested) {
      resetInlineSuggestionDisplayed();
      return [];
    }
    if (document.languageId !== "ansible") {
      lightSpeedManager.lightSpeedStatusBar.hide();
      resetInlineSuggestionDisplayed();
      return [];
    }
    const lightSpeedSetting =
      lightSpeedManager.settingsManager.settings.lightSpeedService;
    if (!lightSpeedSetting.enabled || !lightSpeedSetting.suggestions.enabled) {
      console.debug("[ansible-lightspeed] Ansible Lightspeed is disabled.");
      lightSpeedManager.updateLightSpeedStatusbar();
      resetInlineSuggestionDisplayed();
      return [];
    }

    if (!lightSpeedSetting.url.trim()) {
      vscode.window.showErrorMessage(
        "Ansible Lightspeed URL is empty. Please provide a URL."
      );
      resetInlineSuggestionDisplayed();
      return [];
    }
    // If users continue to without pressing configured keys to
    // either accept or reject the suggestion, we will consider it as ignored.
    if (getInlineSuggestionDisplayed()) {
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
        return _cachedCompletionItem;
      }

      vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE
      );
      return [];
    }
    const lineToExtractPrompt = document.lineAt(position.line - 1);
    const taskMatchedPattern = lineToExtractPrompt.text.match(TASK_REGEX_EP);

    const currentLineText = document.lineAt(position);

    if (!taskMatchedPattern || !currentLineText.isEmptyOrWhitespace) {
      resetInlineSuggestionDisplayed();
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

    if (!(documentUri in lightSpeedManager.lightSpeedActivityTracker)) {
      activityId = uuidv4();
      lightSpeedManager.lightSpeedActivityTracker[documentUri] = activityId;
    } else {
      activityId = lightSpeedManager.lightSpeedActivityTracker[documentUri];
    }
    inlineSuggestionData["activityId"] = activityId;
    const range = new vscode.Range(new vscode.Position(0, 0), currentPosition);

    const documentContent = range.isEmpty
      ? ""
      : document.getText(range).trimEnd();

    if (!shouldRequestInlineSuggestions(documentContent)) {
      return [];
    }
    lightSpeedManager.lightSpeedStatusBar.text = "$(loading~spin) Lightspeed";
    result = await requestInlineSuggest(
      documentContent,
      documentUri,
      activityId
    );
    lightSpeedManager.lightSpeedStatusBar.text = "Lightspeed";
  } catch (error) {
    inlineSuggestionData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return [];
  } finally {
    lightSpeedManager.lightSpeedStatusBar.text = "Lightspeed";
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
  lightSpeedManager.attributionsProvider.suggestionDetails = [
    {
      suggestionId: suggestionId,
      suggestion: currentSuggestion,
    },
  ];
  // if the suggestion is not empty then we set the flag to true
  // indicating that the suggestion is displayed and will be used
  // to track the user action on the suggestion in scenario where
  // the user continued to type without accepting or rejecting the suggestion
  setInlineSuggestionDisplayed(inlineSuggestionUserActionItems);
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
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion request sent to Ansible Lightspeed service.`
  );

  lightSpeedManager.lightSpeedStatusBar.tooltip = "processing...";
  const outputData: CompletionResponseParams =
    await lightSpeedManager.apiInstance.completionRequest(completionData);
  lightSpeedManager.lightSpeedStatusBar.tooltip = "Done";

  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion response received from Ansible Lightspeed service.`
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

  vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES
  );

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
  resetInlineSuggestionDisplayed();
  if (isSuggestionAccepted) {
    inlineSuggestionData["action"] = UserAction.ACCEPT;
  } else {
    inlineSuggestionData["action"] = UserAction.IGNORE;
  }
  inlineSuggestionData["suggestionId"] = suggestionId;
  const inlineSuggestionFeedbackPayload = {
    inlineSuggestion: inlineSuggestionData,
  };
  lightSpeedManager.apiInstance.feedbackRequest(
    inlineSuggestionFeedbackPayload
  );
  console.debug(
    `[ansible-lightspeed-feedback] User action event lightSpeedInlineSuggestionFeedbackEvent sent.`
  );
  inlineSuggestionData = {};
}

export function resetInlineSuggestionDisplayed() {
  _inlineSuggestionDisplayed = false;
  _cachedCompletionItem = [];
}

function setInlineSuggestionDisplayed(
  inlineCompletionItem: vscode.InlineCompletionItem[]
) {
  _inlineSuggestionDisplayed = true;
  _cachedCompletionItem = inlineCompletionItem;
}

export function getInlineSuggestionDisplayed() {
  return _inlineSuggestionDisplayed;
}
