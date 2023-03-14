export interface CompletionResponseParams {
  predictions: string[];
}

export interface CompletionRequestParams {
  prompt: string;
  suggestionId?: string;
}

export enum UserAction {
  ACCEPT = 0,
  IGNORE = 1,
}

export enum AnsibleContentUploadTrigger {
  FILE_OPEN = 0,
  FILE_CLOSE = 1,
  TAB_CHANGE = 2,
}

export interface FeedbackResponseParams {
  message: string;
}

export interface InlineSuggestionEvent {
  latency?: number;
  userActionTime?: number;
  documentUri?: string;
  action?: UserAction;
  error?: string;
  suggestionId?: string;
}

export interface AnsibleContentEvent {
  content: string;
  documentUri: string;
  trigger: AnsibleContentUploadTrigger;
}
export interface FeedbackRequestParams {
  inlineSuggestion?: InlineSuggestionEvent;
  ansibleContent?: AnsibleContentEvent;
}
