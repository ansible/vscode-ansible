/** OpenAI-compatible API client for Red Hat AI Platform and other providers **/

import { getFetch } from "../api";
import { mapError } from "../handleApiError";
import { HTTPError, IError } from "../utils/errors";
import { getLightspeedLogger } from "../../../utils/logger";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;
}

export class OpenAICompatibleClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly logger;

  constructor(config: OpenAIClientConfig) {
    if (!config.baseUrl) throw new Error("baseUrl is required");
    if (!config.apiKey) throw new Error("apiKey is required");
    if (!config.model) throw new Error("model is required");

    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = config.timeout ?? 30000;
    this.logger = getLightspeedLogger();
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<ChatCompletionResponse> {
    const endpoint = `${this.baseUrl}/v1/chat/completions`;
    const fetchFn = getFetch();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          ...options,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.json();

      if (!response.ok) {
        throw new HTTPError(response, response.status, body);
      }

      return body;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HTTPError) {
        const mapped: IError = mapError(error);
        throw new Error(mapped.message || mapped.code);
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          const mapped = mapError(error);
          throw new Error(mapped.message || "Request timed out");
        }
        throw error;
      }

      throw new Error("Unknown error occurred");
    }
  }
}
