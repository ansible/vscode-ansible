import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosError } from "axios";

import { ExtensionSettings } from "../../interfaces/extensionSettings";
import { SettingsManager } from "../../settings";
import { SuggestionResult, RequestParams } from "../../definitions/wisdom";

function getAuthToken(settings: ExtensionSettings): string | undefined {
  return settings.wisdomService.authToken;
}
export class WisdomAPI {
  private axiosInstance: AxiosInstance | undefined;
  private settingsManager: SettingsManager;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
    this.initialize();
  }

  public initialize(): void {
    const settings = this.settingsManager.settings;
    const authToken = getAuthToken(settings);
    const headers = {
      "Content-Type": "application/json",
    };
    if (authToken !== undefined) {
      Object.assign(headers, { Authorization: `Bearer ${authToken}` });
    }
    this.axiosInstance = axios.create({
      baseURL: `${settings.wisdomService.basePath}/api/ai`,
      headers: headers,
    });
  }

  public reInitialize(): void {
    this.initialize();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getData(urlPath: string): Promise<any> {
    if (this.axiosInstance === undefined) {
      throw new Error("Ansible wisdom service instance is not initialized");
    }
    try {
      const response = await this.axiosInstance.get(urlPath, {
        timeout: 20000,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async postData(
    urlPath: string,
    inputData: RequestParams
  ): Promise<SuggestionResult> {
    if (this.axiosInstance === undefined) {
      throw new Error("Ansible wisdom service instance is not initialized");
    }
    try {
      const response = await this.axiosInstance.post(urlPath, inputData, {
        timeout: 20000,
      });
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err && "response" in err) {
        if (err?.response?.status === 401) {
          vscode.window.showErrorMessage(
            "User not authorized to access Ansible wisdom service."
          );
        } else if (err?.response?.status === 400) {
          vscode.window.showErrorMessage("Bad Request. Please try again...");
        } else if (err?.response?.status === 429) {
          vscode.window.showErrorMessage(
            "Too many request to Ansible wisdom service. Please try again after 30 seconds..."
          );
        } else if (err?.response?.status === 500) {
          vscode.window.showErrorMessage(
            "Ansible wisdom service connection reset. Please try again after sometime..."
          );
        } else {
          vscode.window.showErrorMessage(
            `Error from Ansible wisdom service: ${error}`
          );
        }
      } else if (err.code === AxiosError.ECONNABORTED) {
        vscode.window.showErrorMessage(
          "Ansible wisdom service connection timeout. Please try again after sometime..."
        );
      } else {
        vscode.window.showErrorMessage(
          `Error from Ansible wisdom service: ${error}`
        );
      }
      return {} as SuggestionResult;
    }
  }
}
