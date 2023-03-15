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
  activityId?: string;
}

export interface AnsibleContentEvent {
  content: string;
  documentUri: string;
  trigger: AnsibleContentUploadTrigger;
  activityId: string | undefined;
}
export interface FeedbackRequestParams {
  inlineSuggestion?: InlineSuggestionEvent;
  ansibleContent?: AnsibleContentEvent;
}

export interface IDocumentTracker {
  [key: string]: string;
}
