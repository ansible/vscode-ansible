import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosError } from "axios";

import { SettingsManager } from "../../settings";
import {
  CompletionResponseParams,
  CompletionRequestParams,
  FeedbackRequestParams,
  FeedbackResponseParams,
  AttributionsRequestParams,
  AttributionsResponseParams,
} from "../../definitions/wisdom";
import {
  WISDOM_SUGGESTION_ATTRIBUTIONS_URL,
  WISDOM_SUGGESTION_COMPLETION_URL,
  WISDOM_SUGGESTION_FEEDBACK_URL,
} from "../../definitions/constants";
import { WisdomAuthenticationProvider } from "./wisdomOAuthProvider";
import { getBaseUri } from "./utils/webUtils";

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
      console.error("Ansible Wisdom service authentication failed.");
      return;
    }
    const headers = {
      "Content-Type": "application/json",
    };
    if (authToken !== undefined) {
      Object.assign(headers, { Authorization: `Bearer ${authToken}` });
    }
    this.axiosInstance = axios.create({
      baseURL: `${getBaseUri(this.settingsManager)}/api`,
      headers: headers,
    });
    return this.axiosInstance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getData(urlPath: string): Promise<any> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Wisdom service instance is not initialized.");
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
      console.error("Ansible Wisdom service instance is not initialized.");
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
            "User not authorized to access Ansible Wisdom service."
          );
        } else if (err?.response?.status === 429) {
          vscode.window.showErrorMessage(
            "Too many requests to the Ansible Wisdom service. Please try again after sometime."
          );
        } else if (err?.response?.status === 400) {
          vscode.window.showErrorMessage(
            "Bad Request response. Please try again."
          );
        } else if (err?.response?.status.toString().startsWith("5")) {
          vscode.window.showErrorMessage(
            "The Ansible Wisdom service encountered an error. Try again after some time."
          );
        } else {
          vscode.window.showErrorMessage(
            `Failed to fetch inline suggestion from the Ansible Wisdom service with status code: ${err?.response?.status}. Try again after some time.`
          );
        }
      } else if (err.code === AxiosError.ECONNABORTED) {
        vscode.window.showErrorMessage(
          "The Ansible Wisdom service connection timeout. Try again after some time."
        );
      } else {
        vscode.window.showErrorMessage(
          "Failed to fetch inline suggestion from the Project Wisdom service. Try again after some time."
        );
      }
      return {} as CompletionResponseParams;
    }
  }

  public async feedbackRequest(
    inputData: FeedbackRequestParams
  ): Promise<FeedbackResponseParams> {
    // return early if the user is not authenticated
    if (!(await this.wisdomAuthProvider.isAuthenticated())) {
      return {} as FeedbackResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Wisdom service instance is not initialized.");
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
            "User not authorized to access Ansible Wisdom service."
          );
        } else if (err?.response?.status === 400) {
          console.error(`Bad Request response. Please open an Github issue.`);
        } else {
          console.error(
            "The Ansible Wisdom service encountered an error while sending feedback."
          );
        }
      } else {
        console.error("Failed to send feedback to Ansible Wisdom service.");
      }
      return {} as FeedbackResponseParams;
    }
  }

  public async attributionsRequest(
    inputData: AttributionsRequestParams
  ): Promise<AttributionsResponseParams> {
    // return early if the user is not authenticated
    if (!(await this.wisdomAuthProvider.isAuthenticated())) {
      vscode.window.showErrorMessage(
        "User not authenticated to use Wisdom service."
      );
      return {} as AttributionsResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Wisdom service instance is not initialized.");
      return {} as AttributionsResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        WISDOM_SUGGESTION_ATTRIBUTIONS_URL,
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
            "User not authorized to access Ansible Wisdom service."
          );
        } else if (err?.response?.status === 400) {
          console.error(`Bad Request response. Please open an Github issue.`);
        } else {
          console.error(
            "The Ansible Wisdom service encountered an error while fetching attributions."
          );
        }
      } else {
        console.error(
          "Failed to fetch attribution from Ansible Wisdom service."
        );
      }
      return {} as AttributionsResponseParams;
    }
  }
}
