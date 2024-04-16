import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosError } from "axios";

import { SettingsManager } from "../../settings";
import {
  CompletionResponseParams,
  CompletionRequestParams,
  FeedbackRequestParams,
  FeedbackResponseParams,
  ContentMatchesRequestParams,
  ContentMatchesResponseParams,
  IError,
} from "../../interfaces/lightspeed";
import {
  LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
  LIGHTSPEED_SUGGESTION_COMPLETION_URL,
  LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
  LightSpeedCommands,
} from "../../definitions/lightspeed";
import { getBaseUri } from "./utils/webUtils";
import { ANSIBLE_LIGHTSPEED_API_TIMEOUT } from "../../definitions/constants";
import { UserAction } from "../../definitions/lightspeed";
import { mapError } from "./handleApiError";
import { lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";

const UNKNOWN_ERROR: string = "An unknown error occurred.";

export class LightSpeedAPI {
  private axiosInstance: AxiosInstance | undefined;
  private settingsManager: SettingsManager;
  private lightspeedAuthenticatedUser: LightspeedUser;
  private _completionRequestInProgress: boolean;
  private _inlineSuggestionFeedbackIgnoredPending: boolean;
  private _extensionVersion: string;

  constructor(
    settingsManager: SettingsManager,
    lightspeedAuthenticatedUser: LightspeedUser,
    context: vscode.ExtensionContext,
  ) {
    this.settingsManager = settingsManager;
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
    this._completionRequestInProgress = false;
    this._inlineSuggestionFeedbackIgnoredPending = false;
    this._extensionVersion = context.extension.packageJSON.version;
  }

  get completionRequestInProgress(): boolean {
    return this._completionRequestInProgress;
  }

  get inlineSuggestionFeedbackIgnoredPending(): boolean {
    return this._inlineSuggestionFeedbackIgnoredPending;
  }

  set inlineSuggestionFeedbackIgnoredPending(newValue: boolean) {
    this._inlineSuggestionFeedbackIgnoredPending = newValue;
  }

  private async getApiInstance(): Promise<AxiosInstance | undefined> {
    const authToken =
      await this.lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
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
    const response = await axiosInstance.get(urlPath, {
      timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
    });
    return response.data;
  }

  public async completionRequest(
    inputData: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as CompletionResponseParams;
    }
    console.log(
      `[ansible-lightspeed] Completion request sent to lightspeed: ${JSON.stringify(
        inputData,
      )}`,
    );
    try {
      this._completionRequestInProgress = true;
      this._inlineSuggestionFeedbackIgnoredPending = false;
      const requestData = {
        ...inputData,
        metadata: {
          ...inputData.metadata,
          ansibleExtensionVersion: this._extensionVersion,
        },
      };
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_COMPLETION_URL,
        requestData,
        {
          timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
        },
      );
      if (
        response.status === 204 ||
        response.data.predictions.length === 0 ||
        // currently we only support one inline suggestion
        !response.data.predictions[0]
      ) {
        this._inlineSuggestionFeedbackIgnoredPending = false;
        vscode.window.showInformationMessage(
          "Ansible Lightspeed does not have a suggestion based on your input.",
        );
        return {} as CompletionResponseParams;
      }
      console.log(
        `[ansible-lightspeed] Completion response: ${JSON.stringify(
          response.data,
        )}`,
      );
      return response.data;
    } catch (error) {
      this._inlineSuggestionFeedbackIgnoredPending = false;
      const err = error as AxiosError;
      const mappedError: IError = mapError(err);
      vscode.window.showErrorMessage(mappedError.message ?? UNKNOWN_ERROR);
      return {} as CompletionResponseParams;
    } finally {
      if (this._inlineSuggestionFeedbackIgnoredPending) {
        this._inlineSuggestionFeedbackIgnoredPending = false;
        vscode.commands.executeCommand(
          LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
          UserAction.IGNORED,
        );
      }
      this._completionRequestInProgress = false;
    }
  }

  public async feedbackRequest(
    inputData: FeedbackRequestParams,
    showAuthErrorMessage = false,
    showInfoMessage = false,
  ): Promise<FeedbackResponseParams> {
    // return early if the user is not authenticated
    if (
      !(await this.lightspeedAuthenticatedUser.isAuthenticated()) &&
      !showAuthErrorMessage
    ) {
      return {} as FeedbackResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as FeedbackResponseParams;
    }

    const rhUserHasSeat =
      await this.lightspeedAuthenticatedUser.rhUserHasSeat();
    const orgOptOutTelemetry =
      await this.lightspeedAuthenticatedUser.orgOptOutTelemetry();

    inputData.model =
      lightSpeedManager.settingsManager.settings.lightSpeedService.model;

    if (rhUserHasSeat && orgOptOutTelemetry) {
      if (inputData.inlineSuggestion) {
        delete inputData.inlineSuggestion;
      }
      if (inputData.ansibleContent) {
        delete inputData.ansibleContent;
      }
    }

    if (Object.keys(inputData).length === 0) {
      return {} as FeedbackResponseParams;
    }
    const requestData = {
      ...inputData,
      metadata: { ansibleExtensionVersion: this._extensionVersion },
    };
    console.log(
      `[ansible-lightspeed] Feedback request sent to lightspeed: ${JSON.stringify(
        requestData,
      )}`,
    );
    try {
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
        requestData,
        {
          timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
        },
      );
      if (showInfoMessage) {
        vscode.window.showInformationMessage("Thanks for your feedback!");
      }
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      const mappedError: IError = mapError(err);
      const errorMessage: string = mappedError.message ?? UNKNOWN_ERROR;
      if (showInfoMessage) {
        vscode.window.showErrorMessage(errorMessage);
      } else {
        console.error(errorMessage);
      }
      return {} as FeedbackResponseParams;
    }
  }

  public async contentMatchesRequest(
    inputData: ContentMatchesRequestParams,
  ): Promise<ContentMatchesResponseParams | IError> {
    // return early if the user is not authenticated
    if (!(await this.lightspeedAuthenticatedUser.isAuthenticated())) {
      vscode.window.showErrorMessage(
        "User not authenticated to use Ansible Lightspeed.",
      );
      return {} as ContentMatchesResponseParams;
    }

    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as ContentMatchesResponseParams;
    }
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };
      console.log(
        `[ansible-lightspeed] Content Match request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );
      const response = await axiosInstance.post(
        LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
        requestData,
        {
          timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
        },
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      const mappedError: IError = mapError(err);
      return mappedError;
    }
  }
}
