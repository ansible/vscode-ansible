import { LightSpeedAPI } from "../../api";
import { IError } from "../../utils/errors";
import {
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  GenerationListEntry,
  ExplanationResponseParams,
  ExplanationRequestParams,
  RoleExplanationRequestParams,
  RoleGenerationRequestParams,
  RoleFileType,
} from "../../../../interfaces/lightspeed";
import {
  LightSpeedCommands,
  ThumbsUpDownAction,
} from "../../../../definitions/lightspeed";
import { ANSIBLE_PLAYBOOK_EXPLANATION_TEMPLATE } from "../../../../definitions/constants";
import { commands, ExtensionContext } from "vscode";
import { lightSpeedManager } from "../../../../extension";

export async function explainPlaybook(
  apiInstance: LightSpeedAPI,
  content: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  // Route to appropriate provider
  const provider =
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider;

  if (provider && provider !== "wca" && lightSpeedManager.providerManager) {
    try {
      // Use chat endpoint for explanation with LLM providers
      const explanationPrompt = ANSIBLE_PLAYBOOK_EXPLANATION_TEMPLATE.replace(
        "{PLAYBOOK}",
        content,
      );

      const chatResponse = await lightSpeedManager.providerManager.chatRequest({
        message: explanationPrompt,
        conversationId: explanationId,
        metadata: { isExplanation: true }, // Signal this is explanation, not chat
      });

      return {
        content: chatResponse.message,
        format: "markdown",
        explanationId: explanationId,
      };
    } catch (error) {
      return {
        message:
          error instanceof Error
            ? error.message
            : "Playbook explanation failed",
        code: "EXPLANATION_ERROR",
      } as IError;
    }
  }

  // WCA provider - use existing API
  const params: ExplanationRequestParams = {
    content,
    explanationId,
  };

  const response: ExplanationResponseParams | IError =
    await apiInstance.explanationRequest(params);
  return response;
}

export async function explainRole(
  apiInstance: LightSpeedAPI,
  files: GenerationListEntry[],
  roleName: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  // Route to appropriate provider
  const provider =
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider;

  if (provider && provider !== "wca" && lightSpeedManager.providerManager) {
    try {
      // Combine all role files into a single content string for explanation
      const roleContent = files
        .map((f) => `# ${f.path}\n${f.content}`)
        .join("\n\n");

      const llmResponse = await lightSpeedManager.providerManager.chatRequest({
        message: roleContent,
        conversationId: explanationId,
        metadata: {
          isExplanation: true,
          ansibleFileType: "tasks",
        },
      });

      return {
        content: llmResponse.message,
        format: "markdown",
        explanationId: explanationId,
      };
    } catch (error) {
      console.error(`[explainRole] Error:`, error);
      return {
        message:
          error instanceof Error ? error.message : "Role explanation failed",
        code: "EXPLANATION_ERROR",
      } as IError;
    }
  }

  // WCA provider - use existing API
  const params: RoleExplanationRequestParams = {
    files: files,
    roleName: roleName,
    explanationId: explanationId,
  };

  const response: ExplanationResponseParams | IError =
    await apiInstance.roleExplanationRequest(params);

  return response;
}

export async function generateRole(
  apiInstance: LightSpeedAPI,
  name: string | undefined,
  text: string,
  outline: string,
  generationId: string,
): Promise<RoleGenerationResponseParams | IError> {
  const createOutline = outline.length === 0;

  // Route to appropriate provider
  const provider =
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider;

  if (provider && provider !== "wca" && lightSpeedManager.providerManager) {
    try {
      const llmResponse = await lightSpeedManager.providerManager.generateRole({
        prompt: text,
        type: "role",
        createOutline: createOutline, // Pass through createOutline flag
        outline: outline.length > 0 ? outline : undefined, // Pass user-edited outline if provided
      });

      // Create file structure for LLM providers
      // LLM providers return a single tasks/main.yml content, so we structure it appropriately
      const files: GenerationListEntry[] = [
        {
          path: "tasks/main.yml",
          content: llmResponse.content,
          file_type: RoleFileType.Task,
        },
      ];

      // Convert LLM response to expected format
      const finalResponse = {
        role: llmResponse.content,
        files: files, // Create tasks/main.yml file structure
        name: name || "generated-role",
        outline: llmResponse.outline,
        generationId,
      };

      return finalResponse;
    } catch (error) {
      return {
        message:
          error instanceof Error ? error.message : "Role generation failed",
        code: "GENERATION_ERROR",
      } as IError;
    }
  }

  // WCA provider - use existing API
  const params: RoleGenerationRequestParams = {
    text,
    outline: outline.length > 0 ? outline : undefined,
    createOutline,
    generationId,
    name: name,
  };

  const response: RoleGenerationResponseParams | IError =
    await apiInstance.roleGenerationRequest(params);
  return response;
}

export async function generatePlaybook(
  apiInstance: LightSpeedAPI,
  text: string,
  outline: string,
  generationId: string,
): Promise<PlaybookGenerationResponseParams | IError> {
  const createOutline = outline.length === 0;

  // Route to appropriate provider
  const provider =
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider;

  if (provider && provider !== "wca" && lightSpeedManager.providerManager) {
    try {
      const llmResponse =
        await lightSpeedManager.providerManager.generatePlaybook({
          prompt: text,
          type: "playbook",
          createOutline: createOutline, // Pass through createOutline flag
          outline: outline.length > 0 ? outline : undefined, // Pass user-edited outline if provided
        });

      // Convert LLM response to expected format
      return {
        playbook: llmResponse.content,
        outline: llmResponse.outline || "", // LLM providers now generate outlines
        generationId,
      };
    } catch (error) {
      return {
        message:
          error instanceof Error ? error.message : "Playbook generation failed",
        code: "GENERATION_ERROR",
      } as IError;
    }
  }

  // WCA provider - use existing API
  const response: PlaybookGenerationResponseParams | IError =
    await apiInstance.playbookGenerationRequest({
      text,
      outline: outline.length > 0 ? outline : undefined,
      createOutline,
      generationId,
    });
  return response;
}

export async function thumbsUpDown(
  action: ThumbsUpDownAction,
  explanationId: string,
) {
  commands.executeCommand("ansible.lightspeed.thumbsUpDown", {
    action: action,
    explanationId: explanationId,
  });
}

export function contentMatch(generationId: string, playbook: string) {
  console.log(playbook);
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: generationId,
      suggestion: playbook,
      isPlaybook: true,
    },
  ];

  commands.executeCommand(LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES);
}

export function updatePromptHistory(
  context: ExtensionContext,
  new_prompt: string,
) {
  const recent_prompts: string[] = context.workspaceState
    .get("ansible.lightspeed.recent_prompts", [])
    .filter((prompt: string) => prompt !== new_prompt);
  recent_prompts.push(new_prompt);
  context.workspaceState.update(
    "ansible.lightspeed.recent_prompts",
    recent_prompts.slice(-500),
  );
}
