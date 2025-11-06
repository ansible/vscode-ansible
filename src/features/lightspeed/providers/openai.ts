import OpenAI from "openai";
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
import { getFetch } from "../api";
import {
  ANSIBLE_SYSTEM_PROMPT_PLAYBOOK,
  ANSIBLE_SYSTEM_PROMPT_ROLE,
  ANSIBLE_SYSTEM_PROMPT_CHAT,
  ANSIBLE_PLAYBOOK_GENERATION_TEMPLATE,
  ANSIBLE_ROLE_GENERATION_TEMPLATE,
} from "../../../definitions/constants";
import { getLightspeedLogger } from "../../../utils/logger";
import { AnsibleContextProcessor } from "../ansibleContext";
import {
  generateOutlineFromPlaybook,
  generateOutlineFromRole,
} from "../utils/outlineGenerator";

export interface OpenAIConfig {
  apiKey: string;
  apiEndpoint?: string;
  modelName: string;
  timeout?: number;
  customHeaders?: Record<string, string>;
}

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI";

  private client: OpenAI;
  private modelName: string;
  private logger = getLightspeedLogger();

  constructor(config: OpenAIConfig) {
    super(config, config.timeout);
    this.modelName = config.modelName;

    this.logger.info(
      `[OpenAI Provider] Initializing with model: ${this.modelName}`,
    );

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiEndpoint,
      defaultHeaders: config.customHeaders,
      timeout: config.timeout || 30000,
      fetch: getFetch(),
    });
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Try to list models to validate API key
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error("[OpenAI Provider] Config validation failed:", error);
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const isValid = await this.validateConfig();
      if (!isValid) {
        return {
          connected: false,
          error: "Failed to connect to OpenAI API. Check your API key.",
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
      const fileType = params.metadata?.ansibleFileType || "playbook";

      this.logger.info(
        `[OpenAI Provider] ==================================================`,
      );
      this.logger.info(`[OpenAI Provider] Inline completion request received`);
      this.logger.info(
        `[OpenAI Provider] Request params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[OpenAI Provider] Model: ${this.modelName}`);
      this.logger.info(`[OpenAI Provider] File type: ${fileType}`);
      this.logger.info(`[OpenAI Provider] Prompt:\n${params.prompt}`);
      this.logger.info(`[OpenAI Provider] Sending request to OpenAI API...`);

      // For inline completion, add a brief instruction prefix to guide the model
      // to generate only valid Ansible YAML without explanations
      const completionPrompt = `# Complete the following Ansible task with valid YAML. Only output the task continuation, no explanations.\n${params.prompt}`;

      const response = await this.client.completions.create({
        model: this.modelName,
        prompt: completionPrompt,
        max_tokens: AnsibleContextProcessor.getMaxTokensForFileType(fileType),
        temperature:
          AnsibleContextProcessor.getTemperatureForFileType(fileType),
        stop: AnsibleContextProcessor.getAnsibleStopSequences(),
      });

      this.logger.info(
        `[OpenAI Provider] Raw response: ${JSON.stringify(response.choices[0], null, 2)}`,
      );

      // For inline completion, keep the response as-is to preserve indentation
      // Only remove common markdown code fences if present
      let suggestion = (response.choices[0]?.text || "").trim();
      suggestion = suggestion.replace(/^```ya?ml\s*/i, "");
      suggestion = suggestion.replace(/```\s*$/, "");

      this.logger.info(
        `[OpenAI Provider] Final suggestion length: ${suggestion.length} chars`,
      );
      this.logger.info(`[OpenAI Provider] Final suggestion:\n${suggestion}`);

      const result_data = {
        predictions: [suggestion],
        model: response.model,
        suggestionId: params.suggestionId || response.id,
      };

      this.logger.info(
        `[OpenAI Provider] Returning predictions array with ${result_data.predictions.length} item(s)`,
      );
      this.logger.info(
        `[OpenAI Provider] ==================================================`,
      );

      return result_data;
    } catch (error) {
      this.logger.error(
        `[OpenAI Provider] Completion request failed: ${error}`,
      );
      this.logger.error(
        `[OpenAI Provider] Error stack: ${error instanceof Error ? error.stack : "No stack trace"}`,
      );
      throw new Error(
        `OpenAI completion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async chatRequest(params: ChatRequestParams): Promise<ChatResponseParams> {
    try {
      const enhancedMessage = this.applyAnsibleContext(
        params.message,
        params.metadata,
      );

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: ANSIBLE_SYSTEM_PROMPT_CHAT,
          },
          {
            role: "user",
            content: enhancedMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const message = response.choices[0]?.message?.content || "";

      return {
        message: this.cleanAnsibleOutput(message),
        conversationId: params.conversationId || "default",
        model: response.model,
      };
    } catch (error) {
      console.error("[OpenAI Provider] Chat request failed:", error);
      throw new Error(
        `OpenAI chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: ANSIBLE_SYSTEM_PROMPT_PLAYBOOK,
          },
          {
            role: "user",
            content: this.applyAnsibleContext(playbookPrompt, {
              ansibleFileType: "playbook",
            }),
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || "";
      const cleanedContent = this.cleanAnsibleOutput(content);

      // Generate outline from the playbook if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromPlaybook(cleanedContent);
        this.logger.info(
          `[OpenAI Provider] Generated outline from playbook: ${outline}`,
        );
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: response.model,
      };
    } catch (error) {
      console.error("[OpenAI Provider] Playbook generation failed:", error);
      throw new Error(
        `OpenAI playbook generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: ANSIBLE_SYSTEM_PROMPT_ROLE,
          },
          {
            role: "user",
            content: this.applyAnsibleContext(rolePrompt, {
              ansibleFileType: "tasks",
            }),
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || "";
      const cleanedContent = this.cleanAnsibleOutput(content);

      // Generate outline from the role if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromRole(cleanedContent);
        this.logger.info(
          `[OpenAI Provider] Generated outline from role: ${outline}`,
        );
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: response.model,
      };
    } catch (error) {
      console.error("[OpenAI Provider] Role generation failed:", error);
      throw new Error(
        `OpenAI role generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
