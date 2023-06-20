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
export interface SentimentEvent {
  value: number;
  feedback: string;
}

export interface SuggestionQualityEvent {
  prompt: string;
  providedSuggestion: string;
  expectedSuggestion: string;
  additionalComment: string;
}
export interface IssueFeedbackEvent {
  type: "bug-report" | "feature-request";
  title: string;
  description: string;
}

export interface FeedbackRequestParams {
  inlineSuggestion?: InlineSuggestionEvent;
  ansibleContent?: AnsibleContentEvent;
  sentimentFeedback?: SentimentEvent;
  suggestionQualityFeedback?: SuggestionQualityEvent;
  issueFeedback?: IssueFeedbackEvent;
}

export interface IDocumentTracker {
  [key: string]: string;
}

export interface AttributionsRequestParams {
  suggestion: string;
  suggestionId: string;
}

export interface IAttributionsParams {
  repo_name: string;
  repo_url: string;
  path: string;
  license: string;
  data_source: string;
  ansible_type: string;
  score: number;
}

export interface AttributionsResponseParams {
  attributions: IAttributionsParams[];
}

export interface ISuggestionDetails {
  suggestion: string;
  suggestionId: string;
}
