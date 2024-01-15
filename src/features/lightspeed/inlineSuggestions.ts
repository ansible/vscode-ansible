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
  IRolesContext,
  IRoleContext,
  IStandaloneTaskContext,
} from "../../interfaces/lightspeed";
import {
  LIGHTSPEED_SUGGESTION_TYPE,
  MULTI_TASK_REGEX_EP,
  SINGLE_TASK_REGEX_EP,
  UserAction,
} from "../../definitions/lightspeed";
import { LightSpeedCommands } from "../../definitions/lightspeed";
import {
  getIncludeVarsContext,
  getRelativePath,
  getRolePathFromPathWithinRole,
  shouldRequestInlineSuggestions,
  shouldTriggerMultiTaskSuggestion,
} from "./utils/data";
import { getVarsFilesContext } from "./utils/data";
import {
  IAdditionalContext,
  IAnsibleFileType,
  IPlaybookContext,
} from "../../interfaces/lightspeed";
import { getAnsibleFileType, getCustomRolePaths } from "../utils/ansible";
import { watchRolesDirectory } from "./utils/watchers";

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
    if (lightSpeedManager.apiInstance._completionRequestInProgress) {
      vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
        UserAction.IGNORED
      );
    }
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      resetInlineSuggestionDisplayed();
      return [];
    }
    if (activeTextEditor.document.languageId !== "ansible") {
      lightSpeedManager.statusBarProvider.statusBar.hide();
      resetInlineSuggestionDisplayed();
      return [];
    }

    if (token.isCancellationRequested) {
      resetInlineSuggestionDisplayed();
      return [];
    }
    if (document.languageId !== "ansible") {
      lightSpeedManager.statusBarProvider.statusBar.hide();
      resetInlineSuggestionDisplayed();
      return [];
    }
    const lightSpeedSetting =
      lightSpeedManager.settingsManager.settings.lightSpeedService;
    if (!lightSpeedSetting.enabled || !lightSpeedSetting.suggestions.enabled) {
      console.debug("[ansible-lightspeed] Ansible Lightspeed is disabled.");
      lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar();
      resetInlineSuggestionDisplayed();
      return [];
    }

    if (!lightSpeedSetting.URL.trim()) {
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
    const suggestionItems = getInlineSuggestionItems(
      context,
      document,
      position
    );
    return suggestionItems;
  }
}

export async function getInlineSuggestionItems(
  context: vscode.InlineCompletionContext,
  document: vscode.TextDocument,
  currentPosition: vscode.Position
): Promise<vscode.InlineCompletionItem[]> {
  let result: CompletionResponseParams = {
    predictions: [],
  };
  const range = new vscode.Range(new vscode.Position(0, 0), currentPosition);
  const documentContent = range.isEmpty
    ? ""
    : document.getText(range).trimEnd();

  let suggestionMatchType: LIGHTSPEED_SUGGESTION_TYPE | undefined = undefined;

  const rhUserHasSeat =
    await lightSpeedManager.lightSpeedAuthenticationProvider.rhUserHasSeat();

  const lineToExtractPrompt = document.lineAt(currentPosition.line - 1);
  const taskMatchedPattern =
    lineToExtractPrompt.text.match(SINGLE_TASK_REGEX_EP);
  const currentLineText = document.lineAt(currentPosition);
  const spacesBeforeCursor =
    currentLineText?.text.slice(0, currentPosition.character).match(/^ +/)?.[0]
      .length || 0;

  if (taskMatchedPattern) {
    suggestionMatchType = "SINGLE-TASK";
  } else {
    const commentMatchedPattern =
      lineToExtractPrompt.text.match(MULTI_TASK_REGEX_EP);
    if (commentMatchedPattern) {
      suggestionMatchType = "MULTI-TASK";
    }
  }

  const spacesBeforePromptStart =
    lineToExtractPrompt?.text.match(/^ +/)?.[0].length || 0;

  if (
    !suggestionMatchType ||
    !currentLineText.isEmptyOrWhitespace ||
    spacesBeforePromptStart !== spacesBeforeCursor
  ) {
    resetInlineSuggestionDisplayed();
    // If the user has triggered the inline suggestion by pressing the configured keys,
    // we will show an information message to the user to help them understand the
    // correct cursor position to trigger the inline suggestion.
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
      if (rhUserHasSeat) {
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
        }
      } else {
        if (!taskMatchedPattern || !currentLineText.isEmptyOrWhitespace) {
          vscode.window.showInformationMessage(
            "Cursor should be positioned on the line after the task name with the same indent as that of the task name line to trigger an inline suggestion."
          );
        } else if (
          taskMatchedPattern &&
          currentLineText.isEmptyOrWhitespace &&
          spacesBeforePromptStart !== spacesBeforeCursor
        ) {
          vscode.window.showInformationMessage(
            `Cursor must be in column ${spacesBeforePromptStart} to trigger an inline suggestion.`
          );
        }
      }
    }
    return [];
  }

  let parsedAnsibleDocument = undefined;
  const documentUri = document.uri.toString();
  const documentDirPath = pathUri.dirname(URI.parse(documentUri).path);
  const documentFilePath = URI.parse(documentUri).path;
  const ansibleFileType: IAnsibleFileType = getAnsibleFileType(
    documentFilePath,
    documentContent
  );

  if (suggestionMatchType === "MULTI-TASK") {
    if (rhUserHasSeat === false) {
      console.debug(
        "[inline-suggestions] Multitask suggestions not supported for a non seat user."
      );
      return [];
    } else {
      if (
        !shouldTriggerMultiTaskSuggestion(
          documentContent,
          spacesBeforePromptStart,
          ansibleFileType
        )
      ) {
        return [];
      }
    }
  }

  try {
    parsedAnsibleDocument = yaml.parse(documentContent, {
      keepSourceTokens: true,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Ansible Lightspeed expects valid YAML syntax to provide inline suggestions. Error: ${err}`
    );
    return [];
  }
  if (
    suggestionMatchType === "SINGLE-TASK" &&
    !shouldRequestInlineSuggestions(parsedAnsibleDocument, ansibleFileType)
  ) {
    return [];
  }

  inlineSuggestionData = {};
  suggestionId = "";
  inlineSuggestionDisplayTime = getCurrentUTCDateTime();
  const requestTime = getCurrentUTCDateTime();
  console.log(
    "[inline-suggestions] Inline suggestions triggered by user edits."
  );
  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText(
      rhUserHasSeat
    );
  try {
    suggestionId = uuidv4();
    let activityId: string | undefined = undefined;
    inlineSuggestionData["suggestionId"] = suggestionId;
    inlineSuggestionData["documentUri"] = documentUri;

    if (!(documentUri in lightSpeedManager.lightSpeedActivityTracker)) {
      activityId = uuidv4();
      lightSpeedManager.lightSpeedActivityTracker[documentUri] = {
        activityId: activityId,
        content: document.getText(),
      };
    } else {
      activityId =
        lightSpeedManager.lightSpeedActivityTracker[documentUri].activityId;
    }
    inlineSuggestionData["activityId"] = activityId;

    lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
    result = await requestInlineSuggest(
      documentContent,
      parsedAnsibleDocument,
      documentUri,
      activityId,
      rhUserHasSeat,
      documentDirPath,
      documentFilePath,
      ansibleFileType
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
    insertText = adjustInlineSuggestionIndent(prediction, currentPosition);
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
  previousTriggerPosition = currentPosition;

  console.log(
    `[inline-suggestions] Received Inline Suggestion\n:${currentSuggestion}`
  );
  let contentMatchesForSuggestion = currentSuggestion;
  if (suggestionMatchType === "SINGLE-TASK") {
    contentMatchesForSuggestion = `${lineToExtractPrompt.text.trimEnd()}\n${currentSuggestion}`;
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
  setInlineSuggestionDisplayed(inlineSuggestionUserActionItems);
  return inlineSuggestionUserActionItems;
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
      ansibleFileType
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
          `Ansible Lightspeed is using the model ${outputData.model} for suggestions instead of ${userProvidedModel}. Please contact your administrator.`
        );
      }
    }
  }
  return outputData;
}

export function getAdditionalContext(
  parsedAnsibleDocument: yaml.YAMLMap[],
  documentDirPath: string,
  documentFilePath: string,
  ansibleFileType: IAnsibleFileType
): IAdditionalContext {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let workSpaceRoot = undefined;
  const playbookContext: IPlaybookContext = {};
  let roleContext: IRoleContext = {};
  const standaloneTaskContext: IStandaloneTaskContext = {};
  if (workspaceFolders) {
    workSpaceRoot = workspaceFolders[0].uri.fsPath;
  }
  if (ansibleFileType === "playbook") {
    const varsFilesContext = getVarsFilesContext(
      lightSpeedManager,
      parsedAnsibleDocument,
      documentDirPath
    );
    playbookContext["varInfiles"] = varsFilesContext || {};
    const rolesCache: IRolesContext = {};
    if (workSpaceRoot) {
      // check if roles are installed in the workspace
      if (!(workSpaceRoot in lightSpeedManager.ansibleRolesCache)) {
        const rolesPath = getCustomRolePaths(workSpaceRoot);
        for (const rolePath of rolesPath) {
          watchRolesDirectory(lightSpeedManager, rolePath, workSpaceRoot);
        }
      }
      // if roles are installed in the workspace, then get the relative path w.r.t. the workspace root
      if (workSpaceRoot in lightSpeedManager.ansibleRolesCache) {
        const workspaceRolesCache =
          lightSpeedManager.ansibleRolesCache[workSpaceRoot];
        for (const absRolePath in workspaceRolesCache) {
          const relativeRolePath = getRelativePath(
            documentDirPath,
            workSpaceRoot,
            absRolePath
          );
          rolesCache[relativeRolePath] = workspaceRolesCache[absRolePath];
        }
      }
    }
    if ("common" in lightSpeedManager.ansibleRolesCache) {
      for (const commonRolePath in lightSpeedManager.ansibleRolesCache) {
        rolesCache[commonRolePath] =
          lightSpeedManager.ansibleRolesCache["common"][commonRolePath];
      }
    }
    playbookContext["roles"] = rolesCache;
  } else if (ansibleFileType === "tasks_in_role") {
    const roleCache = lightSpeedManager.ansibleRolesCache;
    const absRolePath = getRolePathFromPathWithinRole(documentFilePath);
    if (
      workSpaceRoot &&
      workSpaceRoot in roleCache &&
      absRolePath in roleCache[workSpaceRoot]
    ) {
      roleContext = roleCache[workSpaceRoot][absRolePath];
    }
  }
  const includeVarsContext =
    getIncludeVarsContext(
      lightSpeedManager,
      parsedAnsibleDocument,
      documentDirPath,
      ansibleFileType
    ) || {};

  if (ansibleFileType === "playbook") {
    playbookContext.includeVars = includeVarsContext;
  } else if (ansibleFileType === "tasks_in_role") {
    roleContext.includeVars = includeVarsContext;
  } else if (ansibleFileType === "tasks") {
    standaloneTaskContext.includeVars = includeVarsContext;
  }

  const additionalContext: IAdditionalContext = {
    playbookContext: playbookContext,
    roleContext: roleContext,
    standaloneTaskContext: standaloneTaskContext,
  };
  return additionalContext;
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
  resetInlineSuggestionDisplayed();
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
