import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosError } from "axios";

import { SettingsManager } from "../../settings";
import {
  CompletionResponseParams,
  CompletionRequestParams,
  FeedbackRequestParams,
  FeedbackResponseParams,
} from "../../definitions/wisdom";
import {
  WISDOM_SUGGESTION_COMPLETION_URL,
  WISDOM_SUGGESTION_FEEDBACK_URL,
} from "../../definitions/constants";
import { WisdomAuthenticationProvider } from "./wisdomOAuthProvider";

export class WisdomAPI {
  private axiosInstance: AxiosInstance | undefined;
  private settingsManager: SettingsManager;
  private wisdomAuthProvider: WisdomAuthenticationProvider;

  constructor(
    settingsManager: SettingsManager,
    wisdomAuthProvider: WisdomAuthenticationProvider
  ) {
    this.settingsManager = settingsManager;
    this.wisdomAuthProvider = wisdomAuthProvider;
  }

  private async getApiInstance(): Promise<AxiosInstance | undefined> {
    const authToken = await this.wisdomAuthProvider.grantAccessToken();
    if (authToken === undefined) {
      console.log("Ansible wisdom service authentication failed");
      return;
    }
    const headers = {
      "Content-Type": "application/json",
    };
    if (authToken !== undefined) {
      Object.assign(headers, { Authorization: `Bearer ${authToken}` });
    }
    this.axiosInstance = axios.create({
      baseURL: `${this.wisdomAuthProvider.getBaseUri()}/api`,
      headers: headers,
    });
    return this.axiosInstance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getData(urlPath: string): Promise<any> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.log("Ansible wisdom service instance is not initialized");
      return;
    }
    try {
      const response = await axiosInstance.get(urlPath, {
        timeout: 20000,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async completionRequest(
    inputData: CompletionRequestParams
  ): Promise<CompletionResponseParams> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.log("Ansible wisdom service instance is not initialized");
      return {} as CompletionResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        WISDOM_SUGGESTION_COMPLETION_URL,
        inputData,
        {
          timeout: 20000,
        }
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err && "response" in err) {
        if (err?.response?.status === 401) {
          vscode.window.showErrorMessage(
            "User not authorized to access Ansible wisdom service."
          );
        } else if (err?.response?.status === 429) {
          vscode.window.showErrorMessage(
            "Too many requests to the Ansible wisdom service. Please try again after sometime..."
          );
        } else if (err?.response?.status === 400) {
          vscode.window.showErrorMessage(
            "Bad Request response. Please try again..."
          );
        } else if (err?.response?.status.toString().startsWith("5")) {
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
      return {} as CompletionResponseParams;
    }
  }

  public async feedbackRequest(
    inputData: FeedbackRequestParams
  ): Promise<FeedbackResponseParams> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.log("Ansible wisdom service instance is not initialized");
      return {} as FeedbackResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        WISDOM_SUGGESTION_FEEDBACK_URL,
        inputData,
        {
          timeout: 20000,
        }
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err && "response" in err) {
        if (err?.response?.status === 401) {
          vscode.window.showErrorMessage(
            "User not authorized to access Ansible wisdom service."
          );
        } else if (err?.response?.status === 400) {
          vscode.window.showErrorMessage(
            "Bad Request response. Please try again..."
          );
        } else if (err?.response?.status.toString().startsWith("5")) {
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
      return {} as FeedbackResponseParams;
    }
  }
}
