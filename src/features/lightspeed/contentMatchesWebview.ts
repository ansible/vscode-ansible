import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  ContentMatchesRequestParams,
  ContentMatchesResponseParams,
  IContentMatch,
  IContentMatchParams,
  ISuggestionDetails,
} from "../../interfaces/lightspeed";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import * as yaml from "yaml";

export class ContentMatchesWebview implements vscode.WebviewViewProvider {
  public static readonly viewType = "ansible.lightspeed.trainingMatchPanel";
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public apiInstance: LightSpeedAPI;
  public suggestionDetails: ISuggestionDetails[] = [];

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    apiInstance: LightSpeedAPI
  ) {
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    this.apiInstance = apiInstance;
    this._extensionUri = context.extensionUri;
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    webviewResolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    if (_token.isCancellationRequested) {
      return;
    }
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = await this.getWebviewContent();
  }

  async requestInlineSuggestContentMatches(
    suggestion: string,
    suggestionId: string
  ): Promise<ContentMatchesResponseParams> {
    const taskArray = suggestion
      .trim()
      .split(/\n\s*\n/)
      .map((task) => task.trim());

    const contentMatchesRequestData: ContentMatchesRequestParams = {
      suggestions: taskArray,
      suggestionId: suggestionId,
    };

    const model = this.settingsManager.settings.lightSpeedService.model;
    if (model && model !== "") {
      contentMatchesRequestData.model = model;
    }

    console.log(
      `${getCurrentUTCDateTime().toISOString()}: request content matches from Ansible Lightspeed:\n${JSON.stringify(
        contentMatchesRequestData
      )}`
    );

    const outputData: ContentMatchesResponseParams =
      await this.apiInstance.contentMatchesRequest(contentMatchesRequestData);
    console.log(
      `${getCurrentUTCDateTime().toISOString()}: response data from Ansible lightspeed:\n${JSON.stringify(
        outputData
      )}`
    );
    return outputData;
  }

  public async showContentMatches() {
    if (!this._view || !this._view.visible) {
      return;
    }
    this._view.webview.html = await this.getWebviewContent();
  }

  public async clearContentMatches() {
    if (!this._view) {
      return;
    }
    this._view.webview.html = "";
  }

  private async getWebviewContent(): Promise<string> {
    const noContentMatchesFoundHtml = `<html><body>No training matches found for the latest accepted suggestion.</body></html>`;
    if (
      this.suggestionDetails.length === 0 ||
      !this.suggestionDetails[0].suggestion
    ) {
      return noContentMatchesFoundHtml;
    }
    const suggestion = this.suggestionDetails[0].suggestion;
    const suggestionId = this.suggestionDetails[0].suggestionId;

    const contentMatchResponses = await this.requestInlineSuggestContentMatches(
      suggestion,
      suggestionId
    );
    console.log(contentMatchResponses);
    if (
      Object.keys(contentMatchResponses).length === 0 ||
      contentMatchResponses.contentmatches.length === 0
    ) {
      return noContentMatchesFoundHtml;
    }

    let contentMatchesHtml = "";
    if (
      !contentMatchResponses.contentmatches[0].hasOwnProperty("contentmatch")
    ) {
      return noContentMatchesFoundHtml;
    }

    let suggestedTasks = undefined;
    try {
      suggestedTasks = yaml.parse(suggestion, {
        keepSourceTokens: true,
      });
    } catch (err) {
      console.log(err);
      return noContentMatchesFoundHtml;
    }
    if (
      !suggestedTasks ||
      !Array.isArray(suggestedTasks) ||
      suggestedTasks.length !== contentMatchResponses.contentmatches.length
    ) {
      return noContentMatchesFoundHtml;
    }

    for (let taskIndex = 0; taskIndex < suggestedTasks.length; taskIndex++) {
      let taskNameDescription = suggestedTasks[taskIndex].name;
      if (!taskNameDescription) {
        taskNameDescription = "";
      }

      const contentMatchValue = contentMatchResponses.contentmatches[taskIndex];
      contentMatchesHtml += this.renderContentMatchWithTasKDescription(
        <IContentMatchParams[]>(<IContentMatch>contentMatchValue).contentmatch,
        taskNameDescription || ""
      );
    }
    const html = `<html>
        <body>
          ${contentMatchesHtml}
        </body>
      </html>
      `;
    return html;
  }

  private renderContentMatches(
    contentMatchResponse: IContentMatchParams
  ): string {
    return `
      <details>
        <summary>${contentMatchResponse.repo_name}</summary>
        <ul>
          <li>URL: <a href=${contentMatchResponse.repo_url}>${contentMatchResponse.repo_url}</a></li>
          <li>Path: ${contentMatchResponse.path}</li>
          <li>Data Source: ${contentMatchResponse.data_source}</li>
          <li>License: ${contentMatchResponse.license}</li>
          <li>Ansible type: ${contentMatchResponse.ansible_type}</li>
          <li>Score: ${contentMatchResponse.score}</li>
        </ul>
      </details>
    `;
  }

  private renderContentMatchWithTasKDescription(
    contentMatchesResponse: IContentMatchParams[],
    taskDescription: string
  ): string {
    let taskContentMatch = "";
    for (let index = 0; index < contentMatchesResponse.length; index++) {
      taskContentMatch += `${this.renderContentMatches(
        contentMatchesResponse[index]
      )}`;
    }

    return `
    <ul>
      <details>
        <summary>${taskDescription}</summary>
        <ul>
        ${taskContentMatch}
        </ul>
      </details>
    </ul>
    `;
  }
}
