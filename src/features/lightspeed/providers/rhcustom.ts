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
import { getFetch } from "../api";

export interface RHCustomConfig {
  apiKey: string;
  modelName: string;
  baseURL: string;
  timeout?: number;
}

interface OpenAICompatibleMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAICompatibleRequest {
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenAICompatibleResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

export class RHCustomProvider extends BaseLLMProvider<RHCustomConfig> {
  readonly name = "rhcustom";
  readonly displayName = "Red Hat Custom";

  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly baseURL: string;
  private readonly logger = getLightspeedLogger();
  private lastValidationError?: string;

  constructor(config: RHCustomConfig) {
    super(config, config.timeout || 30000);
    
    console.log("[RHCustom Provider] Constructor called with config:", {
      hasApiKey: !!config.apiKey,
      hasModelName: !!config.modelName,
      hasBaseURL: !!config.baseURL,
      baseURL: config.baseURL,
      timeout: config.timeout,
    });
    
    // Validate required fields
    if (!config.apiKey || config.apiKey.trim() === "") {
      throw new Error(
        "API Key is required for Red Hat Custom provider. Please set 'ansible.lightspeed.apiKey' in your settings.",
      );
    }
    if (!config.modelName || config.modelName.trim() === "") {
      throw new Error(
        "Model name is required for Red Hat Custom provider. Please set 'ansible.lightspeed.modelName' in your settings.",
      );
    }
    if (!config.baseURL || config.baseURL.trim() === "") {
      throw new Error(
        "Base URL is required for Red Hat Custom provider. Please set 'ansible.lightspeed.apiEndpoint' in your settings.",
      );
    }

    // Validate baseURL is a valid URL
    try {
      const url = new URL(config.baseURL);
      if (!url.protocol.startsWith("http")) {
        throw new Error("Base URL must use http:// or https:// protocol");
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          `Invalid base URL format: ${config.baseURL}. Please provide a valid URL (e.g., https://example.com).`,
        );
      }
      throw error;
    }

    // Explicitly assign values to ensure apiKey and baseURL are not swapped
    this.apiKey = config.apiKey.trim();
    this.modelName = config.modelName.trim();
    this.baseURL = config.baseURL.trim();
    
    // Remove trailing slash if present
    if (this.baseURL.endsWith("/")) {
      this.baseURL = this.baseURL.slice(0, -1);
    }

    console.log("[RHCustom Provider] Initialized:", {
      model: this.modelName,
      baseURL: this.baseURL,
      apiKeyLength: this.apiKey.length,
      timeout: this.timeout,
    });
    
    this.logger.info(
      `[RHCustom Provider] Initializing with model: ${this.modelName}, baseURL: ${this.baseURL.substring(0, 50)}...`,
    );
    this.logger.debug(
      `[RHCustom Provider] Config - apiKey length: ${this.apiKey.length}, baseURL: ${this.baseURL}`,
    );
  }

  /**
   * Extract task names from YAML using regex as fallback when YAML parsing fails
   */
  private extractTaskNamesFromYaml(yamlContent: string): string {
    const taskNames: string[] = [];
    
    // Match task definitions: "- name: Task Name" or "  - name: Task Name"
    const taskNameRegex = /^\s*-\s+name:\s*(.+)$/gm;
    let match;
    
    while ((match = taskNameRegex.exec(yamlContent)) !== null) {
      const taskName = match[1].trim();
      // Remove quotes if present
      const cleanName = taskName.replace(/^["']|["']$/g, "");
      if (cleanName) {
        taskNames.push(cleanName);
      }
    }
    
    if (taskNames.length > 0) {
      return taskNames.map((task, index) => `${index + 1}. ${task}`).join("\n");
    }
    
    return "";
  }

  /**
   * Extract YAML content from code blocks, stopping at the closing ```
   * This handles cases where the API response includes explanatory text after the code block
   */
  private extractYamlFromCodeBlock(content: string): string {
    // Look for code block markers
    const codeBlockStart = /```(?:ya?ml)?\s*\n?/i;
    const codeBlockEnd = /\n?```/;
    
    // Find the first code block
    const startMatch = content.match(codeBlockStart);
    if (startMatch) {
      const startIndex = startMatch.index! + startMatch[0].length;
      // Find the closing ``` after the start
      const remainingContent = content.substring(startIndex);
      const endMatch = remainingContent.match(codeBlockEnd);
      
      if (endMatch) {
        // Extract only the content between the code blocks
        const yamlContent = remainingContent.substring(0, endMatch.index);
        console.log("[RHCustom Provider] Extracted YAML from code block, length:", yamlContent.length);
        return yamlContent.trim();
      }
    }
    
    // If no code blocks found, try to find YAML start and stop at first non-YAML line after
    const yamlStart = content.search(/^\s*(-\s+name:|---|\w+:)/m);
    if (yamlStart >= 0) {
      // Find where YAML likely ends (look for closing ``` or explanatory text patterns)
      const yamlSection = content.substring(yamlStart);
      const codeBlockEndIndex = yamlSection.search(/\n```/);
      // const explanatoryTextIndex = yamlSection.search(/\n\n(?:This|Here|The|Note|Explanation)/i);
      
      let endIndex = yamlSection.length;
      if (codeBlockEndIndex >= 0) {
        endIndex = Math.min(endIndex, codeBlockEndIndex);
      }
      // if (explanatoryTextIndex >= 0) {
      //   endIndex = Math.min(endIndex, explanatoryTextIndex);
      // }
      
      return yamlSection.substring(0, endIndex).trim();
    }
    
    // Fallback to original content
    return content.trim();
  }

  private getEndpoint(): string {
    const endpoint = `${this.baseURL}/v1/chat/completions`;
    // Validate the endpoint URL is valid
    try {
      new URL(endpoint);
    } catch (error) {
      this.logger.error(
        `[RHCustom Provider] Invalid endpoint URL: ${endpoint}, baseURL: ${this.baseURL}`,
      );
      throw new Error(
        `Invalid endpoint URL constructed from baseURL: ${this.baseURL}. Please check your apiEndpoint setting.`,
      );
    }
    return endpoint;
  }

  private async makeOpenAIRequest(
    messages: OpenAICompatibleMessage[],
    options?: {
      temperature?: number;
      max_tokens?: number;
      timeout?: number;
    },
  ): Promise<OpenAICompatibleResponse> {
    const fetch = getFetch();
    const endpoint = this.getEndpoint();
    const requestBody: OpenAICompatibleRequest = {
      model: this.modelName,
      messages: messages,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    };

    const requestTimeout = options?.timeout || this.timeout;
    
    console.log("[RHCustom Provider] Making request:", {
      endpoint: endpoint,
      model: this.modelName,
      timeout: requestTimeout,
      messageCount: messages.length,
    });
    
    this.logger.info(
      `[RHCustom Provider] Making request to ${endpoint}`,
    );
    this.logger.debug(
      `[RHCustom Provider] Request body: ${JSON.stringify(requestBody, null, 2)}`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[RHCustom Provider] Request timeout triggered after", requestTimeout, "ms");
      controller.abort();
    }, requestTimeout);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log("[RHCustom Provider] Response received:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[RHCustom Provider] Error response:", {
          status: response.status,
          errorText: errorText.substring(0, 200),
        });
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const error: Error & { status?: number } = new Error(
          errorData.message || errorData.error?.message || `HTTP ${response.status}`,
        );
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      console.log("[RHCustom Provider] Success response received");
      return data as OpenAICompatibleResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[RHCustom Provider] Request aborted - likely timeout");
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleRHCustomError(error: any, operation: string): Error {
    // Use the reusable HTTP error handler from base class
    return this.handleHttpError(error, operation, "Red Hat Custom");
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Use minimum 30 seconds timeout for validation (LLM calls can take time)
      const validationTimeout = Math.max(this.timeout, 30000);
      
      console.log("[RHCustom Provider] Starting config validation:", {
        baseURL: this.baseURL,
        model: this.modelName,
        hasApiKey: !!this.apiKey,
        configuredTimeout: this.timeout,
        validationTimeout: validationTimeout,
      });
      
      // Log configuration for debugging
      this.logger.info(
        `[RHCustom Provider] Validating config - baseURL: ${this.baseURL}, model: ${this.modelName}, hasApiKey: ${!!this.apiKey}, timeout: ${validationTimeout}ms`,
      );
      
      // Try a minimal chat request to validate with extended timeout
      await this.makeOpenAIRequest(
        [
          {
            role: "user",
            content: "test",
          },
        ],
        {
          timeout: validationTimeout,
        },
      );
      
      console.log("[RHCustom Provider] Config validation successful");
      this.lastValidationError = undefined; // Clear any previous error
      return true;
    } catch (error) {
      const errorMsg = `Config validation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.log("[RHCustom Provider] Config validation failed:", errorMsg);
      console.log("[RHCustom Provider] Error details:", error);
      
      this.logger.error(`[RHCustom Provider] ${errorMsg}`);
      this.logger.error(
        `[RHCustom Provider] Validation error details: ${error instanceof Error ? error.stack : JSON.stringify(error)}`,
      );
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
            "Failed to connect to Red Hat Custom API. Check your API key and base URL.",
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
        `[RHCustom Provider] Request params: ${JSON.stringify(params, null, 2)}`,
      );
      this.logger.info(`[RHCustom Provider] Model: ${this.modelName}`);
      this.logger.info(`[RHCustom Provider] Prompt:\n${params.prompt}`);

      const messages: OpenAICompatibleMessage[] = [
        {
          role: "system",
          content: ANSIBLE_SYSTEM_PROMPT_COMPLETION,
        },
        {
          role: "user",
          content: params.prompt,
        },
      ];

      const result = await this.makeOpenAIRequest(messages);

      const text =
        result.choices?.[0]?.message?.content || "";

      this.logger.info(`[RHCustom Provider] Raw response:\n${text}`);

      // For inline completion, keep the response as-is to preserve indentation
      // Only remove common markdown code fences if present
      let suggestion = text.trim();
      suggestion = suggestion.replace(/^```ya?ml\s*/i, "");
      suggestion = suggestion.replace(/```\s*$/, "");

      const result_data = {
        predictions: [suggestion],
        model: this.modelName,
        suggestionId: params.suggestionId || "rhcustom-" + Date.now().toString(),
      };

      return result_data;
    } catch (error) {
      this.logger.error(
        `[RHCustom Provider] Completion request failed: ${error}`,
      );
      this.logger.error(
        `[RHCustom Provider] Error stack: ${error instanceof Error ? error.stack : "No stack trace"}`,
      );
      throw this.handleRHCustomError(error, "completion");
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
        `[RHCustom Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );

      // Use explanation-specific system prompt if this is an explanation request
      const isExplanation = params.metadata?.isExplanation === true;
      const systemPrompt = isExplanation
        ? ANSIBLE_SYSTEM_PROMPT_EXPLANATION
        : ANSIBLE_SYSTEM_PROMPT_CHAT;

      this.logger.info(
        `[RHCustom Provider] Using system prompt: ${isExplanation ? "EXPLANATION" : "CHAT"}`,
      );

      const messages: OpenAICompatibleMessage[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: enhancedMessage,
        },
      ];

      const result = await this.makeOpenAIRequest(messages);

      const message = result.choices?.[0]?.message?.content || "";

      // Log full response
      this.logger.info(`[RHCustom Provider] Full response:\n${message}`);

      return {
        message: message,
        conversationId: params.conversationId || "default",
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[RHCustom Provider] Chat request failed: ${error}`);
      throw this.handleRHCustomError(error, "chat generation");
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
        `[RHCustom Provider] Full params: ${JSON.stringify(params, null, 2)}`,
      );
      if (params.outline) {
        this.logger.info(`[RHCustom Provider] User outline: ${params.outline}`);
      }

      const enhancedPrompt = this.applyAnsibleContext(playbookPrompt, {
        ansibleFileType: "playbook",
      });

      const messages: OpenAICompatibleMessage[] = [
        {
          role: "system",
          content: ANSIBLE_SYSTEM_PROMPT_PLAYBOOK,
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ];

      const result = await this.makeOpenAIRequest(messages, {
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = result.choices?.[0]?.message?.content || "";
      
      // Extract YAML from code blocks first, then clean
      let cleanedContent = this.extractYamlFromCodeBlock(content);
      const originalCleaned = cleanedContent;
      cleanedContent = this.cleanAnsibleOutput(cleanedContent);

      console.log("[RHCustom Provider] Cleaned playbook content length:", cleanedContent.length);

      this.logger.info(
        `[RHCustom Provider] Generated playbook (full):\n${cleanedContent}`,
      );

      // Generate outline from the playbook if requested
      let outline = "";
      if (params.createOutline) {
        // Try to generate outline from cleaned content
        outline = generateOutlineFromPlaybook(cleanedContent);
        
        // If outline generation failed (empty result), try with original extracted content
        if (!outline && originalCleaned !== cleanedContent) {
          console.log("[RHCustom Provider] Outline generation failed with cleaned content, trying original extracted content");
          outline = generateOutlineFromPlaybook(originalCleaned);
        }
        
        // If still empty, try to extract task names using regex as fallback
        if (!outline) {
          console.log("[RHCustom Provider] Trying regex-based task extraction as fallback");
          outline = this.extractTaskNamesFromYaml(cleanedContent || originalCleaned);
        }
        
        console.log("[RHCustom Provider] Generated outline:", outline);
        console.log("[RHCustom Provider] Outline length:", outline.length);
        this.logger.info(`[RHCustom Provider] Generated outline: ${outline}`);
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(
        `[RHCustom Provider] Playbook generation failed: ${error}`,
      );
      throw this.handleRHCustomError(error, "playbook generation");
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

      const enhancedPrompt = this.applyAnsibleContext(rolePrompt, {
        ansibleFileType: "tasks",
      });

      const messages: OpenAICompatibleMessage[] = [
        {
          role: "system",
          content: ANSIBLE_SYSTEM_PROMPT_ROLE,
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ];

      const result = await this.makeOpenAIRequest(messages, {
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = result.choices?.[0]?.message?.content || "";
      console.log("[RHCustom Provider] Raw role content (first 500 chars):", content.substring(0, 500));
      
      // Extract YAML from code blocks, stopping at the closing ```
      let cleanedContent = this.extractYamlFromCodeBlock(content);
      console.log("[RHCustom Provider] Extracted YAML (first 500 chars):", cleanedContent.substring(0, 500));
      
      // Further clean using the base method
      cleanedContent = this.cleanAnsibleOutput(cleanedContent);
      console.log("[RHCustom Provider] Cleaned role content (first 500 chars):", cleanedContent.substring(0, 500));
      console.log("[RHCustom Provider] Cleaned role content length:", cleanedContent.length);

      this.logger.info(
        `[RHCustom Provider] Generated role (full):\n${cleanedContent}`,
      );

      // Generate outline from the role if requested
      let outline = "";
      if (params.createOutline) {
        console.log("[RHCustom Provider] Generating outline from role content, createOutline:", params.createOutline);
        console.log("[RHCustom Provider] Cleaned content to parse:", cleanedContent.substring(0, 1000));
        
        // Try to parse and validate the structure before generating outline
        try {
          const yaml = require("js-yaml");
          const parsed = yaml.load(cleanedContent);
          console.log("[RHCustom Provider] Parsed YAML type:", Array.isArray(parsed) ? "array" : typeof parsed);
          console.log("[RHCustom Provider] Parsed YAML is array:", Array.isArray(parsed));
          if (parsed && typeof parsed === "object") {
            console.log("[RHCustom Provider] Parsed YAML keys:", Object.keys(parsed));
          }
        } catch (parseError) {
          console.log("[RHCustom Provider] Failed to parse cleaned content:", parseError);
        }
        
        outline = generateOutlineFromRole(cleanedContent);
        console.log("[RHCustom Provider] Generated outline:", outline);
        console.log("[RHCustom Provider] Outline length:", outline.length);
        
        if (!outline) {
          console.log("[RHCustom Provider] WARNING: Outline is empty. This might mean the YAML structure is not an array of tasks.");
        }
        
        this.logger.info(`[RHCustom Provider] Generated outline: ${outline}`);
      } else {
        console.log("[RHCustom Provider] Skipping outline generation, createOutline is false");
      }

      return {
        content: cleanedContent,
        outline: outline,
        model: this.modelName,
      };
    } catch (error) {
      this.logger.error(`[RHCustom Provider] Role generation failed: ${error}`);
      throw this.handleRHCustomError(error, "role generation");
    }
  }
}

