import * as pathUri from "path";
import crypto from "crypto";
import { URI } from "vscode-uri";
import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import * as yaml from "yaml";
import { adjustInlineSuggestionIndent } from "../utils/lightspeed";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { lightSpeedManager } from "../../extension";
import {
  CompletionResponseParams,
  InlineSuggestionEvent,
  CompletionRequestParams,
} from "../../interfaces/lightspeed";
import {
  LightSpeedCommands,
  LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT,
  LIGHTSPEED_SUGGESTION_TYPE,
  MULTI_TASK_REGEX_EP,
  SINGLE_TASK_REGEX_EP,
  UserAction,
} from "../../definitions/lightspeed";
import {
  shouldRequestInlineSuggestions,
  shouldTriggerMultiTaskSuggestion,
} from "./utils/data";
import { IAnsibleFileType } from "../../interfaces/lightspeed";
import { getAnsibleFileType } from "../utils/ansible";
import { LightSpeedServiceSettings } from "../../interfaces/extensionSettings";
import { SuggestionDisplayed } from "./inlineSuggestion/suggestionDisplayed";

let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayTime: Date;
let previousTriggerPosition: vscode.Position;
let insertTexts: string[] = [];
let _documentChanged = false;
export const suggestionDisplayed = new SuggestionDisplayed();

interface DocumentInfo {
  ansibleFileType: IAnsibleFileType;
  documentContent: string;
  documentDirPath: string;
  documentFilePath: string;
  documentUri: string;
  parsedAnsibleDocument: yaml.YAMLMap[];
}

interface SuggestionMatchInfo {
  currentLineText: vscode.TextLine;
  lineToExtractPrompt: vscode.TextLine;
  taskMatchedPattern: RegExpMatchArray | null;
  spacesBeforeCursor: number;
  spacesBeforePromptStart: number;
  suggestionMatchType: LIGHTSPEED_SUGGESTION_TYPE | undefined;
}

interface InlinePosition {
  document: vscode.TextDocument;
  position: vscode.Position;
  context: vscode.InlineCompletionContext;
}

export interface CallbackEntry {
  (
    suggestionDisplayed: SuggestionDisplayed,
    inlinePosition: InlinePosition,
  ): Promise<vscode.InlineCompletionItem[]>;
}

export const onTextEditorNotActive: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  suggestionDisplayed.reset();
  return [];
};

const onNotForMe: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  lightSpeedManager.statusBarProvider.statusBar.hide();
  suggestionDisplayed.reset();
  return [];
};

const onCancellationRequested: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  suggestionDisplayed.reset();
  return [];
};

const onLightspeedIsDisabled: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  console.debug("[ansible-lightspeed] Ansible Lightspeed is disabled.");
  lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar();
  suggestionDisplayed.reset();
  return [];
};

const onLightspeedURLMisconfigured: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  vscode.window.showErrorMessage(
    "Ansible Lightspeed URL is empty. Please provide a URL.",
  );
  suggestionDisplayed.reset();
  return [];
};

const onCacheSuggestion: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
) {
  return suggestionDisplayed.cachedCompletionItem;
};

const onRefusedSuggestion: CallbackEntry = async function () {
  vscode.commands.executeCommand(LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE);
  return [];
};

const onRequestInProgress: CallbackEntry = async function () {
  lightSpeedManager.apiInstance.cancelSuggestionFeedbackInProgress();
  return [];
};

const onDefault: CallbackEntry = function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition,
) {
  const suggestionItems = getInlineSuggestionItems(inlinePosition);
  return suggestionItems;
};

const CompletionState = {
  TextEditorNotActive: onTextEditorNotActive,
  NotForMe: onNotForMe,
  CancellationRequested: onCancellationRequested,
  LightspeedIsDisabled: onLightspeedIsDisabled,
  LightspeedURLMisconfigured: onLightspeedURLMisconfigured,
  CacheSuggestion: onCacheSuggestion,
  RefusedSuggestion: onRefusedSuggestion,
  RequestInProgress: onRequestInProgress,
  Default: onDefault,
} as const;
type CompletionState = (typeof CompletionState)[keyof typeof CompletionState];

function getCompletionState(
  suggestionDisplayed: SuggestionDisplayed,
  suggestionFeedbackInProgress: boolean,
  languageId: string,
  isCancellationRequested: boolean,
  lightSpeedSetting: LightSpeedServiceSettings,
  positionHasChanged?: boolean,
): CompletionState {
  if (suggestionFeedbackInProgress) {
    return CompletionState.RequestInProgress;
  }
  if (languageId !== "ansible") {
    return CompletionState.NotForMe;
  }
  if (isCancellationRequested) {
    return CompletionState.CancellationRequested;
  }
  if (!lightSpeedSetting.enabled || !lightSpeedSetting.suggestions.enabled) {
    return CompletionState.LightspeedIsDisabled;
  }

  if (!lightSpeedSetting.URL.trim()) {
    return CompletionState.LightspeedURLMisconfigured;
  }

  // If users continue to without pressing configured keys to
  // either accept or reject the suggestion, we will consider it as ignored.
  if (suggestionDisplayed.get() && !positionHasChanged) {
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
    return CompletionState.CacheSuggestion;
  }

  if (suggestionDisplayed.get()) {
    return CompletionState.RefusedSuggestion;
  }

  return CompletionState.Default;
}

export class LightSpeedInlineSuggestionProvider
  implements vscode.InlineCompletionItemProvider
{
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ):
    | vscode.ProviderResult<vscode.InlineCompletionItem[]>
    | Promise<vscode.InlineCompletionItem[]> {
    const activeTextEditor = vscode.window.activeTextEditor;
    const lightSpeedSetting =
      lightSpeedManager.settingsManager.settings.lightSpeedService;

    const state = getCompletionState(
      suggestionDisplayed,
      lightSpeedManager.apiInstance.isSuggestionFeedbackInProgress(),
      (activeTextEditor && activeTextEditor.document.languageId) ||
        document.languageId,
      token.isCancellationRequested,
      lightSpeedSetting,
      !_.isEqual(position, previousTriggerPosition),
    );
    return state(suggestionDisplayed, {
      document: document,
      position: position,
      context: context,
    });
  }
}

const onUnexpectedPromptWithNoSeat: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition,
) {
  suggestionDisplayed.reset();
  // If the user has triggered the inline suggestion by pressing the configured keys,
  // we will show an information message to the user to help them understand the
  // correct cursor position to trigger the inline suggestion.
  if (
    inlinePosition.context.triggerKind ===
    vscode.InlineCompletionTriggerKind.Invoke
  ) {
    const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);
    if (
      !suggestionMatchInfo.taskMatchedPattern ||
      !suggestionMatchInfo.currentLineText.isEmptyOrWhitespace
    ) {
      vscode.window.showInformationMessage(
        "Cursor should be positioned on the line after the task name with the same indent as that of the task name line to trigger an inline suggestion.",
      );
    } else if (
      suggestionMatchInfo.taskMatchedPattern &&
      suggestionMatchInfo.currentLineText.isEmptyOrWhitespace &&
      suggestionMatchInfo.spacesBeforePromptStart !==
        suggestionMatchInfo.spacesBeforeCursor
    ) {
      vscode.window.showInformationMessage(
        `Cursor must be in column ${suggestionMatchInfo.spacesBeforePromptStart} to trigger an inline suggestion.`,
      );
    }
  }
  return [];
};

const onUnexpectedPromptWithSeat: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition,
) {
  suggestionDisplayed.reset();
  // If the user has triggered the inline suggestion by pressing the configured keys,
  // we will show an information message to the user to help them understand the
  // correct cursor position to trigger the inline suggestion.
  if (
    inlinePosition.context.triggerKind ===
    vscode.InlineCompletionTriggerKind.Invoke
  ) {
    const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);
    if (
      !suggestionMatchInfo.suggestionMatchType ||
      !suggestionMatchInfo.currentLineText.isEmptyOrWhitespace
    ) {
      vscode.window.showInformationMessage(
        "Cursor should be positioned on the line after the task name " +
          "or a comment line within task context to trigger an inline suggestion.",
      );
    } else if (
      suggestionMatchInfo.suggestionMatchType &&
      suggestionMatchInfo.currentLineText.isEmptyOrWhitespace &&
      suggestionMatchInfo.spacesBeforePromptStart !==
        suggestionMatchInfo.spacesBeforeCursor
    ) {
      vscode.window.showInformationMessage(
        `Cursor must be in column ${suggestionMatchInfo.spacesBeforePromptStart} ` +
          `to trigger an inline suggestion.`,
      );
    }
  }
  return [];
};

const onMultiTaskWithNoSeat: CallbackEntry = async function () {
  console.debug(
    "[inline-suggestions] Multitask suggestions not supported for a non seat user.",
  );
  return [];
};

const onShouldNotTriggerSuggestion: CallbackEntry = async function () {
  return [];
};

function retrieveActivityIdFromTracker(
  documentInfo: DocumentInfo,
  inlinePosition: InlinePosition,
): string {
  if (
    !(documentInfo.documentUri in lightSpeedManager.lightSpeedActivityTracker)
  ) {
    lightSpeedManager.lightSpeedActivityTracker[documentInfo.documentUri] = {
      activityId: uuidv4(),
      content: inlinePosition.document.getText(),
    };
  }
  return lightSpeedManager.lightSpeedActivityTracker[documentInfo.documentUri]
    .activityId;
}

async function requestSuggestion(
  documentInfo: DocumentInfo,
  inlinePosition: InlinePosition,
): Promise<CompletionResponseParams> {
  const rhUserHasSeat =
    await lightSpeedManager.lightspeedAuthenticatedUser.rhUserHasSeat();
  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText();
  const suggestionId = uuidv4();
  try {
    // If there is a suggestion, whose feedback is pending, send a feedback with IGNORED action
    // before making a new request
    await ignorePendingSuggestion();

    const activityId = retrieveActivityIdFromTracker(
      documentInfo,
      inlinePosition,
    );
    setInProgressSuggestionId(suggestionId);
    inlineSuggestionData["documentUri"] = documentInfo.documentUri;
    inlineSuggestionData["activityId"] = activityId;

    lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
    return await requestInlineSuggest(
      documentInfo.documentContent,
      documentInfo.parsedAnsibleDocument,
      documentInfo.documentUri,
      activityId,
      rhUserHasSeat,
      documentInfo.documentDirPath,
      documentInfo.documentFilePath,
      documentInfo.ansibleFileType,
      suggestionId,
    );
  } catch (error) {
    inlineSuggestionData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return { predictions: [], suggestionId: suggestionId };
  } finally {
    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  }
}

export function setInProgressSuggestionId(suggestionId?: string) {
  inlineSuggestionData["suggestionId"] = suggestionId;
}

export function setDocumentChanged(value: boolean) {
  _documentChanged = value;
}

async function isDocumentChangedImmediately(): Promise<boolean> {
  const delay =
    lightSpeedManager.settingsManager.settings.lightSpeedService.suggestions
      .waitWindow;
  if (delay > 0) {
    setDocumentChanged(false);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return _documentChanged;
  } else {
    return Promise.resolve(false);
  }
}

const onDoSingleTasksSuggestion: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition,
) {
  if (await isDocumentChangedImmediately()) {
    return [];
  }
  resetSuggestionData();
  inlineSuggestionDisplayTime = getCurrentUTCDateTime();
  const requestTime = getCurrentUTCDateTime();
  console.log(
    "[inline-suggestions] Inline suggestions triggered by user edits.",
  );
  const documentInfo = loadFile(inlinePosition);
  const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);

  const result = await requestSuggestion(documentInfo, inlinePosition);
  if (!result || !result.predictions || result.predictions.length === 0) {
    console.error("[inline-suggestions] Inline suggestions not found.");
    return [];
  }
  const responseTime = getCurrentUTCDateTime();
  inlineSuggestionData["latency"] =
    responseTime.getTime() - requestTime.getTime();

  const inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  result.predictions.forEach((prediction) => {
    const leadingWhitespaceCount = prediction.search(/\S/);
    let leadingWhitespace = "";
    if (leadingWhitespaceCount > 0) {
      leadingWhitespace = " ".repeat(leadingWhitespaceCount);
    }
    let insertText = `${leadingWhitespace}${LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT}${prediction}`;
    insertText = adjustInlineSuggestionIndent(
      insertText,
      inlinePosition.position,
    );
    insertText = insertText.replace(/^[ \t]+(?=\r?\n)/gm, "");
    insertTexts.push(insertText);

    const inlineSuggestionItem = new vscode.InlineCompletionItem(insertText);
    inlineSuggestionItem.command = {
      title: "Replace Marker",
      command: LightSpeedCommands.LIGHTSPEED_SUGGESTION_MARKER,
      arguments: [inlinePosition.position],
    };

    inlineSuggestionUserActionItems.push(inlineSuggestionItem);
  });
  // currentSuggestion is used in user action handlers
  // to track the suggestion that user is currently working on
  const currentSuggestion: string = result.predictions[0];

  // previousTriggerPosition is used to track the cursor position
  // on hover when the suggestion is displayed
  previousTriggerPosition = inlinePosition.position;

  console.log(
    `[inline-suggestions] Received Inline Suggestion\n:${currentSuggestion}`,
  );
  const contentMatchesForSuggestion = `${suggestionMatchInfo.lineToExtractPrompt.text.trimEnd()}\n${currentSuggestion}`;
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: result.suggestionId,
      suggestion: contentMatchesForSuggestion,
      isPlaybook: false,
    },
  ];
  // if the suggestion is not empty then we set the flag to true
  // indicating that the suggestion is displayed and will be used
  // to track the user action on the suggestion in scenario where
  // the user continued to type without accepting or rejecting the suggestion
  suggestionDisplayed.set(inlineSuggestionUserActionItems);
  return inlineSuggestionUserActionItems;
};

const onDoMultiTasksSuggestion: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition,
) {
  if (await isDocumentChangedImmediately()) {
    return [];
  }
  resetSuggestionData();
  inlineSuggestionDisplayTime = getCurrentUTCDateTime();
  const requestTime = getCurrentUTCDateTime();
  console.log(
    "[inline-suggestions] Inline suggestions triggered by user edits.",
  );
  const documentInfo = loadFile(inlinePosition);

  const result = await requestSuggestion(documentInfo, inlinePosition);
  if (!result || !result.predictions || result.predictions.length === 0) {
    console.error("[inline-suggestions] Inline suggestions not found.");
    return [];
  }

  const responseTime = getCurrentUTCDateTime();
  inlineSuggestionData["latency"] =
    responseTime.getTime() - requestTime.getTime();

  const inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  result.predictions.forEach((prediction) => {
    const leadingWhitespaceCount = prediction.search(/\S/);
    let leadingWhitespace = "";
    if (leadingWhitespaceCount > 0) {
      leadingWhitespace = " ".repeat(leadingWhitespaceCount);
    }
    let insertText = `${leadingWhitespace}${LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT}${prediction}`;
    insertText = adjustInlineSuggestionIndent(
      insertText,
      inlinePosition.position,
    );
    insertText = insertText.replace(/^[ \t]+(?=\r?\n)/gm, "");
    insertTexts.push(insertText);

    const inlineSuggestionItem = new vscode.InlineCompletionItem(insertText);
    inlineSuggestionItem.command = {
      title: "Replace Marker",
      command: LightSpeedCommands.LIGHTSPEED_SUGGESTION_MARKER,
      arguments: [inlinePosition.position],
    };
    inlineSuggestionUserActionItems.push(inlineSuggestionItem);
  });
  // currentSuggestion is used in user action handlers
  // to track the suggestion that user is currently working on
  const currentSuggestion: string = result.predictions[0];

  // previousTriggerPosition is used to track the cursor position
  // on hover when the suggestion is displayed
  previousTriggerPosition = inlinePosition.position;

  console.log(
    `[inline-suggestions] Received Inline Suggestion\n:${currentSuggestion}`,
  );
  const contentMatchesForSuggestion = currentSuggestion;
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: result.suggestionId,
      suggestion: contentMatchesForSuggestion,
      isPlaybook: false,
    },
  ];
  // if the suggestion is not empty then we set the flag to true
  // indicating that the suggestion is displayed and will be used
  // to track the user action on the suggestion in scenario where
  // the user continued to type without accepting or rejecting the suggestion
  suggestionDisplayed.set(inlineSuggestionUserActionItems);
  return inlineSuggestionUserActionItems;
};

function getSuggestionMatchType(
  inlinePosition: InlinePosition,
): SuggestionMatchInfo {
  let suggestionMatchType: LIGHTSPEED_SUGGESTION_TYPE | undefined = undefined;

  const lineToExtractPrompt = inlinePosition.document.lineAt(
    inlinePosition.position.line - 1,
  );
  const spacesBeforePromptStart =
    lineToExtractPrompt?.text.match(/^ +/)?.[0].length || 0;

  const taskMatchedPattern =
    lineToExtractPrompt.text.match(SINGLE_TASK_REGEX_EP);
  const currentLineText = inlinePosition.document.lineAt(
    inlinePosition.position,
  );
  const spacesBeforeCursor =
    currentLineText?.text
      .slice(0, inlinePosition.position.character)
      .match(/^ +/)?.[0].length || 0;

  if (taskMatchedPattern) {
    suggestionMatchType = "SINGLE-TASK";
  } else {
    const commentMatchedPattern =
      lineToExtractPrompt.text.match(MULTI_TASK_REGEX_EP);
    if (commentMatchedPattern) {
      suggestionMatchType = "MULTI-TASK";
    }
  }

  return {
    currentLineText: currentLineText,
    lineToExtractPrompt: lineToExtractPrompt,
    taskMatchedPattern: taskMatchedPattern,
    spacesBeforeCursor: spacesBeforeCursor,
    spacesBeforePromptStart: spacesBeforePromptStart,
    suggestionMatchType: suggestionMatchType,
  };
}

function loadFile(inlinePosition: InlinePosition): DocumentInfo {
  const range = new vscode.Range(
    new vscode.Position(0, 0),
    inlinePosition.position,
  );
  const documentContent = range.isEmpty
    ? ""
    : inlinePosition.document.getText(range).trimEnd();

  let parsedAnsibleDocument = undefined;
  const documentUri = inlinePosition.document.uri.toString();
  const documentDirPath = pathUri.dirname(URI.parse(documentUri).path);
  const documentFilePath = URI.parse(documentUri).path;
  const ansibleFileType: IAnsibleFileType = getAnsibleFileType(
    documentFilePath,
    documentContent,
  );

  try {
    parsedAnsibleDocument = yaml.parse(documentContent, {
      keepSourceTokens: true,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Ansible Lightspeed expects valid YAML syntax to provide inline suggestions. Error: ${err}`,
    );
    throw err;
  }

  return {
    ansibleFileType: ansibleFileType,
    documentContent: documentContent,
    documentDirPath: documentDirPath,
    documentFilePath: documentFilePath,
    documentUri: documentUri,
    parsedAnsibleDocument: parsedAnsibleDocument,
  };
}

const InlineSuggestionState = {
  UnexpectedPromptWithNoSeat: onUnexpectedPromptWithNoSeat,
  UnexpectedPromptWithSeat: onUnexpectedPromptWithSeat,
  CancellationRequested: onCancellationRequested,
  MultiTaskWithNoSeat: onMultiTaskWithNoSeat,
  ShouldNotTriggerSuggestion: onShouldNotTriggerSuggestion,
  DoMultiTasksSuggestion: onDoMultiTasksSuggestion,
  DoSingleTaskSuggestion: onDoSingleTasksSuggestion,
} as const;
type InlineSuggestionState =
  (typeof InlineSuggestionState)[keyof typeof InlineSuggestionState];

async function getInlineSuggestionState(
  inlinePosition: InlinePosition,
): Promise<CallbackEntry> {
  const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);
  const rhUserHasSeat =
    await lightSpeedManager.lightspeedAuthenticatedUser.rhUserHasSeat();

  if (
    !suggestionMatchInfo.suggestionMatchType ||
    !suggestionMatchInfo.currentLineText.isEmptyOrWhitespace ||
    suggestionMatchInfo.spacesBeforePromptStart !==
      suggestionMatchInfo.spacesBeforeCursor
  ) {
    // If the user has triggered the inline suggestion by pressing the configured keys,
    // we will show an information message to the user to help them understand the
    // correct cursor position to trigger the inline suggestion.
    if (
      inlinePosition.context.triggerKind ===
      vscode.InlineCompletionTriggerKind.Invoke
    ) {
      return rhUserHasSeat
        ? InlineSuggestionState.UnexpectedPromptWithSeat
        : InlineSuggestionState.UnexpectedPromptWithNoSeat;
    }
    return InlineSuggestionState.CancellationRequested;
  }

  const documentInfo = loadFile(inlinePosition);
  const hasValidPrompt: boolean =
    shouldTriggerMultiTaskSuggestion(
      documentInfo.documentContent,
      suggestionMatchInfo.spacesBeforePromptStart,
      inlinePosition.position.line,
      documentInfo.ansibleFileType,
    ) ||
    shouldRequestInlineSuggestions(
      documentInfo.parsedAnsibleDocument,
      documentInfo.ansibleFileType,
    );

  if (!hasValidPrompt) {
    return InlineSuggestionState.ShouldNotTriggerSuggestion;
  }

  switch (
    `${suggestionMatchInfo.suggestionMatchType}-${
      rhUserHasSeat ? "has-seat" : "no-seat"
    }`
  ) {
    case "MULTI-TASK-no-seat": {
      return InlineSuggestionState.MultiTaskWithNoSeat;
    }
    case "MULTI-TASK-has-seat": {
      return InlineSuggestionState.DoMultiTasksSuggestion;
    }
    case "SINGLE-TASK-no-seat": {
      return InlineSuggestionState.DoSingleTaskSuggestion;
    }
    case "SINGLE-TASK-has-seat": {
      return InlineSuggestionState.DoSingleTaskSuggestion;
    }
  }

  return InlineSuggestionState.ShouldNotTriggerSuggestion;
}

export async function getInlineSuggestionItems(
  inlinePosition: InlinePosition,
): Promise<vscode.InlineCompletionItem[]> {
  const state = await getInlineSuggestionState(inlinePosition);

  return state(suggestionDisplayed, inlinePosition);
}

async function requestInlineSuggest(
  content: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedAnsibleDocument: any,
  documentUri: string,
  activityId: string,
  rhUserHasSeat: boolean | undefined,
  documentDirPath: string,
  documentFilePath: string,
  ansibleFileType: IAnsibleFileType,
  suggestionId: string,
): Promise<CompletionResponseParams> {
  const hash = crypto.createHash("sha256").update(documentUri).digest("hex");
  const completionData: CompletionRequestParams = {
    prompt: content,
    suggestionId: suggestionId,
    metadata: {
      documentUri: `document-${hash}`,
      ansibleFileType: ansibleFileType,
      activityId: activityId,
    },
  };

  const userProvidedModel =
    lightSpeedManager.settingsManager.settings.lightSpeedService.model;
  if (userProvidedModel && userProvidedModel !== "") {
    completionData.model = userProvidedModel;
  }

  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion request sent to Ansible Lightspeed.`,
  );

  lightSpeedManager.statusBarProvider.statusBar.show();
  console.log(
    `[inline-suggestions] completionData: \n${yaml.stringify(
      completionData,
    )}\n`,
  );
  const outputData: CompletionResponseParams =
    await lightSpeedManager.apiInstance.completionRequest(completionData);
  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion response received from Ansible Lightspeed.`,
  );
  if (outputData.model) {
    // If model name is returned by server is different from the one previously used
    // and it is not the user provided model, update the model name
    if (
      lightSpeedManager.currentModelValue !== outputData.model &&
      outputData.model !== userProvidedModel
    ) {
      lightSpeedManager.currentModelValue = outputData.model;
      // update the Lightspeed status bar tooltip with the model name
      lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip();
    }
    // check if the model value provided by user is same as that is used by the server
    if (userProvidedModel && userProvidedModel !== "") {
      if (outputData.model !== userProvidedModel) {
        vscode.window.showWarningMessage(
          `Ansible Lightspeed is using the model ${outputData.model} ` +
            `for suggestions instead of ${userProvidedModel}. ` +
            `Please contact your administrator.`,
        );
      }
    }
  }
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
    "[inline-suggestions] Inline Suggestion Handler triggered using command.",
  );
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
}

export async function inlineSuggestionReplaceMarker(position: vscode.Position) {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  console.log(
    `[inline-suggestions] Inline Suggestion Marker Handler triggered using command at ${position.line}`,
  );

  // Get the current text
  const line = position.line;

  // Update the editor with the new text
  await editor.edit((editBuilder) => {
    editBuilder.delete(
      new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line + 1, 0),
      ),
    );
  });

  console.log(
    "[inline-suggestions] Inline Suggestion Marker Handler removing extra whitespace",
  );

  // Clear the line of extra whitespace after the suggestion
  // that causes ansible-lint errors
  const selection = editor.selection;
  const lineText = editor.document.lineAt(selection.active.line).text;
  if (/^\s*$/.test(lineText)) {
    await editor.edit((editBuilder) => {
      editBuilder.delete(
        new vscode.Range(
          selection.active.line,
          0,
          selection.active.line,
          lineText.length,
        ),
      );
    });
  }
}

export async function inlineSuggestionCommitHandler() {
  // Commit the suggestion, which might be provided by another provider
  vscode.commands.executeCommand("editor.action.inlineSuggest.commit");

  // If the suggestion does not seem to be ours, exit early.
  if (!inlineSuggestionData["suggestionId"]) {
    return;
  }

  console.log("[inline-suggestions] User accepted the inline suggestion.");
}

export async function inlineSuggestionHideHandler(
  userAction?: UserAction,
  suggestionId?: string,
) {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }

  // Hide the suggestion, which might be provided by another provider
  vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

  suggestionId = suggestionId || inlineSuggestionData["suggestionId"];
  // If the suggestion does not seem to be ours, exit early.
  if (!suggestionId) {
    return;
  }
  const action = userAction || UserAction.REJECTED;
  switch (action) {
    case UserAction.REJECTED: {
      console.log("[inline-suggestions] User rejected the inline suggestion.");
      break;
    }
    case UserAction.IGNORED: {
      console.log("[inline-suggestions] User ignored the inline suggestion.");
      break;
    }
    default: {
      console.log(
        "[inline-suggestions] User didn't accept the inline suggestion.",
      );
    }
  }

  console.log("[inline-suggestions] User ignored the inline suggestion.");

  // Send feedback for refused suggestion
  await inlineSuggestionUserActionHandler(suggestionId, action);
}

export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted: UserAction = UserAction.REJECTED,
) {
  const data: InlineSuggestionEvent = {};

  data["userActionTime"] =
    getCurrentUTCDateTime().getTime() - inlineSuggestionDisplayTime.getTime();

  // since user has either accepted or ignored the suggestion
  // inline suggestion is no longer displayed and we can reset the
  // the flag here
  suggestionDisplayed.reset();
  data["action"] = isSuggestionAccepted;
  data["suggestionId"] = suggestionId;
  const inlineSuggestionFeedbackPayload = {
    inlineSuggestion: data,
  };
  lightSpeedManager.apiInstance.feedbackRequest(
    inlineSuggestionFeedbackPayload,
  );
  if (suggestionId === inlineSuggestionData["suggestionId"]) {
    resetSuggestionData();
  }
}

function inlineSuggestionPending(checkActiveTextEditor = true): boolean {
  if (checkActiveTextEditor) {
    if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
      return false;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return false;
    }
  }
  if (!inlineSuggestionData["suggestionId"]) {
    return false;
  }
  return true;
}

function resetSuggestionData(): void {
  inlineSuggestionData = {};
  insertTexts = [];
}

export async function rejectPendingSuggestion() {
  if (
    suggestionDisplayed.get() &&
    lightSpeedManager.inlineSuggestionsEnabled &&
    !lightSpeedManager.apiInstance.isSuggestionFeedbackInProgress()
  ) {
    if (inlineSuggestionPending()) {
      console.log(
        "[inline-suggestions] Send a REJECTED feedback for a pending suggestion.",
      );
      const suggestionId = inlineSuggestionData["suggestionId"] || "";
      await inlineSuggestionUserActionHandler(
        suggestionId,
        UserAction.REJECTED,
      );
    } else {
      suggestionDisplayed.reset();
    }
  }
}

export async function ignorePendingSuggestion() {
  if (suggestionDisplayed.get() && lightSpeedManager.inlineSuggestionsEnabled) {
    if (inlineSuggestionPending(false)) {
      console.log(
        "[inline-suggestions] Send a IGNORED feedback for a pending suggestion.",
      );
      const suggestionId = inlineSuggestionData["suggestionId"] || "";
      await inlineSuggestionUserActionHandler(suggestionId, UserAction.IGNORED);
    } else {
      suggestionDisplayed.reset();
    }
  }
}

export async function inlineSuggestionTextDocumentChangeHandler(
  e: vscode.TextDocumentChangeEvent,
) {
  // If the user accepted a suggestion on the widget, ansible.lightspeed.inlineSuggest.accept
  // command is not sent. This method checks if a text change that matches to the current
  // suggestion was found. If such a change was detected, we assume that the user accepted
  // the suggestion on the widget.
  if (
    lightSpeedManager.inlineSuggestionsEnabled &&
    inlineSuggestionPending() &&
    insertTexts &&
    e.document.languageId === "ansible" &&
    e.contentChanges.length > 0
  ) {
    const suggestionId = inlineSuggestionData["suggestionId"] || "";
    e.contentChanges.forEach(async (c) => {
      if (c.text === insertTexts[0]) {
        // If a matching change was found, send a feedback with the ACCEPTED user action.
        console.log(
          "[inline-suggestions] Detected a text change that matches to the current suggestion.",
        );
        await inlineSuggestionUserActionHandler(
          suggestionId,
          UserAction.ACCEPTED,
        );
        // Show training matches for the accepted suggestion.
        vscode.commands.executeCommand(
          LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
        );
      }
    });
  }
}
