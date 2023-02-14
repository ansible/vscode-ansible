import * as vscode from "vscode";
import { window, Position } from "vscode";

import { v4 as uuidv4 } from "uuid";

import { removePromptFromSuggestion } from "../utils/wisdom";
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
const commentRegexEp =
  /(?<blank>\s*)(?<comment>#\s*)(?<description>.*)(?<end>$)/;
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
      if (getKeyInput() !== "enter") {
        return [];
      }
      resetKeyInput();
      if (window.activeTextEditor?.document.languageId !== "ansible") {
        wisdomManager.wisdomStatusBar.hide();
        return [];
      }
      const wisdomSetting =
        wisdomManager.settingsManager.settings.wisdomService;
      if (!wisdomSetting.enabled && !wisdomSetting.suggestions.enabled) {
        console.debug("wisdom service is disabled");
        wisdomManager.updateWisdomStatusbar();
        return [];
      }
      if (position.line <= 0 || token?.isCancellationRequested) {
        return;
      }

      console.log("provideInlineCompletionItems triggered by user edits");
      const lineToExtractPrompt = document.lineAt(position.line - 1);
      const taskMatchedPattern = lineToExtractPrompt.text.match(taskRegexEp);
      let isTaskNameMatch = false;

      // prompt is the format expected by wisdom service
      // eg. "-name: create a new file"
      let prompt: string | undefined = undefined;

      // promptDescription is the task name or comment
      // eg. "create a new file" and is used to identify
      // the duplicate suggestion line from the wisdom service
      // response and remove it from the inline suggestion list
      let promptDescription: string | undefined = undefined;

      if (taskMatchedPattern) {
        isTaskNameMatch = true;
        promptDescription = taskMatchedPattern?.groups?.description;
        prompt = `${lineToExtractPrompt.text.trim()}\n`;
      } else {
        // check if the line is a comment line
        const commentMatchedPattern =
          lineToExtractPrompt.text.match(commentRegexEp);
        if (commentMatchedPattern) {
          promptDescription = commentMatchedPattern?.groups?.description;
          prompt =
            `- name: ${commentMatchedPattern?.groups?.description}` + "\n";
        }
      }
      if (!prompt) {
        return [];
      }
      if (promptDescription === undefined) {
        promptDescription = prompt;
      }
      const inlineSuggestionUserActionItems = await getInlineSuggestions(
        document,
        position,
        lineToExtractPrompt,
        prompt,
        promptDescription,
        isTaskNameMatch
      );
      return inlineSuggestionUserActionItems;
    },
  };
  return provider;
}

export async function requestInlineSuggest(
  documentContext: string,
  position: Position,
  prompt: string
): Promise<SuggestionResult> {
  wisdomManager.wisdomStatusBar.tooltip = "processing...";
  const result = await getInlineSuggestion(documentContext, prompt);
  wisdomManager.wisdomStatusBar.tooltip = "Done";
  return result;
}
async function getInlineSuggestion(
  context: string,
  prompt: string
): Promise<SuggestionResult> {
  const inputData: RequestParams = {
    context: context,
    prompt: prompt,
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function inlineSuggestionTriggerHandler(
  textEditor: vscode.TextEditor,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  edit: vscode.TextEditorEdit
) {
  const document = textEditor.document;
  const wisdomSettings = wisdomManager.settingsManager.settings.wisdomService;
  console.log("inlineSuggestionTriggerHandler invoked by keyboard shortcut");
  if (document.languageId !== "ansible") {
    wisdomManager.wisdomStatusBar.hide();
    return;
  }
  if (!wisdomSettings.enabled && !wisdomSettings.suggestions.enabled) {
    console.debug("wisdom service is disabled");
    wisdomManager.updateWisdomStatusbar();
    return;
  }

  let lineToExtractPrompt: vscode.TextLine | undefined = undefined;
  const currentLine = document.lineAt(textEditor.selection.active.line);
  const cursorPosition = textEditor.selection.active;
  const previousLine = textEditor.document.lineAt(cursorPosition.line - 1);
  if (currentLine.isEmptyOrWhitespace) {
    lineToExtractPrompt = previousLine;
  } else {
    lineToExtractPrompt = currentLine;
  }
  if (lineToExtractPrompt === undefined) {
    return [];
  }
  const taskMatchedPattern = lineToExtractPrompt.text.match(taskRegexEp);
  let isTaskNameMatch = false;

  // prompt is the format expected by wisdom service
  // eg. "-name: create a new file"
  let prompt: string | undefined = undefined;

  // promptDescription is the task name or comment
  // eg. "create a new file" and is used to identify
  // the duplicate suggestion line from the wisdom service
  // response and remove it from the inline suggestion list
  let promptDescription: string | undefined = undefined;
  if (taskMatchedPattern) {
    isTaskNameMatch = true;
    promptDescription = taskMatchedPattern?.groups?.description;
    prompt = `${lineToExtractPrompt.text.trim()}\n`;
  } else {
    // check if the line is a comment line
    const commentMatchedPattern =
      lineToExtractPrompt.text.match(commentRegexEp);
    if (commentMatchedPattern) {
      promptDescription = commentMatchedPattern?.groups?.description;
      prompt = `- name: ${commentMatchedPattern?.groups?.description}` + "\n";
    }
  }
  if (prompt === undefined) {
    return [];
  }
  if (promptDescription === undefined) {
    promptDescription = prompt;
  }

  const currentPosition = textEditor.selection.active;

  const inlineSuggestionUserActionItems = await getInlineSuggestions(
    document,
    currentPosition,
    lineToExtractPrompt,
    prompt,
    promptDescription,
    isTaskNameMatch
  );

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", {
    text: currentSuggestion,
  });

  return inlineSuggestionUserActionItems;
}

async function getInlineSuggestions(
  document: vscode.TextDocument,
  currentPosition: vscode.Position,
  lineToExtractPrompt: vscode.TextLine,
  prompt: string,
  promptDescription: string,
  isTaskNameMatch: boolean
): Promise<vscode.InlineCompletionItem[]> {
  let result: SuggestionResult = {
    predictions: [],
  };
  telemetryData = {};
  const lineBeforePrompt = currentPosition.with(
    currentPosition.line - 1,
    currentPosition.character
  );

  try {
    suggestionId = uuidv4();
    telemetryData["suggestionId"] = suggestionId;
    telemetryData["documentUri"] = document.uri.toString();
    const documentContext = `${document
      .getText(new vscode.Range(new vscode.Position(0, 0), lineBeforePrompt))
      .trim()}\n`;
    telemetryData["request"] = {
      context: documentContext,
      prompt: prompt,
    };
    telemetryData["requestDateTime"] = getCurrentUTCDateTime();

    wisdomManager.wisdomStatusBar.text = "Processing...";
    result = await requestInlineSuggest(
      documentContext,
      currentPosition,
      prompt
    );
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  } catch (error) {
    console.error(error);
    telemetryData["error"] = `${error}`;
    vscode.window.showErrorMessage(`Error in inline suggestions: ${error}`);
  } finally {
    wisdomManager.wisdomStatusBar.text = "Wisdom";
  }

  telemetryData["response"] = result;
  telemetryData["responseDateTime"] = getCurrentUTCDateTime();
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
      if (isTaskNameMatch) {
        insertText = removePromptFromSuggestion(
          prediction,
          lineToExtractPrompt.text,
          promptDescription,
          currentPosition
        );
      }
      insertTexts.push(insertText);
      const inlineSuggestionUserActionItem = new vscode.InlineCompletionItem(
        insertText
      );
      inlineSuggestionUserActionItem.command = {
        title: "Accept or Reject or Modify feedback",
        command: "extension.userInlineSuggestionAction",
        arguments: [suggestionId],
      };
      inlineSuggestionUserActionItems.push(inlineSuggestionUserActionItem);
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
  vscode.commands.executeCommand(
    WisdomCommands.WISDOM_SUGGESTION_USER_ACTION,
    suggestionId,
    true
  );
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
  vscode.commands.executeCommand(
    WisdomCommands.WISDOM_SUGGESTION_USER_ACTION,
    suggestionId,
    false
  );
}

export async function inlineSuggestionUserActionHandler(
  suggestionId: string,
  isSuggestionAccepted = false
) {
  console.log(`User gave feedback on suggestion with ID: ${suggestionId}`);
  telemetryData = {};
  const extSettings = wisdomManager.settingsManager.settings;
  // user feedback is enabled
  if (extSettings.wisdomService.suggestions.userFeedback) {
    telemetryData["userUIFeedbackEnabled"] = true;
    let selection = undefined;
    try {
      selection = await vscode.window.showInformationMessage(
        "Accept or Ignore or Modify suggestion?",
        "Accept",
        "Ignore",
        "Modify"
      );
      let feedback: string | undefined = undefined;
      if (selection === "Accept") {
        telemetryData["userAction"] = "accept";
      } else if (selection === "Ignore") {
        telemetryData["userAction"] = "ignore";
        feedback = await vscode.window.showInputBox({
          placeHolder: "Please provide feedback",
        });
      } else if (selection === "Modify") {
        telemetryData["userAction"] = "modify";
        feedback = await vscode.window.showInputBox({
          placeHolder: "Please provide feedback",
        });
      }
      if (feedback) {
        telemetryData["feedback"] = feedback;
      }
    } catch (error) {
      // handle errors
      telemetryData["error"] = `${error}`;
      console.error(error);
    }
  } else {
    // identify user action based on key pressed
    telemetryData["userUIFeedbackEnabled"] = false;
    if (isSuggestionAccepted) {
      telemetryData["userAction"] = "accept";
    } else {
      telemetryData["userAction"] = "ignore";
    }
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
