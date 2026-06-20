import type {
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
} from './interfaces';
import {
    LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
    LIGHTSPEED_PLAYBOOK_GENERATION_URL,
    LIGHTSPEED_ROLE_GENERATION_URL,
    LIGHTSPEED_ROLE_EXPLANATION_URL,
    LIGHTSPEED_SUGGESTION_COMPLETION_URL,
    LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
    LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
    LIGHTSPEED_API_TIMEOUT,
    WCA_API_ENDPOINT_DEFAULT,
} from './definitions';
import {
    formatErrorDetail,
    HTTPError,
    UNKNOWN_ERROR,
    ERRORS_UNAUTHORIZED,
    type IError,
} from './errors';
import { mapError } from './handleApiError';

/**
 * Returns an appropriate fetch implementation, preferring Electron's
 * net.fetch when available (for proxy/certificate support in VS Code).
 * @returns The fetch function to use for HTTP requests.
 */
export function getFetch(): typeof globalThis.fetch {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const electron = require('electron') as
            | { net?: { fetch?: typeof globalThis.fetch } }
            | undefined;
        const electronFetch = electron?.net?.fetch;
        if (electronFetch) {
            return electronFetch;
        }
    } catch {
        // electron not available
    }
    return globalThis.fetch;
}

/**
 * Abstraction over the consumer-provided auth/config hooks so the API
 * client has no direct dependency on vscode or SettingsManager.
 */
export interface LightspeedApiConfig {
    /** Retrieves the current OAuth access token, or undefined if not authenticated. */
    getAccessToken(): Promise<string | undefined>;
    /** Whether the user is currently authenticated. */
    isAuthenticated(): Promise<boolean>;
    /** Whether the user's organization opted out of telemetry. */
    orgOptOutTelemetry(): Promise<boolean>;
    /** The WCA API endpoint URL. */
    getApiEndpoint(): string;
    /** The VS Code extension version string. */
    getExtensionVersion(): string;
    /** Emit a log message at the given level. */
    log(level: 'info' | 'debug' | 'error', message: string): void;
    /** Show an informational message to the user. */
    showInfo(message: string): void;
    /** Show an error message to the user. */
    showError(message: string): void;
}

/** WCA API client for all Lightspeed HTTP interactions. */
export class LightspeedAPI {
    private config: LightspeedApiConfig;

    /**
     * @param config - Consumer-provided auth and config hooks.
     */
    constructor(config: LightspeedApiConfig) {
        this.config = config;
    }

    /**
     * Builds the WCA API base URL from the configured endpoint.
     * @returns The base URL including the `/api` path segment.
     */
    private getBaseUrl(): string {
        const endpoint = this.config.getApiEndpoint() || WCA_API_ENDPOINT_DEFAULT;
        const trimmed = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
        return `${trimmed}/api`;
    }

    /**
     * Sends an authenticated POST request to the WCA API.
     * @param endpoint - The API path relative to the base URL.
     * @param body - JSON-serialized request body.
     * @returns The raw fetch Response.
     */
    private async lightspeedPost(endpoint: string, body: string): Promise<Response> {
        const fetch = getFetch();

        const authToken = await this.config.getAccessToken();
        if (authToken === undefined) {
            throw new Error('Ansible Lightspeed authentication failed.');
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
        };

        const baseUrl = this.getBaseUrl();

        return await fetch(`${baseUrl}/${endpoint}`, {
            method: 'POST',
            signal: AbortSignal.timeout(LIGHTSPEED_API_TIMEOUT),
            body,
            headers,
        });
    }

    /**
     * Requests an inline code completion from WCA.
     * @param inputData - Completion prompt and metadata.
     * @returns The completion response or an error descriptor.
     */
    public async completionRequest(
        inputData: CompletionRequestParams,
    ): Promise<CompletionResponseParams | IError> {
        this.config.log(
            'debug',
            `[ansible-lightspeed] Completion request sent for suggestionId=${String(inputData.suggestionId)}`,
        );
        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ...inputData.metadata,
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };
            const requestBody = JSON.stringify(requestData);
            this.config.log(
                'info',
                `[ansible-lightspeed] Request body (last 300 chars): ${requestBody.slice(-300)}`,
            );
            const response = await this.lightspeedPost(
                LIGHTSPEED_SUGGESTION_COMPLETION_URL,
                requestBody,
            );

            this.config.log(
                'info',
                `[ansible-lightspeed] Response status: ${String(response.status)} ${response.statusText}`,
            );

            if (response.status === 204) {
                const noSuggestionMsg = `Ansible Lightspeed does not have a suggestion for this input. Try changing your prompt, or contact your administrator with Suggestion Id ${String(requestData.suggestionId)} for assistance.`;
                this.config.showInfo(noSuggestionMsg);
                return { code: 'NO_SUGGESTION', message: noSuggestionMsg };
            }

            interface CompletionApiResponse {
                predictions?: unknown[];
            }
            const responseText = await response.text();
            this.config.log(
                'info',
                `[ansible-lightspeed] Raw response body (first 500 chars): ${responseText.substring(0, 500)}`,
            );
            const data = JSON.parse(responseText) as CompletionApiResponse;

            if (!response.ok) {
                throw new HTTPError(response, response.status, data);
            }

            if (!data.predictions || data.predictions.length === 0 || !data.predictions[0]) {
                this.config.log(
                    'info',
                    `[ansible-lightspeed] Empty/missing predictions. Full response: ${responseText.substring(0, 1000)}`,
                );
                const emptyMsg = `Ansible Lightspeed does not have a suggestion for this input. Try changing your prompt, or contact your administrator with Suggestion Id ${String(requestData.suggestionId)} for assistance.`;
                this.config.showInfo(emptyMsg);
                return { code: 'NO_SUGGESTION', message: emptyMsg };
            }

            const suggestionId =
                'suggestionId' in (data as Record<string, unknown>)
                    ? String((data as Record<string, unknown>).suggestionId)
                    : String(requestData.suggestionId);

            this.config.log(
                'debug',
                `[ansible-lightspeed] Completion response for suggestionId=${suggestionId}, predictions=${String(data.predictions.length)}`,
            );
            for (let i = 0; i < data.predictions.length; i++) {
                const pred = String(data.predictions[i]);
                this.config.log(
                    'info',
                    `[ansible-lightspeed] Prediction[${String(i)}] (first 300 chars): ${pred.substring(0, 300).replace(/\n/g, '\\n')}`,
                );
            }
            return {
                predictions: data.predictions as string[],
                suggestionId,
                ...('model' in (data as Record<string, unknown>)
                    ? { model: String((data as Record<string, unknown>).model) }
                    : {}),
            };
        } catch (error) {
            this.config.log(
                'error',
                `[ansible-lightspeed] Completion request failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            if (error instanceof Error && error.stack) {
                this.config.log('debug', `[ansible-lightspeed] Stack: ${error.stack}`);
            }
            const mappedError: IError = mapError(error as Error);
            this.config.showError(
                `${mappedError.message ?? UNKNOWN_ERROR} ${formatErrorDetail(mappedError.detail)}`,
            );
            return mappedError;
        }
    }

    /**
     * Sends user feedback (inline suggestion, thumbs up/down, etc.) to WCA.
     * @param inputData - The feedback payload.
     * @param showAuthErrorMessage - Whether to surface auth errors to the user.
     * @param showInfoMessage - Whether to show a success/error toast.
     * @returns The feedback response or an error descriptor.
     */
    public async feedbackRequest(
        inputData: FeedbackRequestParams,
        showAuthErrorMessage = false,
        showInfoMessage = false,
    ): Promise<FeedbackResponseParams | IError> {
        if (!(await this.config.isAuthenticated()) && !showAuthErrorMessage) {
            return ERRORS_UNAUTHORIZED;
        }

        const orgOptOutTelemetry = await this.config.orgOptOutTelemetry();

        const sanitized = { ...inputData };
        if (orgOptOutTelemetry) {
            delete sanitized.inlineSuggestion;
        }

        const hasEventData = Object.keys(sanitized).some((k) => k !== 'model');
        if (!hasEventData) {
            return { code: 'NO_EVENT_DATA', message: 'No feedback event data to send' };
        }
        const requestData = {
            ...sanitized,
            metadata: {
                ansibleExtensionVersion: this.config.getExtensionVersion(),
            },
        };
        const requestBody = JSON.stringify(requestData);
        this.config.log(
            'info',
            `[ansible-lightspeed] Feedback request: keys=${Object.keys(requestData).join(',')}, body=${requestBody.substring(0, 500)}`,
        );
        try {
            const response = await this.lightspeedPost(
                LIGHTSPEED_SUGGESTION_FEEDBACK_URL,
                requestBody,
            );

            const responseText = await response.text();
            this.config.log(
                'info',
                `[ansible-lightspeed] Feedback response: status=${String(response.status)}, body=${responseText.substring(0, 500)}`,
            );

            const data: unknown = responseText ? JSON.parse(responseText) : {};

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            if (showInfoMessage) {
                this.config.showInfo('Thanks for your feedback!');
            }

            return data as FeedbackResponseParams;
        } catch (error) {
            this.config.log(
                'error',
                `[ansible-lightspeed] Feedback request failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            const mappedError: IError = mapError(error as Error);
            const errorMessage = `${mappedError.message ?? UNKNOWN_ERROR} ${formatErrorDetail(mappedError.detail)}`;
            if (showInfoMessage) {
                this.config.showError(errorMessage);
            }
            return mappedError;
        }
    }

    /**
     * Fetches training content matches for the given suggestions.
     * @param inputData - Suggestions to match against training data.
     * @returns Matching content or an error descriptor.
     */
    public async contentMatchesRequest(
        inputData: ContentMatchesRequestParams,
    ): Promise<ContentMatchesResponseParams | IError> {
        if (!(await this.config.isAuthenticated())) {
            this.config.showError('User not authenticated to use Ansible Lightspeed.');
            return ERRORS_UNAUTHORIZED;
        }

        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };

            this.config.log(
                'debug',
                `[ansible-lightspeed] Content Match request sent for suggestionId=${requestData.suggestionId}, suggestions=${String(requestData.suggestions.length)}`,
            );

            const response = await this.lightspeedPost(
                LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL,
                JSON.stringify(requestData),
            );

            const data: unknown = await response.json();

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            return data as ContentMatchesResponseParams;
        } catch (error) {
            const mappedError: IError = mapError(error as Error);
            return mappedError;
        }
    }

    /**
     * Requests a natural-language explanation for a playbook.
     * @param inputData - The playbook content to explain.
     * @returns The explanation or an error descriptor.
     */
    public async explanationRequest(
        inputData: ExplanationRequestParams,
    ): Promise<ExplanationResponseParams | IError> {
        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };

            this.config.log(
                'debug',
                `[ansible-lightspeed] Playbook Explanation request sent for explanationId=${requestData.explanationId}`,
            );

            const response = await this.lightspeedPost(
                LIGHTSPEED_PLAYBOOK_EXPLANATION_URL,
                JSON.stringify(requestData),
            );

            const data: unknown = await response.json();

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            return data as ExplanationResponseParams;
        } catch (error) {
            const mappedError: IError = mapError(error as Error);
            return mappedError;
        }
    }

    /**
     * Generates a playbook from a natural-language description.
     * @param inputData - The generation prompt and options.
     * @returns The generated playbook or an error descriptor.
     */
    public async playbookGenerationRequest(
        inputData: PlaybookGenerationRequestParams,
    ): Promise<PlaybookGenerationResponseParams | IError> {
        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };

            if (!requestData.outline) {
                delete (requestData as Record<string, unknown>).outline;
            }
            const requestBody = JSON.stringify(requestData);
            this.config.log(
                'info',
                `[ansible-lightspeed] Playbook generation request: generationId=${requestData.generationId}, body=${requestBody.substring(0, 500)}`,
            );

            const response = await this.lightspeedPost(
                LIGHTSPEED_PLAYBOOK_GENERATION_URL,
                requestBody,
            );

            const responseText = await response.text();
            this.config.log(
                'info',
                `[ansible-lightspeed] Playbook generation response: status=${String(response.status)}, body=${responseText.substring(0, 500)}`,
            );

            const data: unknown = responseText ? JSON.parse(responseText) : {};

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            return data as PlaybookGenerationResponseParams;
        } catch (error) {
            const mappedError: IError = mapError(error as Error);
            return mappedError;
        }
    }

    /**
     * Generates a role from a natural-language description.
     * @param inputData - The generation prompt and options.
     * @returns The generated role files or an error descriptor.
     */
    public async roleGenerationRequest(
        inputData: RoleGenerationRequestParams,
    ): Promise<RoleGenerationResponseParams | IError> {
        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };
            if (!requestData.outline) {
                delete (requestData as Record<string, unknown>).outline;
            }
            const requestBody = JSON.stringify(requestData);
            this.config.log(
                'info',
                `[ansible-lightspeed] Role generation request: generationId=${requestData.generationId}, body=${requestBody.substring(0, 500)}`,
            );
            const response = await this.lightspeedPost(
                LIGHTSPEED_ROLE_GENERATION_URL,
                requestBody,
            );

            const responseText = await response.text();
            this.config.log(
                'info',
                `[ansible-lightspeed] Role generation response: status=${String(response.status)}, body=${responseText.substring(0, 500)}`,
            );

            const data: unknown = responseText ? JSON.parse(responseText) : {};

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            const typed = data as RoleGenerationResponseParams;
            if (typed.role && !typed.name) {
                typed.name = typed.role;
            }

            return typed;
        } catch (error) {
            const mappedError: IError = mapError(error as Error);
            return mappedError;
        }
    }

    /**
     * Requests a natural-language explanation for a role.
     * @param inputData - The role files to explain.
     * @returns The explanation or an error descriptor.
     */
    public async roleExplanationRequest(
        inputData: RoleExplanationRequestParams,
    ): Promise<ExplanationResponseParams | IError> {
        try {
            const requestData = {
                ...inputData,
                metadata: {
                    ansibleExtensionVersion: this.config.getExtensionVersion(),
                },
            };

            this.config.log(
                'debug',
                `[ansible-lightspeed] Role Explanation request sent for explanationId=${requestData.explanationId}`,
            );

            const response = await this.lightspeedPost(
                LIGHTSPEED_ROLE_EXPLANATION_URL,
                JSON.stringify(requestData),
            );

            const data: unknown = await response.json();

            if (!response.ok) {
                throw new HTTPError(response, response.status, data as object);
            }

            return data as ExplanationResponseParams;
        } catch (error) {
            const mappedError: IError = mapError(error as Error);
            return mappedError;
        }
    }
}
