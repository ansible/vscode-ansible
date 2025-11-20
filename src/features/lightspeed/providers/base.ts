import {
  CompletionRequestParams,
  CompletionResponseParams,
} from "../../../interfaces/lightspeed";

export interface LLMProvider {
  readonly name: string;
  readonly displayName: string;

  /**
   * Validate provider configuration and test connection
   */
  validateConfig(): Promise<boolean>;

  /**
   * Get provider connection status
   */
  getStatus(): Promise<ProviderStatus>;

  /**
   * Send completion request to the provider
   */
  completionRequest(
    params: CompletionRequestParams,
  ): Promise<CompletionResponseParams>;

  /**
   * Send chat request to the provider
   */
  chatRequest(params: ChatRequestParams): Promise<ChatResponseParams>;

  /**
   * Generate playbook using the provider
   */
  generatePlaybook(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams>;

  /**
   * Generate role using the provider
   */
  generateRole(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams>;
}

export interface ProviderStatus {
  connected: boolean;
  error?: string;
  modelInfo?: {
    name: string;
    version?: string;
    capabilities: string[];
  };
}

export interface ChatRequestParams {
  message: string;
  conversationId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>; // Metadata can be any shape depending on context
}

export interface ChatResponseParams {
  message: string;
  conversationId: string;
  model?: string;
}

export interface GenerationRequestParams {
  prompt: string;
  type: "playbook" | "role";
  createOutline?: boolean; // If true, generate outline from the result
  outline?: string; // User-edited outline to refine generation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>; // Metadata can be any shape depending on context
}

export interface GenerationResponseParams {
  content: string;
  outline?: string; // Generated outline (numbered list of steps)
  model?: string;
}

export abstract class BaseLLMProvider implements LLMProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected config: any; // Config shape varies by provider
  protected timeout: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: any, timeout: number = 30000) {
    this.config = config;
    this.timeout = timeout;
  }

  abstract readonly name: string;
  abstract readonly displayName: string;

  abstract validateConfig(): Promise<boolean>;
  abstract getStatus(): Promise<ProviderStatus>;
  abstract completionRequest(
    params: CompletionRequestParams,
  ): Promise<CompletionResponseParams>;
  abstract chatRequest(params: ChatRequestParams): Promise<ChatResponseParams>;
  abstract generatePlaybook(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams>;
  abstract generateRole(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams>;

  /**
   * Apply Ansible-specific prompt engineering
   */
  protected applyAnsibleContext(
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>,
  ): string {
    const { AnsibleContextProcessor } = require("../ansibleContext");

    const ansibleContext = {
      fileType: metadata?.ansibleFileType || "playbook",
      documentUri: metadata?.documentUri,
      workspaceContext: metadata?.workspaceContext,
    };

    return AnsibleContextProcessor.enhancePromptForAnsible(
      prompt,
      metadata?.context || "",
      ansibleContext,
    );
  }

  /**
   * Clean and validate Ansible output
   */
  protected cleanAnsibleOutput(output: string): string {
    const { AnsibleContextProcessor } = require("../ansibleContext");
    return AnsibleContextProcessor.cleanAnsibleOutput(output);
  }

  /**
   * Handle HTTP status code errors with comprehensive error messages
   * This method provides reusable error handling for common HTTP status codes
   */

  protected handleHttpError(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: any,
    operation: string,
    providerName: string = "",
  ): Error {
    const statusCode = error?.status || undefined;

    // Handle HTTP status codes
    switch (statusCode) {
      case 400:
        return new Error(
          `Bad request - invalid or malformed request parameters. Please verify your request. Operation: ${operation}. Details: ${error?.message || "Unknown error"}`,
        );

      case 403:
        return new Error(
          `Forbidden - ${providerName} API key does not have permission to access this resource. Please check your API key permissions. Operation: ${operation} and status code: ${statusCode}`,
        );

      case 429:
        return new Error(
          `Rate limit exceeded - too many requests or quota exceeded. Please wait and try again later. Operation: ${operation} and status code: ${statusCode}`,
        );

      case 500:
        return new Error(
          `${providerName} encountered an unexpected error. Please retry the request. Operation: ${operation}. Details: ${error?.message || "Unknown error"}`,
        );

      case 503:
        return new Error(
          `Service unavailable - ${providerName} is temporarily unavailable, possibly due to high load. Please wait and try again later. Operation: ${operation} and status code: ${statusCode}`,
        );

      case 504:
        return new Error(
          `Gateway timeout - request timed out at the gateway. Please reduce input size or retry the request. Operation: ${operation} and status code: ${statusCode}`,
        );

      default: {
        const errorMessage = error?.message || "Unknown error";
        return new Error(
          `${providerName} error: ${errorMessage}. Operation: ${operation}. Status: ${statusCode || "N/A"}`,
        );
      }
    }
  }
}
