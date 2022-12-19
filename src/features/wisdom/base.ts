import * as vscode from "vscode";
import {
  ExtensionContext,
  window,
  StatusBarAlignment,
  StatusBarItem,
  ThemeColor,
} from "vscode";

import { WisdomAPI } from "./api";
import { ExtensionSettings } from "../../interfaces/extensionSettings";
import { removePromptFromSuggestion } from "../utils/wisdom";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { getCurrentUTCDateTime } from "../utils/dateTime";

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
}

export class WisdomManager {
  private context;
  private settings: ExtensionSettings;
  private wisdomStatusBar: StatusBarItem;
  private apiInstance: WisdomAPI;
  private telemetry: TelemetryManager;

  constructor(
    context: ExtensionContext,
    settings: ExtensionSettings,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.settings = settings;
    this.telemetry = telemetry;
    this.apiInstance = new WisdomAPI(settings);

    // create a new ansible wisdom status bar item that we can manage
    this.wisdomStatusBar = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
    );

    this.handleStatusBar();
  }

  private handleStatusBar() {
    //wisdomStatusBar.command = await window.showInputBox("Enable Wisdom")
    this.wisdomStatusBar.text = "Wisdom";
    //wisdomStatusBar.color = "#FF0000";
    this.wisdomStatusBar.backgroundColor = new ThemeColor(
      "statusBarItem.prominentForeground"
    );
    this.context.subscriptions.push(this.wisdomStatusBar);
    this.wisdomStatusBar.show();
  }

  public getProvider(): vscode.InlineCompletionItemProvider {
    const provider: vscode.InlineCompletionItemProvider = {
      provideInlineCompletionItems: async (
        document,
        position,
        context,
        token
      ) => {
        const commentRegexEp =
          /(?<blank>\s*)(?<comment>#\s*)(?<description>.*)(?<end>$)/;
        const taskRegexEp =
          /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;
        if (position.line <= 0) {
          return;
        }
        const lineBefore = document.lineAt(position.line - 1).text;
        let matchedPattern = lineBefore.match(taskRegexEp);
        let isTaskNameMatch = false;
        if (matchedPattern) {
          isTaskNameMatch = true;
        } else {
          matchedPattern = lineBefore.match(commentRegexEp);
        }
        const prompt = matchedPattern?.groups?.description;
        if (!prompt) {
          return [];
        }

        console.log(
          `current wisdom settings:\n${this.settings.wisdomService}\n`
        );
        console.log("provideInlineCompletionItems triggered");
        this.wisdomStatusBar.tooltip = "processing...";
        const documentContext = document.getText(
          new vscode.Range(new vscode.Position(0, 0), position)
        );
        const telemetryData: WisdomTelemetryEvent = {
          documentUri: document.uri.toString(),
          request: {
            context: documentContext,
            prompt: prompt,
          },
          requestDateTime: getCurrentUTCDateTime(),
        };
        const result = await this.getInlineSuggestion(documentContext, prompt);
        telemetryData["response"] = result;
        telemetryData["responseDateTime"] = getCurrentUTCDateTime();
        this.telemetry.sendTelemetry("wisdomSuggestionEvent", telemetryData);
        console.debug(
          `response from wisdom service:\n${JSON.stringify(result)}`
        );

        this.wisdomStatusBar.tooltip = "Done";
        if (result && result.predictions.length > 0) {
          let insertText = result.predictions[0];
          if (isTaskNameMatch) {
            // insertText = result.predictions[0];
            insertText = removePromptFromSuggestion(
              result.predictions[0],
              lineBefore,
              position
            );
          }
          return [
            {
              insertText,
            },
          ];
        } else {
          return [];
        }
      },
    };
    return provider;
  }

  public async getInlineSuggestion(
    context: string,
    prompt: string
  ): Promise<any> {
    const inputData = {
      context: context,
      prompt: prompt,
    };
    const outputData: SuggestionResult = await this.apiInstance.postData(
      "/completions/",
      inputData
    );
    return outputData;
  }

  public async acceptSelectedSuggestionHandler(args: any): Promise<void> {
    console.log(`Suggestion accepted with args=${args}`);
    return;
  }
}
