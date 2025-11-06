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
}

export class GoogleProvider extends BaseLLMProvider {
  readonly name = "google";
  readonly displayName = "Google Gemini";

  private client: GoogleGenAI;
  private modelName: string;
  private logger = getLightspeedLogger();

  constructor(config: GoogleConfig) {
    super(config, config.timeout);
    this.modelName = config.modelName;

    this.logger.info(
      `[Google Provider] Initializing with model: ${this.modelName}`,
    );

    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Try a minimal generation to validate
      await this.client.models.generateContent({
        model: this.modelName,
        contents: "test",
      });
      return true;
    } catch (error) {
      this.logger.error(`[Google Provider] Config validation failed: ${error}`);
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const isValid = await this.validateConfig();
      if (!isValid) {
        return {
          connected: false,
          error: "Failed to connect to Google Gemini API. Check your API key.",
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
        `[Google Provider] ==================================================`,
      );
      this.logger.info(`[Google Provider] Inline completion request received`);
      this.logger.info(
        `[Google Provider] Request params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[Google Provider] Model: ${this.modelName}`);
      this.logger.info(`[Google Provider] Prompt:\n${params.prompt}`);
      this.logger.info(
        `[Google Provider] Sending request to Google Gemini API...`,
      );

      // For inline completion, use a minimal system instruction to guide the model
      // to generate only valid Ansible YAML without explanations
      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: params.prompt,
        config: {
          systemInstruction:
            "You are an Ansible code completion assistant. Generate ONLY valid Ansible YAML task content to continue from where the input ends. Do not include explanations, markdown formatting, or complete playbooks. Only output the task YAML continuation.",
        },
      });

      const text = result.text || "";

      this.logger.info(
        `[Google Provider] Raw response length: ${text.length} chars`,
      );
      this.logger.info(`[Google Provider] Raw response:\n${text}`);

      // For inline completion, keep the response as-is to preserve indentation
      // Only remove common markdown code fences if present
      let suggestion = text.trim();
      suggestion = suggestion.replace(/^```ya?ml\s*/i, "");
      suggestion = suggestion.replace(/```\s*$/, "");

      this.logger.info(
        `[Google Provider] Final suggestion length: ${suggestion.length} chars`,
      );
      this.logger.info(`[Google Provider] Final suggestion:\n${suggestion}`);

      const result_data = {
        predictions: [suggestion],
        model: this.modelName,
        suggestionId: params.suggestionId || "google-" + Date.now().toString(),
      };

      this.logger.info(
        `[Google Provider] Returning predictions array with ${result_data.predictions.length} item(s)`,
      );
      this.logger.info(
        `[Google Provider] ==================================================`,
      );

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
      this.logger.info(`[Google Provider] ========== CHAT REQUEST ==========`);
      this.logger.info(
        `[Google Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[Google Provider] Message:\n${params.message}`);
      this.logger.info(
        `[Google Provider] Enhanced message:\n${enhancedMessage}`,
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
      this.logger.info(`[Google Provider] ========== CHAT RESPONSE ==========`);
      this.logger.info(
        `[Google Provider] Response length: ${message.length} chars`,
      );
      this.logger.info(`[Google Provider] Full response:\n${message}`);
      this.logger.info(
        `[Google Provider] =======================================`,
      );

      // Don't clean explanation output - it's markdown, not YAML
      return {
        message: message,
        conversationId: params.conversationId || "default",
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[Google Provider] Chat request failed: ${error}`);
      throw new Error(
        `Google chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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

      // Log full request
      this.logger.info(
        `[Google Provider] ========== PLAYBOOK GENERATION REQUEST ==========`,
      );
      this.logger.info(
        `[Google Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[Google Provider] Prompt text: ${promptText}`);
      this.logger.info(
        `[Google Provider] createOutline: ${params.createOutline}`,
      );
      this.logger.info(`[Google Provider] hasOutline: ${!!params.outline}`);
      if (params.outline) {
        this.logger.info(`[Google Provider] User outline: ${params.outline}`);
      }

      const enhancedPrompt = this.applyAnsibleContext(playbookPrompt, {
        ansibleFileType: "playbook",
      });

      this.logger.info(
        `[Google Provider] Enhanced prompt (full):\n${enhancedPrompt}`,
      );

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

      // Log full response
      this.logger.info(
        `[Google Provider] ========== PLAYBOOK GENERATION RESPONSE ==========`,
      );
      this.logger.info(
        `[Google Provider] Raw response length: ${content.length} chars`,
      );
      this.logger.info(
        `[Google Provider] Cleaned response length: ${cleanedContent.length} chars`,
      );
      this.logger.info(
        `[Google Provider] Generated playbook (full):\n${cleanedContent}`,
      );

      // Generate outline from the playbook if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromPlaybook(cleanedContent);
        this.logger.info(`[Google Provider] Generated outline: ${outline}`);
      }
      this.logger.info(
        `[Google Provider] Final response outline: "${outline}"`,
      );
      this.logger.info(
        `[Google Provider] ==================================================`,
      );

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(
        `[Google Provider] Playbook generation failed: ${error}`,
      );
      throw new Error(
        `Google playbook generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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

      this.logger.info(
        `[Google Provider] ==================================================`,
      );
      this.logger.info(
        `[Google Provider] Role generation request - createOutline: ${params.createOutline}, hasOutline: ${!!params.outline}`,
      );
      this.logger.info(`[Google Provider] Request - Model: ${this.modelName}`);
      this.logger.info(
        `[Google Provider] Request - System prompt: ${ANSIBLE_SYSTEM_PROMPT_ROLE.substring(0, 100)}...`,
      );
      this.logger.info(
        `[Google Provider] Request - User prompt (full):\n${this.applyAnsibleContext(rolePrompt, { ansibleFileType: "tasks" })}`,
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
        `[Google Provider] Raw response length: ${content.length} chars`,
      );
      this.logger.info(
        `[Google Provider] Cleaned response length: ${cleanedContent.length} chars`,
      );
      this.logger.info(
        `[Google Provider] Generated role (full):\n${cleanedContent}`,
      );

      // Generate outline from the role if requested
      let outline = "";
      if (params.createOutline) {
        outline = generateOutlineFromRole(cleanedContent);
        this.logger.info(`[Google Provider] Generated outline: ${outline}`);
      }
      this.logger.info(
        `[Google Provider] Final response outline: "${outline}"`,
      );
      this.logger.info(
        `[Google Provider] ==================================================`,
      );

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[Google Provider] Role generation failed: ${error}`);
      throw new Error(
        `Google role generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
