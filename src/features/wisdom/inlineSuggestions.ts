import * as vscode from "vscode";
import { window, TextDocument, Position } from "vscode";

import { v4 as uuidv4 } from "uuid";

import { removePromptFromSuggestion } from "../utils/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { wisdomManager, context } from "../../extension";
import { WisdomCommands } from "../../definitions/constants";
import { resetKeyInput, getKeyInput } from "../../utils/keyInputUtils";

let suggestionId = "";
let currentSuggestion: string = "";
const commentRegexEp =
  /(?<blank>\s*)(?<comment>#\s*)(?<description>.*)(?<end>$)/;
const taskRegexEp =
  /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;

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
  userAction?: "accept" | "ignore" | "modify";
  suggestionId?: string;
  feedback?: string;
  userUIFeedbackEnabled?: boolean;
  error?: string;
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
      let wisdomSetting = wisdomManager.settingsManager.settings.wisdomService;
      if (!wisdomSetting.enabled && !wisdomSetting.suggestions.enabled) {
        console.debug("wisdom service is disabled");
        wisdomManager.updateWisdomStatusbar();
        return [];
      }
      let editor = vscode.window.activeTextEditor;
      let currentLine = editor?.document.lineAt(editor.selection.active.line);
      if (!currentLine?.isEmptyOrWhitespace) {
        return [];
      }
      console.log("provideInlineCompletionItems triggered by user edits");
      const lineToExtractPrompt = document.lineAt(position.line - 1);
      let matchedPattern = lineToExtractPrompt.text.match(taskRegexEp);
      let isTaskNameMatch = false;

      if (position.line <= 0) {
        return;
      }
      if (matchedPattern) {
        isTaskNameMatch = true;
      } else {
        matchedPattern = lineToExtractPrompt.text.match(commentRegexEp);
      }
      const prompt = matchedPattern?.groups?.description;
      if (!prompt) {
        return [];
      }
      if (token?.isCancellationRequested) {
        return [];
      }
      let inlineSuggestionUserActionItems = await getInlineSuggestions(
        document,
        position,
        lineToExtractPrompt,
        prompt,
        isTaskNameMatch
      );
      let insertText = inlineSuggestionUserActionItems[0].insertText;
      return inlineSuggestionUserActionItems;
    },
  };
  return provider;
}

export async function requestInlineSuggest(
  documentContext: string,
  position: Position,
  prompt: string
): Promise<any> {
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

export async function inlineSuggestionTriggerHandler(
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
) {
  let document = textEditor.document;
  let wisdomSettings = wisdomManager.settingsManager.settings.wisdomService;
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
  let currentLine = document.lineAt(textEditor.selection.active.line);
  let cursorPosition = textEditor.selection.active;
  let previousLine = textEditor.document.lineAt(cursorPosition.line - 1);
  if (currentLine.isEmptyOrWhitespace) {
    lineToExtractPrompt = previousLine;
  } else {
    lineToExtractPrompt = currentLine;
  }
  if (lineToExtractPrompt === undefined) {
    return [];
  }
  let taskMatchedPattern = lineToExtractPrompt.text.match(taskRegexEp);
  let isTaskNameMatch = false;
  let prompt: string | undefined = undefined;
  if (taskMatchedPattern) {
    isTaskNameMatch = true;
    prompt = taskMatchedPattern?.groups?.description;
  } else {
    // check if the line is a comment line
    let commentMatchedPattern = lineToExtractPrompt.text.match(commentRegexEp);
    if (commentMatchedPattern) {
      prompt = commentMatchedPattern?.groups?.description;
    }
  }
  if (prompt === undefined) {
    return [];
  }

  let currentPostion = textEditor.selection.active;

  let inlineSuggestionUserActionItems = await getInlineSuggestions(
    document,
    currentPostion,
    lineToExtractPrompt,
    prompt,
    isTaskNameMatch
  );

  // textEditor.edit((editBuilder) => {
  //   editBuilder.insert(currentPostion, currentSuggestion);
  // });
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", {
    text: currentSuggestion,
  });

  return currentSuggestion;
}

async function getInlineSuggestions(
  document: vscode.TextDocument,
  currentPostion: vscode.Position,
  lineToExtractPrompt: vscode.TextLine,
  prompt: string,
  isTaskNameMatch: boolean
): Promise<vscode.InlineCompletionItem[]> {
  let result: SuggestionResult = {
    predictions: [],
  };
  telemetryData = {};
  try {
    suggestionId = uuidv4();
    telemetryData["suggestionId"] = suggestionId;
    telemetryData["documentUri"] = document.uri.toString();
    const documentContext = document.getText(
      new vscode.Range(new vscode.Position(0, 0), currentPostion)
    );
    telemetryData["request"] = {
      context: documentContext,
      prompt: prompt,
    };
    telemetryData["requestDateTime"] = getCurrentUTCDateTime();

    wisdomManager.wisdomStatusBar.text = "Processing...";
    result = await requestInlineSuggest(
      documentContext,
      currentPostion,
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
  let inlineSuggestionUserActionItems: vscode.InlineCompletionItem[] = [];
  let insertTexts: string[] = [];
  if (result && result.predictions.length > 0) {
    result.predictions.forEach((prediction) => {
      let insertText = prediction;
      if (isTaskNameMatch) {
        insertText = removePromptFromSuggestion(
          prediction,
          lineToExtractPrompt.text,
          currentPostion
        );
      }
      insertTexts.push(insertText);
      let inlineSuggestionUserActionItem = new vscode.InlineCompletionItem(
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
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
) {
  console.log("inlineSuggestionCommitHandler triggered");
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // let selection = editor.selection;
  // // Insert the suggestion
  // editor.edit((editBuilder) => {
  //   editBuilder.insert(selection.start, currentSuggestion as string);
  // });
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
  textEditor: vscode.TextEditor,
  edit: vscode.TextEditorEdit
) {
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
  isSuggestionAccepted: boolean = false
) {
  console.log(`User gave feedback on suggestion with ID: ${suggestionId}`);
  telemetryData = {};
  let extSettings = wisdomManager.settingsManager.settings;
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
