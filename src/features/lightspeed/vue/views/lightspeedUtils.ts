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
} from "../../../../interfaces/lightspeed";
import {
  LightSpeedCommands,
  ThumbsUpDownAction,
} from "../../../../definitions/lightspeed";
import { commands, ExtensionContext } from "vscode";
import { lightSpeedManager } from "../../../../extension";

export async function explainPlaybook(
  apiInstance: LightSpeedAPI,
  content: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
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
