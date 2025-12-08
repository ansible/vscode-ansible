import { GoogleGenAI } from "@google/genai";
import {
  BaseLLMProvider,
  ChatRequestParams,
  ChatResponseParams,
  GenerationRequestParams,
  GenerationResponseParams,
  ProviderStatus,
} from "./base";
import {
  CompletionRequestParams,
  CompletionResponseParams,
} from "../../../interfaces/lightspeed";
import {
  ANSIBLE_SYSTEM_PROMPT_PLAYBOOK,
  ANSIBLE_SYSTEM_PROMPT_ROLE,
  ANSIBLE_SYSTEM_PROMPT_CHAT,
  ANSIBLE_SYSTEM_PROMPT_EXPLANATION,
  ANSIBLE_SYSTEM_PROMPT_COMPLETION,
  ANSIBLE_PLAYBOOK_GENERATION_TEMPLATE,
  ANSIBLE_ROLE_GENERATION_TEMPLATE,
} from "../../../definitions/constants";
import { getLightspeedLogger } from "../../../utils/logger";
import {
  generateOutlineFromPlaybook,
  generateOutlineFromRole,
} from "../utils/outlineGenerator";

export interface GoogleConfig {
  apiKey: string;
  modelName: string;
  timeout?: number;
  baseUrl?: string;
}

export class GoogleProvider extends BaseLLMProvider<GoogleConfig> {
  readonly name = "google";
  readonly displayName = "Google Gemini";

  private readonly client: GoogleGenAI;
  private readonly modelName: string;
  private readonly logger = getLightspeedLogger();
  private lastValidationError?: string;

  constructor(config: GoogleConfig) {
    super(config, config.timeout);
    this.modelName = config.modelName;

    this.logger.info(
      `[Google Provider] Initializing with model: ${this.modelName}`,
    );

    if (config.baseUrl) {
      this.logger.info(`[Google Provider] endpoint: ${config.baseUrl}`);
      this.client = new GoogleGenAI({
        apiKey: config.apiKey || "test-api-key",
        httpOptions: {
          baseUrl: config.baseUrl,
        },
      });
    } else {
      this.client = new GoogleGenAI({ apiKey: config.apiKey });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleGeminiError(error: any, operation: string): Error {
    // Use the reusable HTTP error handler from base class
    return this.handleHttpError(error, operation, "Google Gemini");
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Try a minimal generation to validate
      await this.client.models.generateContent({
        model: this.modelName,
        contents: "test",
      });
      this.lastValidationError = undefined; // Clear any previous error
      return true;
    } catch (error) {
      const errorMsg = `Config validation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      this.logger.error(`[Google Provider] ${errorMsg}`);
      this.lastValidationError = errorMsg;
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const isValid = await this.validateConfig();
      if (!isValid) {
        return {
          connected: false,
          error:
            this.lastValidationError ||
            "Failed to connect to Google Gemini API. Check your API key.",
        };
      }

      return {
        connected: true,
        modelInfo: {
          name: this.modelName,
          capabilities: ["completion", "chat", "generation"],
        },
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async completionRequest(
    params: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    try {
      this.logger.info(
        `[Google Provider] Request params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[Google Provider] Model: ${this.modelName}`);
      this.logger.info(`[Google Provider] Prompt:\n${params.prompt}`);
      // For inline completion, use a minimal system instruction to guide the model
      // to generate only valid Ansible YAML without explanations
      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: params.prompt,
        config: {
          systemInstruction: ANSIBLE_SYSTEM_PROMPT_COMPLETION,
        },
      });

      const text = result.text || "";

      this.logger.info(`[Google Provider] Raw response:\n${text}`);

      // For inline completion, keep the response as-is to preserve indentation
      // Only remove common markdown code fences if present
      let suggestion = text.trim();
      suggestion = suggestion.replace(/^```ya?ml\s*/i, "");
      suggestion = suggestion.replace(/```\s*$/, "");

      const result_data = {
        predictions: [suggestion],
        model: this.modelName,
        suggestionId: params.suggestionId || "google-" + Date.now().toString(),
      };

      return result_data;
    } catch (error) {
      this.logger.error(
        `[Google Provider] Completion request failed: ${error}`,
      );
      this.logger.error(
        `[Google Provider] Error stack: ${error instanceof Error ? error.stack : "No stack trace"}`,
      );
      throw new Error(
        `Google completion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async chatRequest(params: ChatRequestParams): Promise<ChatResponseParams> {
    try {
      const enhancedMessage = this.applyAnsibleContext(
        params.message,
        params.metadata,
      );

      // Log full request
      this.logger.info(
        `[Google Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );

      // Use explanation-specific system prompt if this is an explanation request
      const isExplanation = params.metadata?.isExplanation === true;
      const systemInstruction = isExplanation
        ? ANSIBLE_SYSTEM_PROMPT_EXPLANATION
        : ANSIBLE_SYSTEM_PROMPT_CHAT;

      this.logger.info(
        `[Google Provider] Using system prompt: ${isExplanation ? "EXPLANATION" : "CHAT"}`,
      );

      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: enhancedMessage,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      const message = result.text || "";

      // Log full response
      this.logger.info(`[Google Provider] Full response:\n${message}`);

      return {
        message: message,
        conversationId: params.conversationId || "default",
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[Google Provider] Chat request failed: ${error}`);
      throw this.handleGeminiError(error, "chat generation");
    }
  }

  async generatePlaybook(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    try {
      let promptText = params.prompt;

      // If outline is provided (second call), incorporate it into the prompt
      if (params.outline) {
        promptText = `${params.prompt}\n\nGenerate the playbook with these specific steps:\n${params.outline}`;
      }

      const playbookPrompt = ANSIBLE_PLAYBOOK_GENERATION_TEMPLATE.replace(
        "{PROMPT}",
        promptText,
      );

      // Log full request
      this.logger.info(
        `[Google Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );
      if (params.outline) {
        this.logger.info(`[Google Provider] User outline: ${params.outline}`);
      }

      const enhancedPrompt = this.applyAnsibleContext(playbookPrompt, {
        ansibleFileType: "playbook",
      });

      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: enhancedPrompt,
        config: {
          systemInstruction: ANSIBLE_SYSTEM_PROMPT_PLAYBOOK,
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });

      const content = result.text || "";
      const cleanedContent = this.cleanAnsibleOutput(content);

      this.logger.info(
        `[Google Provider] Generated playbook (full):\n${cleanedContent}`,
      );

      // Generate outline from the playbook if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromPlaybook(cleanedContent);
        this.logger.info(`[Google Provider] Generated outline: ${outline}`);
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(
        `[Google Provider] Playbook generation failed: ${error}`,
      );
      throw this.handleGeminiError(error, "playbook generation");
    }
  }

  async generateRole(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    try {
      let promptText = params.prompt;

      // If outline is provided (second call), incorporate it into the prompt
      if (params.outline) {
        promptText = `${params.prompt}\n\nGenerate the role with these specific steps:\n${params.outline}`;
      }

      const rolePrompt = ANSIBLE_ROLE_GENERATION_TEMPLATE.replace(
        "{PROMPT}",
        promptText,
      );

      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: this.applyAnsibleContext(rolePrompt, {
          ansibleFileType: "tasks",
        }),
        config: {
          systemInstruction: ANSIBLE_SYSTEM_PROMPT_ROLE,
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });

      const content = result.text || "";
      const cleanedContent = this.cleanAnsibleOutput(content);

      this.logger.info(
        `[Google Provider] Generated role (full):\n${cleanedContent}`,
      );

      // Generate outline from the role if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromRole(cleanedContent);
        this.logger.info(`[Google Provider] Generated outline: ${outline}`);
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[Google Provider] Role generation failed: ${error}`);
      throw this.handleGeminiError(error, "role generation");
    }
  }
}
