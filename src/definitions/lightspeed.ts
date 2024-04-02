export interface CompletionResponseParams {
  predictions: string[];
}

export interface MetadataParams {
  documentUri: string;
  activityId: string;
}
export interface CompletionRequestParams {
  prompt: string;
  suggestionId?: string;
  metadata?: MetadataParams;
  model?: string;
}

export enum UserAction {
  ACCEPTED = 0, // accepted the suggestion
  REJECTED = 1, // rejected the suggestion
  IGNORED = 2, // ignored the suggestion or didn't wait for suggestion to be displayed
}

export enum AnsibleContentUploadTrigger {
  FILE_OPEN = 0,
  FILE_CLOSE = 1,
  TAB_CHANGE = 2,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LightSpeedCommands {
  export const LIGHTSPEED_AUTH_REQUEST = "ansible.lightspeed.oauth";
  export const LIGHTSPEED_SUGGESTION_COMMIT =
    "ansible.lightspeed.inlineSuggest.accept";
  export const LIGHTSPEED_SUGGESTION_HIDE =
    "ansible.lightspeed.inlineSuggest.hide";
  export const LIGHTSPEED_SUGGESTION_TRIGGER =
    "ansible.lightspeed.inlineSuggest.trigger";
  export const LIGHTSPEED_SUGGESTION_MARKER =
    "ansible.lightspeed.inlineSuggest.marker";
  export const LIGHTSPEED_STATUS_BAR_CLICK =
    "ansible.lightspeed.statusBar.click";
  export const LIGHTSPEED_FETCH_TRAINING_MATCHES =
    "ansible.lightspeed.fetchTrainingMatches";
  export const LIGHTSPEED_CLEAR_TRAINING_MATCHES =
    "ansible.lightspeed.clearTrainingMatches";
  export const LIGHTSPEED_FEEDBACK = "ansible.lightspeed.feedback";
  export const LIGHTSPEED_PLAYBOOK_EXPLANATION =
    "ansible.lightspeed.playbookExplanation";
}

export const LIGHTSPEED_API_VERSION = "v0";
export const LIGHTSPEED_SUGGESTION_COMPLETION_URL = `${LIGHTSPEED_API_VERSION}/ai/completions/`;
export const LIGHTSPEED_SUGGESTION_FEEDBACK_URL = `${LIGHTSPEED_API_VERSION}/ai/feedback/`;
export const LIGHTSPEED_SUGGESTION_CONTENT_MATCHES_URL = `${LIGHTSPEED_API_VERSION}/ai/contentmatches/`;
export const LIGHTSPEED_ME_AUTH_URL = `/api/${LIGHTSPEED_API_VERSION}/me/`;

export const LIGHTSPEED_FEEDBACK_FORM_URL =
  "https://red.ht/ansible-ai-feedback";

export const LIGHTSPEED_REPORT_EMAIL_ADDRESS = "ansible-content-ai@redhat.com";
export const LIGHTSPEED_STATUS_BAR_CLICK_HANDLER =
  "ansible.lightspeed.statusBar.clickHandler";

export const LIGHTSPEED_CLIENT_ID = "Vu2gClkeR5qUJTUGHoFAePmBznd6RZjDdy5FW2wy";
export const LIGHTSPEED_SERVICE_LOGIN_TIMEOUT = 120000;

export type LIGHTSPEED_SUGGESTION_TYPE = "SINGLE-TASK" | "MULTI-TASK";

export type LIGHTSPEED_USER_TYPE = "Licensed" | "Unlicensed" | "Not logged in";
export const LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT = "Lightspeed (not logged in)";

export const LIGHTSPEED_MODEL_DEFAULT = "default";

export const LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT =
  "# Content suggestion provided by Ansible Lightspeed\n";

export const tasksInPlaybookKeywords = [
  /(?<!\S)tasks\s*:(?!\S)\s*$/,
  /(?<!\S)block\s*:(?!\S)\s*$/,
  /(?<!\S)rescue\s*:(?!\S)\s*$/,
  /(?<!\S)always\s*:(?!\S)\s*$/,
  /(?<!\S)pre_tasks\s*:(?!\S)\s*$/,
  /(?<!\S)post_tasks\s*:(?!\S)\s*$/,
  /(?<!\S)handlers\s*:(?!\S)\s*$/,
];

export const tasksFileKeywords = [
  /(?<!\S)block\s*:(?!\S)\s*$/,
  /(?<!\S)rescue\s*:(?!\S)\s*$/,
  /(?<!\S)always\s*:(?!\S)\s*$/,
];

export const SINGLE_TASK_REGEX_EP =
  /^(?<![\s-])(?<blank>\s*)(?<list>- \s*name\s*:\s*)(?<description>\S.*)(?<end>$)/;
export const MULTI_TASK_REGEX_EP = /^\s*#\s*\S+.*$/;
