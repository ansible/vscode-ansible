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
} from "../../definitions/lightspeed";
import {
  LIGHTSPEED_SUGGESTION_ATTRIBUTIONS_URL,
  LIGHTSPEED_SUGGESTION_COMPLETION_URL,
  LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
} from "../../definitions/constants";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import { getBaseUri } from "./utils/webUtils";

export class LightSpeedAPI {
  private axiosInstance: AxiosInstance | undefined;
  private settingsManager: SettingsManager;
  private lightSpeedAuthProvider: LightSpeedAuthenticationProvider;

  constructor(
    settingsManager: SettingsManager,
    lightSpeedAuthProvider: LightSpeedAuthenticationProvider
  ) {
    this.settingsManager = settingsManager;
    this.lightSpeedAuthProvider = lightSpeedAuthProvider;
  }

  private async getApiInstance(): Promise<AxiosInstance | undefined> {
    const authToken = await this.lightSpeedAuthProvider.grantAccessToken();
    if (authToken === undefined) {
      console.error("Ansible Lightspeed authentication failed.");
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
      console.error("Ansible Lightspeed instance is not initialized.");
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
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as CompletionResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_COMPLETION_URL,
        inputData,
        {
          timeout: 20000,
        }
      );

      if (
        response.status === 204 ||
        response.data.predictions.length === 0 ||
        // currently we only support one inline suggestion
        !response.data.predictions[0]
      ) {
        vscode.window.showInformationMessage(
          "Ansible Lightspeed does not have a suggestion based on your input."
        );
        return {} as CompletionResponseParams;
      }
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err && "response" in err) {
        if (err?.response?.status === 401) {
          vscode.window.showErrorMessage(
            "User not authorized to access Ansible Lightspeed."
          );
        } else if (err?.response?.status === 429) {
          vscode.window.showErrorMessage(
            "Too many requests to Ansible Lightspeed. Please try again after some time."
          );
        } else if (err?.response?.status === 400) {
          vscode.window.showErrorMessage(
            "Bad Request response. Please try again."
          );
        } else if (err?.response?.status.toString().startsWith("5")) {
          vscode.window.showErrorMessage(
            "Ansible Lightspeed encountered an error. Try again after some time."
          );
        } else {
          vscode.window.showErrorMessage(
            `Failed to fetch inline suggestion from Ansible Lightspeed with status code: ${err?.response?.status}. Try again after some time.`
          );
        }
      } else if (err.code === AxiosError.ECONNABORTED) {
        vscode.window.showErrorMessage(
          "Ansible Lightspeed connection timeout. Try again after some time."
        );
      } else {
        vscode.window.showErrorMessage(
          "Failed to fetch inline suggestion from Ansible Lightspeed. Try again after some time."
        );
      }
      return {} as CompletionResponseParams;
    }
  }

  public async feedbackRequest(
    inputData: FeedbackRequestParams,
    showAuthErrorMessage = false,
    showInfoMessage = false
  ): Promise<FeedbackResponseParams> {
    // return early if the user is not authenticated
    if (
      !(await this.lightSpeedAuthProvider.isAuthenticated()) &&
      !showAuthErrorMessage
    ) {
      return {} as FeedbackResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as FeedbackResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
        inputData,
        {
          timeout: 20000,
        }
      );
      if (showInfoMessage) {
        vscode.window.showInformationMessage("Thanks for your feedback!");
      }
      console.log(`Event sent to lightspeed: ${JSON.stringify(inputData)}}`);
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err && "response" in err) {
        if (err?.response?.status === 401) {
          vscode.window.showErrorMessage(
            "User not authorized to access Ansible Lightspeed."
          );
        } else if (err?.response?.status === 400) {
          console.error(`Bad Request response. Please open an Github issue.`);
        } else {
          console.error(
            "Ansible Lightspeed encountered an error while sending feedback."
          );
        }
      } else {
        console.error("Failed to send feedback to Ansible Lightspeed.");
      }
      return {} as FeedbackResponseParams;
    }
  }

  public async attributionsRequest(
    inputData: AttributionsRequestParams
  ): Promise<AttributionsResponseParams> {
    // return early if the user is not authenticated
    if (!(await this.lightSpeedAuthProvider.isAuthenticated())) {
      vscode.window.showErrorMessage(
        "User not authenticated to use Ansible Lightspeed."
      );
      return {} as AttributionsResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as AttributionsResponseParams;
    }
    try {
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_ATTRIBUTIONS_URL,
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
            "User not authorized to access Ansible Lightspeed."
          );
        } else if (err?.response?.status === 400) {
          console.error(`Bad Request response. Please open an Github issue.`);
        } else {
          console.error(
            "Ansible Lightspeed encountered an error while fetching attributions."
          );
        }
      } else {
        console.error("Failed to fetch attribution from Ansible Lightspeed.");
      }
      return {} as AttributionsResponseParams;
    }
  }
}
