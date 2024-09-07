import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosError } from "axios";

import { SettingsManager } from "../../settings";
import {
  CompletionRequestParams,
  CompletionResponseParams,
  ContentMatchesRequestParams,
  ContentMatchesResponseParams,
  ExplanationRequestParams,
  ExplanationResponseParams,
  FeedbackRequestParams,
  FeedbackResponseParams,
  GenerationRequestParams,
  GenerationResponseParams,
} from "../../interfaces/lightspeed";
import {
  LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
  LIGHTSPEED_PLAYBOOK_GENERATION_URL,
  LIGHTSPEED_SUGGESTION_COMPLETION_URL,
  LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
  LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
  UserAction,
} from "../../definitions/lightspeed";
import { getBaseUri } from "./utils/webUtils";
import { ANSIBLE_LIGHTSPEED_API_TIMEOUT } from "../../definitions/constants";
import { IError } from "./utils/errors";
import { lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";
import { inlineSuggestionHideHandler } from "./inlineSuggestions";
import {
  getOneClickTrialProvider,
  OneClickTrialProvider,
} from "./utils/oneClickTrial";
import { mapError } from "./handleApiError";

const UNKNOWN_ERROR: string = "An unknown error occurred.";

export class LightSpeedAPI {
  private axiosInstance: AxiosInstance | undefined;
  private settingsManager: SettingsManager;
  private lightspeedAuthenticatedUser: LightspeedUser;
  private _suggestionFeedbacks: string[];
  private _extensionVersion: string;
  private _oneClickTrialProvider: OneClickTrialProvider;

  constructor(
    settingsManager: SettingsManager,
    lightspeedAuthenticatedUser: LightspeedUser,
    context: vscode.ExtensionContext,
  ) {
    this.settingsManager = settingsManager;
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
    this._suggestionFeedbacks = [];
    this._extensionVersion = context.extension.packageJSON.version;
    this._oneClickTrialProvider = getOneClickTrialProvider();
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
    const suggestionId = inputData.suggestionId;
    console.log(
      `[ansible-lightspeed] Completion request sent to lightspeed: ${JSON.stringify(
        inputData,
      )}`,
    );
    let isCompletionSuccess = true;
    try {
      this._suggestionFeedbacks.push(suggestionId || "");
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
        isCompletionSuccess = false;
        vscode.window.showInformationMessage(
          "Ansible Lightspeed does not have a suggestion for this input. Try changing your prompt, or contact your administrator with Suggestion Id " +
            requestData.suggestionId +
            " for assistance.",
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
      isCompletionSuccess = false;
      const err = error as AxiosError;
      const mappedError: IError = await mapError(err);
      if (!(await this._oneClickTrialProvider.showPopup(mappedError))) {
        vscode.window.showErrorMessage(
          `${mappedError.message ?? UNKNOWN_ERROR} ${mappedError.detail ?? ""}`,
        );
      }
      return {} as CompletionResponseParams;
    } finally {
      const cancelled = this.cancelSuggestionFeedback(suggestionId);
      if (isCompletionSuccess && !cancelled) {
        await inlineSuggestionHideHandler(UserAction.IGNORED, suggestionId);
      }
    }
  }

  public isSuggestionFeedbackInProgress(): boolean {
    return this._suggestionFeedbacks.length > 0;
  }

  public cancelSuggestionFeedbackInProgress(): void {
    this._suggestionFeedbacks.shift();
  }

  public cancelSuggestionFeedback(suggestionId?: string): boolean {
    const i = this._suggestionFeedbacks.indexOf(suggestionId || "");
    if (i > -1) {
      this._suggestionFeedbacks.splice(i, 1);
      return true;
    }
    return false;
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
      const mappedError: IError = await mapError(err);
      const errorMessage: string = `${mappedError.message ?? UNKNOWN_ERROR} ${mappedError.detail ?? ""}`;
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
      const mappedError: IError = await mapError(err);
      // Do not show trial popup for errors on content matches because either
      // completions or generations API should have been called already.
      return mappedError;
    }
  }

  public async explanationRequest(
    inputData: ExplanationRequestParams,
  ): Promise<ExplanationResponseParams | IError> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as ExplanationResponseParams;
    }
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };
      console.log(
        `[ansible-lightspeed] Explanation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );
      const response = await axiosInstance.post(
        LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
        //LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
        requestData,
        {
          timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
          // This is coming from our former LSP implementation, it may be a good
          // idea to generalize the use of a <28s timeout to be below CloudFront's 30s
          signal: AbortSignal.timeout(28000),
        },
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      const mappedError: IError = await mapError(err);
      // Do not show trial popup for errors on content matches because either
      // completions or generations API should have been called already.
      return mappedError;
    }
  }

  public async generationRequest(
    inputData: GenerationRequestParams,
  ): Promise<GenerationResponseParams | IError> {
    const axiosInstance = await this.getApiInstance();
    if (axiosInstance === undefined) {
      console.error("Ansible Lightspeed instance is not initialized.");
      return {} as GenerationResponseParams;
    }
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };
      console.log(
        `[ansible-lightspeed] Explanation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );
      const response = await axiosInstance.post(
        LIGHTSPEED_PLAYBOOK_GENERATION_URL,
        //LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
        requestData,
        {
          timeout: ANSIBLE_LIGHTSPEED_API_TIMEOUT,
          // This is coming from our former LSP implementation, it may be a good
          // idea to generalize the use of a <28s timeout to be below CloudFront's 30s
          signal: AbortSignal.timeout(28000),
        },
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      const mappedError: IError = await mapError(err);
      // Do not show trial popup for errors on content matches because either
      // completions or generations API should have been called already.
      return mappedError;
    }
  }
}
