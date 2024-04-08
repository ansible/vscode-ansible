import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import { SettingsManager } from "../../settings";
import {
  ContentMatchesRequestParams,
  ContentMatchesResponseParams,
  IContentMatch,
  IContentMatchParams,
  ISuggestionDetails,
  IError,
} from "../../interfaces/lightspeed";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import * as yaml from "yaml";

export class ContentMatchesWebview implements vscode.WebviewViewProvider {
  public static readonly viewType = "ansible.lightspeed.trainingMatchPanel";
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private context;
  private lightSpeedAuthProvider: LightSpeedAuthenticationProvider;
  public client;
  public settingsManager: SettingsManager;
  public apiInstance: LightSpeedAPI;
  public suggestionDetails: ISuggestionDetails[] = [];

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    apiInstance: LightSpeedAPI,
    lightSpeedAuthProvider: LightSpeedAuthenticationProvider,
  ) {
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    this.apiInstance = apiInstance;
    this._extensionUri = context.extensionUri;
    this.lightSpeedAuthProvider = lightSpeedAuthProvider;
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    webviewResolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
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
    suggestionId: string,
  ): Promise<ContentMatchesResponseParams | IError> {
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

    this.log(
      `${getCurrentUTCDateTime().toISOString()}: request content matches from Ansible Lightspeed:\n${JSON.stringify(
        contentMatchesRequestData,
      )}`,
    );

    const outputData: ContentMatchesResponseParams | IError =
      await this.apiInstance.contentMatchesRequest(contentMatchesRequestData);
    this.log(
      `${getCurrentUTCDateTime().toISOString()}: response data from Ansible lightspeed:\n${JSON.stringify(
        outputData,
      )}`,
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

  public isError(
    contentMatchResponses: ContentMatchesResponseParams | IError,
  ): contentMatchResponses is IError {
    return (contentMatchResponses as IError).code !== undefined;
  }

  private async getWebviewContent(): Promise<string> {
    const noActiveSuggestionHtml = `
      <html>
        <body>
          <p>Training matches will be displayed here after you accept an inline suggestion.</p>
        </body>
      </html>`;
    if (
      this.suggestionDetails.length === 0 ||
      !this.suggestionDetails[0].suggestion
    ) {
      return noActiveSuggestionHtml;
    }

    const suggestion = this.suggestionDetails[0].suggestion;
    const suggestionId = this.suggestionDetails[0].suggestionId;
    const contentMatchResponses = await this.requestInlineSuggestContentMatches(
      suggestion,
      suggestionId,
    );
    this.log(contentMatchResponses);

    if (this.isError(contentMatchResponses)) {
      return this.getErrorWebviewContent(contentMatchResponses);
    } else {
      return this.getContentMatchWebviewContent(
        suggestion,
        contentMatchResponses,
      );
    }
  }

  private async getErrorWebviewContent(error: IError) {
    let detail: unknown = error.detail;
    if (typeof error.detail === "string") {
      detail = error.detail as string;
    } else if (typeof error.detail === "object") {
      detail = JSON.stringify(error.detail, undefined, "  ");
    }
    let htmlDetail: string = "";
    if (detail !== undefined) {
      htmlDetail = `
        <details>
          <summary><b>Detail:</b></summary>
          <p>${detail}</p>
        </details>
      `;
    }

    const errorHtml = `
      <html>
        <head>
          <!-- https://code.visualstudio.com/api/extension-guides/webview#content-security-policy -->
          <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
        </head>
        <body>
        <p>An error occurred trying to retrieve the training matches.</p>
        <p><b>Message:</b> ${error.message}</p>
        ${htmlDetail}
        </body>
      </html>
    `;
    return errorHtml;
  }

  private async getContentMatchWebviewContent(
    suggestion: string,
    contentMatchResponses: ContentMatchesResponseParams,
  ) {
    const noContentMatchesFoundHtml = `
      <html>
        <body>
          <p>No training matches found for the latest accepted suggestion.</p>
        </body>
      </html>
    `;
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
      this.log(err);
      return noContentMatchesFoundHtml;
    }
    if (
      !suggestedTasks ||
      !Array.isArray(suggestedTasks) ||
      suggestedTasks.length !== contentMatchResponses.contentmatches.length
    ) {
      return noContentMatchesFoundHtml;
    }

    const rhUserHasSeat = await this.lightSpeedAuthProvider.rhUserHasSeat();
    for (let taskIndex = 0; taskIndex < suggestedTasks.length; taskIndex++) {
      let taskNameDescription = suggestedTasks[taskIndex].name;
      if (!taskNameDescription) {
        taskNameDescription = "";
      }

      const contentMatchValue = contentMatchResponses.contentmatches[taskIndex];
      contentMatchesHtml += this.renderContentMatchWithTasKDescription(
        <IContentMatchParams[]>(<IContentMatch>contentMatchValue).contentmatch,
        taskNameDescription || "",
        rhUserHasSeat === true,
      );
    }
    const html = `
      <html>
        <body>
          ${contentMatchesHtml}
        </body>
      </html>
    `;
    return html;
  }

  private renderContentMatches(
    contentMatchResponse: IContentMatchParams,
    rhUserHasSeat: boolean,
  ): string {
    const licenseLine = rhUserHasSeat
      ? `<li>License: ${contentMatchResponse.license}</li>`
      : "";
    return `
      <details>
        <summary>${contentMatchResponse.repo_name}</summary>
        <ul>
          <li>URL: <a href=${contentMatchResponse.repo_url}>${contentMatchResponse.repo_url}</a></li>
          <li>Path: ${contentMatchResponse.path}</li>
          <li>Data Source: ${contentMatchResponse.data_source_description}</li>
          ${licenseLine}
          <li>Score: ${contentMatchResponse.score}</li>
        </ul>
      </details>
    `;
  }

  private renderContentMatchWithTasKDescription(
    contentMatchesResponse: IContentMatchParams[],
    taskDescription: string,
    rhUserHasSeat: boolean,
  ): string {
    let taskContentMatch = "";
    for (let index = 0; index < contentMatchesResponse.length; index++) {
      taskContentMatch += `${this.renderContentMatches(
        contentMatchesResponse[index],
        rhUserHasSeat,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public log(message: any): void {
    console.log(message);
  }
}
