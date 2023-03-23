import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { WisdomAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  AttributionsRequestParams,
  AttributionsResponseParams,
  IAttributionsParams,
  ISuggestionDetails,
} from "../../definitions/wisdom";
import { getCurrentUTCDateTime } from "../utils/dateTime";

export class AttributionsWebview implements vscode.WebviewViewProvider {
  public static readonly viewType = "ansible.wisdom.trainingMatchPanel";
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public apiInstance: WisdomAPI;
  public suggestionDetails: ISuggestionDetails[] = [];

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    apiInstance: WisdomAPI
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

  async requestInlineSuggestAttributions(
    suggestion: string,
    suggestionId: string
  ): Promise<AttributionsResponseParams> {
    const attributionsRequestData: AttributionsRequestParams = {
      suggestion: suggestion,
      suggestionId: suggestionId,
    };
    console.log(
      `${getCurrentUTCDateTime().toISOString()}: request attributions from wisdom service:\n${JSON.stringify(
        attributionsRequestData
      )}`
    );

    const outputData: AttributionsResponseParams =
      await this.apiInstance.attributionsRequest(attributionsRequestData);

    console.log(
      `${getCurrentUTCDateTime().toISOString()}: response data from wisdom service:\n${JSON.stringify(
        outputData
      )}`
    );
    return outputData;
  }

  public async showAttributions() {
    if (!this._view || !this._view.visible) {
      return;
    }
    this._view.webview.html = await this.getWebviewContent();
  }

  public async clearAttributions() {
    if (!this._view) {
      return;
    }
    this._view.webview.html = "";
  }

  private async getWebviewContent(): Promise<string> {
    const noAttributionsFoundHtml = `<html><body>No attributions found for the latest accepted suggestion.</body></html>`;
    if (
      this.suggestionDetails.length === 0 ||
      !this.suggestionDetails[0].suggestion
    ) {
      return noAttributionsFoundHtml;
    }
    const suggestion = this.suggestionDetails[0].suggestion;
    const suggestionId = this.suggestionDetails[0].suggestionId;

    const attributionResponses = await this.requestInlineSuggestAttributions(
      suggestion,
      suggestionId
    );
    console.log(attributionResponses);
    if (attributionResponses.attributions.length === 0) {
      return noAttributionsFoundHtml;
    }
    const html = `<html>
      <body>
        ${attributionResponses.attributions
          .map(this.renderAttribution)
          .join("")}
      </body>
    </html>
  `;
    return html;
  }
  private renderAttribution(attributionResponse: IAttributionsParams): string {
    return `
      <details>
        <summary>${attributionResponse.repo_name}</summary>
        <ul>
          <li>URL: <a href=${attributionResponse.repo_url}>${attributionResponse.repo_url}</a></li>
          <li>Path: ${attributionResponse.path}</li>
          <li>Data Source: ${attributionResponse.data_source}</li>
          <li>License: ${attributionResponse.license}</li>
          <li>Ansible type: ${attributionResponse.ansible_type}</li>
          <li>Score: ${attributionResponse.score}</li>
        </ul>
      </details>
    `;
  }
}
