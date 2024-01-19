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
//import { inlineSuggestionUserActionHandler } from "./inlinesuggestion/useractionhandler";
import { SuggestionDisplayed } from "./inlinesuggestion/suggestionDisplayed";
import { LightSpeedServiceSettings } from "../../interfaces/extensionSettings";
import { getAdditionalContext } from "./inlinesuggestion/additionalContext";

let suggestionId = "";
let currentSuggestion = "";
let inlineSuggestionData: InlineSuggestionEvent = {};
let inlineSuggestionDisplayTime: Date;
let previousTriggerPosition: vscode.Position;
export const suggestionDisplayed = new SuggestionDisplayed();

interface InlinePosition {
  document: vscode.TextDocument;
  position: vscode.Position;
  context: vscode.InlineCompletionContext;
}

export interface CallbackEntry {
  (
    suggestionDisplayed: SuggestionDisplayed,
    inlinePosition: InlinePosition
  ): Promise<vscode.InlineCompletionItem[]>;
}

export const onTextEditorNotActive: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  suggestionDisplayed.reset();
  return [];
};

const onNotForMe: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  lightSpeedManager.statusBarProvider.statusBar.hide();
  suggestionDisplayed.reset();
  return [];
};

const onCancellationRequested: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  suggestionDisplayed.reset();
  return [];
};

const onLightspeedIsDisabled: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  console.debug("[ansible-lightspeed] Ansible Lightspeed is disabled.");
  lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar();
  suggestionDisplayed.reset();
  return [];
};

const onLightspeedURLMisconfigured: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  vscode.window.showErrorMessage(
    "Ansible Lightspeed URL is empty. Please provide a URL."
  );
  suggestionDisplayed.reset();
  return [];
};

const onRetrySuggestion: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed
) {
  return suggestionDisplayed.cachedCompletionItem;
};

const onRefusedSuggestion: CallbackEntry = async function () {
  vscode.commands.executeCommand(LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE);
  return [];
};

const onRequestInProgress: CallbackEntry = async function () {
  vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
    UserAction.IGNORED
  );
  return [];
};

const onDefault: CallbackEntry = function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition
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
  RetrySuggestion: onRetrySuggestion,
  RefusedSuggestion: onRefusedSuggestion,
  RequestInProgress: onRequestInProgress,
  Default: onDefault,
} as const;
type CompletionState = (typeof CompletionState)[keyof typeof CompletionState];

function getCompletionState(
  suggestionDisplayed: SuggestionDisplayed,
  completionRequestInProgress: boolean,
  languageId: string,
  isCancellationRequested: boolean,
  lightSpeedSetting: LightSpeedServiceSettings,
  positionHasChanged?: boolean
): CompletionState {
  if (completionRequestInProgress) {
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
    return CompletionState.RetrySuggestion;
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
    token: vscode.CancellationToken
  ):
    | vscode.ProviderResult<vscode.InlineCompletionItem[]>
    | Promise<vscode.InlineCompletionItem[]> {
    const activeTextEditor = vscode.window.activeTextEditor;
    const lightSpeedSetting =
      lightSpeedManager.settingsManager.settings.lightSpeedService;

    const state = getCompletionState(
      suggestionDisplayed,
      lightSpeedManager.apiInstance.completionRequestInProgress,
      (activeTextEditor && activeTextEditor.document.languageId) ||
        document.languageId,
      token.isCancellationRequested,
      lightSpeedSetting,
      !_.isEqual(position, previousTriggerPosition)
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
  inlinePosition: InlinePosition
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
    if (!suggestionMatchInfo.taskMatchedPattern || !suggestionMatchInfo.currentLineText.isEmptyOrWhitespace) {
      vscode.window.showInformationMessage(
        "Cursor should be positioned on the line after the task name with the same indent as that of the task name line to trigger an inline suggestion."
      );
    } else if (
      suggestionMatchInfo.taskMatchedPattern &&
      suggestionMatchInfo.currentLineText.isEmptyOrWhitespace &&
      suggestionMatchInfo.spacesBeforePromptStart !== suggestionMatchInfo.spacesBeforeCursor
    ) {
      vscode.window.showInformationMessage(
        `Cursor must be in column ${suggestionMatchInfo.spacesBeforePromptStart} to trigger an inline suggestion.`
      );
    }
  }
  return [];
};

const onUnexpectedPromptWithSeat: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition
) {
  suggestionDisplayed.reset();
  // If the user has triggered the inline suggestion by pressing the configured keys,
  // we will show an information message to the user to help them understand the
  // correct cursor position to trigger the inline suggestion.
  if (
    inlinePosition.context.triggerKind ===
    vscode.InlineCompletionTriggerKind.Invoke
  ) {
    /* TODO
    if (!suggestionMatchType || !currentLineText.isEmptyOrWhitespace) {
      vscode.window.showInformationMessage(
        "Cursor should be positioned on the line after the task name or a comment line within task context to trigger an inline suggestion."
      );
    } else if (
      suggestionMatchType &&
      currentLineText.isEmptyOrWhitespace &&
      spacesBeforePromptStart !== spacesBeforeCursor
    ) {
      vscode.window.showInformationMessage(
        `Cursor must be in column ${spacesBeforePromptStart} to trigger an inline suggestion.`
      );
    } */
  }
  return [];
};

const onMultiTaskWithNoSeat: CallbackEntry = async function () {
  console.debug(
    "[inline-suggestions] Multitask suggestions not supported for a non seat user."
  );
  return [];
};

const onShouldNotTriggerSuggestion: CallbackEntry = async function () {
  return [];
};

const onDoMultiTasksSuggestion: CallbackEntry = async function (
  suggestionDisplayed: SuggestionDisplayed,
  inlinePosition: InlinePosition
) {
  inlineSuggestionData = {};
  suggestionId = "";
  inlineSuggestionDisplayTime = getCurrentUTCDateTime();
  const requestTime = getCurrentUTCDateTime();
  console.log(
    "[inline-suggestions] Inline suggestions triggered by user edits."
  );
  const documentInfo = loadFile(inlinePosition);
  const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);
  const rhUserHasSeat =
    await lightSpeedManager.lightSpeedAuthenticationProvider.rhUserHasSeat();

  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText(
      rhUserHasSeat
    );

  let result; // TODO: no need to
  try {
    suggestionId = uuidv4();
    let activityId: string | undefined = undefined;
    inlineSuggestionData["suggestionId"] = suggestionId;
    inlineSuggestionData["documentUri"] = documentInfo.documentUri;

    if (
      !(documentInfo.documentUri in lightSpeedManager.lightSpeedActivityTracker)
    ) {
      activityId = uuidv4();
      lightSpeedManager.lightSpeedActivityTracker[documentInfo.documentUri] = {
        activityId: activityId,
        content: inlinePosition.document.getText(),
      };
    } else {
      activityId =
        lightSpeedManager.lightSpeedActivityTracker[documentInfo.documentUri]
          .activityId;
    }
    inlineSuggestionData["activityId"] = activityId;

    lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
    result = await requestInlineSuggest(
      // TODO: pass DocumentInfo instead
      documentInfo.documentContent,
      documentInfo.parsedAnsibleDocument,
      documentInfo.documentUri,
      activityId,
      rhUserHasSeat,
      documentInfo.documentDirPath,
      documentInfo.documentFilePath,
      documentInfo.ansibleFileType
    );
    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  } catch (error) {
    inlineSuggestionData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
    return [];
  } finally {
    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
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
    insertText = adjustInlineSuggestionIndent(
      prediction,
      inlinePosition.position
    );
    insertText = insertText.replace(/^[ \t]+(?=\r?\n)/gm, "");
    insertTexts.push(insertText);

    const inlineSuggestionItem = new vscode.InlineCompletionItem(insertText);
    inlineSuggestionUserActionItems.push(inlineSuggestionItem);
  });
  // currentSuggestion is used in user action handlers
  // to track the suggestion that user is currently working on
  currentSuggestion = result.predictions[0];

  // previousTriggerPosition is used to track the cursor position
  // on hover when the suggestion is displayed
  previousTriggerPosition = inlinePosition.position;

  console.log(
    `[inline-suggestions] Received Inline Suggestion\n:${currentSuggestion}`
  );
  let contentMatchesForSuggestion = currentSuggestion;
  if (suggestionMatchInfo.suggestionMatchType === "SINGLE-TASK") {
    contentMatchesForSuggestion = `${suggestionMatchInfo.lineToExtractPrompt.text.trimEnd()}\n${currentSuggestion}`;
  }
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: suggestionId,
      suggestion: contentMatchesForSuggestion,
    },
  ];
  // if the suggestion is not empty then we set the flag to true
  // indicating that the suggestion is displayed and will be used
  // to track the user action on the suggestion in scenario where
  // the user continued to type without accepting or rejecting the suggestion
  suggestionDisplayed.set(inlineSuggestionUserActionItems);
  return inlineSuggestionUserActionItems;
};

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

function getSuggestionMatchType(
  inlinePosition: InlinePosition
): SuggestionMatchInfo {
  let suggestionMatchType: LIGHTSPEED_SUGGESTION_TYPE | undefined = undefined;

  const lineToExtractPrompt = inlinePosition.document.lineAt(
    inlinePosition.position.line - 1
  );
  const spacesBeforePromptStart =
    lineToExtractPrompt?.text.match(/^ +/)?.[0].length || 0;

  const taskMatchedPattern =
    lineToExtractPrompt.text.match(SINGLE_TASK_REGEX_EP);
  const currentLineText = inlinePosition.document.lineAt(
    inlinePosition.position
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
    inlinePosition.position
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
    documentContent
  );

  try {
    parsedAnsibleDocument = yaml.parse(documentContent, {
      keepSourceTokens: true,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Ansible Lightspeed expects valid YAML syntax to provide inline suggestions. Error: ${err}`
    );
    //    return InlineSuggestionState.ShouldNotTriggerSuggestion; TODO
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
  //  MultiTaskWithSeat: onMultiTaskWithSeat,
  ShouldNotTriggerSuggestion: onShouldNotTriggerSuggestion,
  DoMultiTasksSuggestion: onDoMultiTasksSuggestion,
  DoSingleTaskSuggestion: onDoMultiTasksSuggestion, // TODO
} as const;
type InlineSuggestionState =
  (typeof InlineSuggestionState)[keyof typeof InlineSuggestionState];

async function getInlineSuggestionState(
  inlinePosition: InlinePosition
): Promise<CallbackEntry> {
  // const result: CompletionResponseParams = {
  //   predictions: [],
  // };

  const suggestionMatchInfo = getSuggestionMatchType(inlinePosition);
  const rhUserHasSeat =
    await lightSpeedManager.lightSpeedAuthenticationProvider.rhUserHasSeat();

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
      if (rhUserHasSeat) {
        return InlineSuggestionState.UnexpectedPromptWithSeat;
      } else {
        return InlineSuggestionState.UnexpectedPromptWithSeat;
      }
    } else {
      return InlineSuggestionState.CancellationRequested;
    }
  }

  const documentInfo = loadFile(inlinePosition);

  if (suggestionMatchInfo.suggestionMatchType === "MULTI-TASK") {
    if (rhUserHasSeat === false) {
      return InlineSuggestionState.MultiTaskWithNoSeat;
    } else {
      if (
        !shouldTriggerMultiTaskSuggestion(
          documentInfo.documentContent,
          suggestionMatchInfo.spacesBeforePromptStart,
          documentInfo.ansibleFileType
        )
      ) {
        return InlineSuggestionState.ShouldNotTriggerSuggestion;
      }
    }
  }

  if (
    suggestionMatchInfo.suggestionMatchType === "SINGLE-TASK" &&
    !shouldRequestInlineSuggestions(
      documentInfo.parsedAnsibleDocument,
      documentInfo.ansibleFileType
    )
  ) {
    return InlineSuggestionState.ShouldNotTriggerSuggestion;
  }
  if (suggestionMatchInfo.suggestionMatchType === "MULTI-TASK") {
    return InlineSuggestionState.DoMultiTasksSuggestion;
  } else {
    return InlineSuggestionState.DoSingleTaskSuggestion;
  }
}

export async function getInlineSuggestionItems(
  inlinePosition: InlinePosition
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
  ansibleFileType: IAnsibleFileType
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

  if (rhUserHasSeat) {
    const additionalContext = getAdditionalContext(
      parsedAnsibleDocument,
      documentDirPath,
      documentFilePath,
      ansibleFileType,
      vscode.workspace.workspaceFolders
    );
    if (completionData.metadata) {
      completionData.metadata.additionalContext = additionalContext;
    }
  }
  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion request sent to Ansible Lightspeed.`
  );

  lightSpeedManager.statusBarProvider.statusBar.show();
  console.log(
    `[inline-suggestions] completionData: \n${yaml.stringify(completionData)}\n`
  );
  const outputData: CompletionResponseParams =
    await lightSpeedManager.apiInstance.completionRequest(completionData);
  console.log(
    `[inline-suggestions] ${getCurrentUTCDateTime().toISOString()}: Completion response received from Ansible Lightspeed.`
  );
  if (outputData.model) {
    // If model name is returned by server is different from the one previously used update the model name
    if (lightSpeedManager.currentModelValue !== outputData.model) {
      lightSpeedManager.currentModelValue = outputData.model;
      // update the Lightspeed status bar tooltip with the model name
      lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip();
    }
    // check if the model value provided by user is same as that is used by the server
    if (userProvidedModel && userProvidedModel !== "") {
      if (outputData.model !== userProvidedModel) {
        vscode.window.showWarningMessage(
          `Ansible Lightspeed is using the model ${outputData.model} for suggestions instead of ${userProvidedModel}. Please contact your administrator.`
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
  await inlineSuggestionUserActionHandler(suggestionId, UserAction.ACCEPTED);
}

export async function inlineSuggestionHideHandler(userAction?: UserAction) {
  if (vscode.window.activeTextEditor?.document.languageId !== "ansible") {
    return;
  }
  const action = userAction || UserAction.REJECTED;
  if (action === UserAction.REJECTED) {
    console.log("[inline-suggestions] User rejected the inline suggestion.");
  } else if (action === UserAction.IGNORED) {
    console.log("[inline-suggestions] User ignored the inline suggestion.");
  } else {
    console.log(
      "[inline-suggestions] User didn't accept the inline suggestion."
    );
  }
  // Hide the suggestion
  console.log("[inline-suggestions] User ignored the inline suggestion.");
  vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

  // Send feedback for accepted suggestion
  await inlineSuggestionUserActionHandler(suggestionId, action);
}

export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted: UserAction = UserAction.REJECTED
) {
  inlineSuggestionData["userActionTime"] =
    getCurrentUTCDateTime().getTime() - inlineSuggestionDisplayTime.getTime();

  // since user has either accepted or ignored the suggestion
  // inline suggestion is no longer displayed and we can reset the
  // the flag here
  suggestionDisplayed.reset();
  inlineSuggestionData["action"] = isSuggestionAccepted;
  inlineSuggestionData["suggestionId"] = suggestionId;
  const inlineSuggestionFeedbackPayload = {
    inlineSuggestion: inlineSuggestionData,
  };
  lightSpeedManager.apiInstance.feedbackRequest(
    inlineSuggestionFeedbackPayload
  );
  inlineSuggestionData = {};
}
