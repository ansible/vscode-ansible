import * as vscode from "vscode";
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
  PlaybookGenerationRequestParams,
  RoleGenerationRequestParams,
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  RoleExplanationRequestParams,
} from "../../interfaces/lightspeed";
import {
  LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
  LIGHTSPEED_PLAYBOOK_GENERATION_URL,
  LIGHTSPEED_ROLE_GENERATION_URL,
  LIGHTSPEED_ROLE_EXPLANATION_URL,
  LIGHTSPEED_SUGGESTION_COMPLETION_URL,
  LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
  LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
  UserAction,
} from "../../definitions/lightspeed";
import { getBaseUri } from "./utils/webUtils";
import { ANSIBLE_LIGHTSPEED_API_TIMEOUT } from "../../definitions/constants";
import { HTTPError, IError } from "./utils/errors";
import { lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";
import { inlineSuggestionHideHandler } from "./inlineSuggestions";
import {
  getOneClickTrialProvider,
  OneClickTrialProvider,
} from "./utils/oneClickTrial";
import { mapError } from "./handleApiError";
import { Log } from "../../utils/logger";

const UNKNOWN_ERROR: string = "An unknown error occurred.";

export function getFetch() {
  try {
    return require("electron")?.net?.fetch;
  } catch {
    return globalThis.fetch;
  }
}

export class LightSpeedAPI {
  private settingsManager: SettingsManager;
  private lightspeedAuthenticatedUser: LightspeedUser;
  private _suggestionFeedbacks: string[];
  private _extensionVersion: string;
  private _oneClickTrialProvider: OneClickTrialProvider;
  private logger: Log;

  constructor(
    settingsManager: SettingsManager,
    lightspeedAuthenticatedUser: LightspeedUser,
    context: vscode.ExtensionContext,
    logger: Log,
  ) {
    this.settingsManager = settingsManager;
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
    this._suggestionFeedbacks = [];
    this._extensionVersion = context.extension.packageJSON.version;
    this._oneClickTrialProvider = getOneClickTrialProvider();
    this.logger = logger;
  }

  private async lightspeedPost(endpoint: string, body: string) {
    try {
      const fetch = getFetch();

      const authToken =
        await this.lightspeedAuthenticatedUser.getLightspeedUserAccessToken();

      // Check if WCA provider and auth token is required
      const provider = this.settingsManager.settings.lightSpeedService.provider;
      if (provider === "wca" && authToken === undefined) {
        throw new Error("Ansible Lightspeed authentication failed.");
      }

      const headers = {
        "Content-Type": "application/json",
      };
      if (authToken !== undefined) {
        Object.assign(headers, { Authorization: `Bearer ${authToken}` });
      }

      const baseUrl = `${getBaseUri(this.settingsManager)}/api`;

      return fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        signal: AbortSignal.timeout(ANSIBLE_LIGHTSPEED_API_TIMEOUT),
        body,
        headers,
      });
    } catch (err) {
      return err;
    }
  }

  public async completionRequest(
    inputData: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    const suggestionId = inputData.suggestionId;
    this.logger.info(
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
      const response = await this.lightspeedPost(
        LIGHTSPEED_SUGGESTION_COMPLETION_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      if (
        response.status === 204 ||
        data.predictions.length === 0 ||
        // currently we only support one inline suggestion
        !data.predictions[0]
      ) {
        isCompletionSuccess = false;
        vscode.window.showInformationMessage(
          "Ansible Lightspeed does not have a suggestion for this input. Try changing your prompt, or contact your administrator with Suggestion Id " +
            requestData.suggestionId +
            " for assistance.",
        );
        return {} as CompletionResponseParams;
      }
      this.logger.debug(
        `[ansible-lightspeed] Completion response: ${JSON.stringify(data)}`,
      );
      return data;
    } catch (error) {
      isCompletionSuccess = false;
      const mappedError: IError = mapError(error as Error);
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

    const orgOptOutTelemetry =
      await this.lightspeedAuthenticatedUser.orgOptOutTelemetry();

    inputData.model =
      lightSpeedManager.settingsManager.settings.lightSpeedService.modelName;

    if (orgOptOutTelemetry) {
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
    this.logger.debug(
      `[ansible-lightspeed] Feedback request sent to lightspeed: ${JSON.stringify(
        requestData,
      )}`,
    );
    try {
      const response = await this.lightspeedPost(
        LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      if (showInfoMessage) {
        vscode.window.showInformationMessage("Thanks for your feedback!");
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
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

    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };

      this.logger.debug(
        `[ansible-lightspeed] Content Match request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );

      const response = await this.lightspeedPost(
        LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
      return mappedError;
    }
  }

  public async explanationRequest(
    inputData: ExplanationRequestParams,
  ): Promise<ExplanationResponseParams | IError> {
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };

      this.logger.info(
        `[ansible-lightspeed] Playbook Explanation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );

      const response = await this.lightspeedPost(
        LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
      return mappedError;
    }
  }

  public async playbookGenerationRequest(
    inputData: PlaybookGenerationRequestParams,
  ): Promise<PlaybookGenerationResponseParams | IError> {
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };

      this.logger.info(
        `[ansible-lightspeed] Playbook generation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );

      const response = await this.lightspeedPost(
        LIGHTSPEED_PLAYBOOK_GENERATION_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      this.logger.info(
        `[ansible-lightspeed] Playbook generation response: ${JSON.stringify(
          data,
          null,
          2,
        )}`,
      );

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
      return mappedError;
    }
  }

  public async roleGenerationRequest(
    inputData: RoleGenerationRequestParams,
  ): Promise<RoleGenerationResponseParams | IError> {
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };
      this.logger.info(
        `[ansible-lightspeed] Role Generation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );
      const response = await this.lightspeedPost(
        LIGHTSPEED_ROLE_GENERATION_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      this.logger.info(
        `[ansible-lightspeed] Role generation response: ${JSON.stringify(
          data,
          null,
          2,
        )}`,
      );

      // to remove after roleGen GA
      if (data.role && !data.name) {
        data.name = data.role;
      }

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
      return mappedError;
    }
  }

  public async roleExplanationRequest(
    inputData: RoleExplanationRequestParams,
  ): Promise<ExplanationResponseParams | IError> {
    try {
      const requestData = {
        ...inputData,
        metadata: { ansibleExtensionVersion: this._extensionVersion },
      };

      this.logger.info(
        `[ansible-lightspeed] Role Explanation request sent to lightspeed: ${JSON.stringify(
          requestData,
        )}`,
      );

      const response = await this.lightspeedPost(
        LIGHTSPEED_ROLE_EXPLANATION_URL,
        JSON.stringify(requestData),
      );

      const data = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, data);
      }

      return data;
    } catch (error) {
      const mappedError: IError = mapError(error as Error);
      return mappedError;
    }
  }
}
