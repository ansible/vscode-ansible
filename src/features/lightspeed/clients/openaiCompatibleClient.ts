/** OpenAI-compatible API client for Red Hat AI Platform and other providers **/

import { getFetch } from "../api";
import { getLightspeedLogger } from "../../../utils/logger";

export class OpenAIClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAIClientError";
    this.status = status;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  timeout?: number; // Per-request timeout override (ms)
}

interface ChatCompletionResponse {
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

interface OpenAIClientConfig {
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
    const requestTimeout = options?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

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
          ...Object.fromEntries(
            Object.entries({
              temperature: options?.temperature,
              max_tokens: options?.max_tokens,
              top_p: options?.top_p,
              stop: options?.stop,
            }).filter(([, v]) => v !== undefined),
          ),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.json();

      if (!response.ok) {
        const errorMessage =
          body?.error?.message ||
          body?.message ||
          `HTTP ${response.status} error`;
        throw new OpenAIClientError(errorMessage, response.status);
      }

      return body;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenAIClientError("Request timed out", 408);
      }

      if (error instanceof OpenAIClientError) {
        throw error;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Unknown error occurred");
    }
  }
}
