export interface SuggestionResult {
  predictions: string[];
}

export interface RequestParams {
  context: string;
  prompt: string;
}

export interface WisdomTelemetryEvent {
  request?: RequestParams;
  requestDateTime?: string;
  response?: SuggestionResult;
  responseDateTime?: string;
  documentUri?: string;
  suggestionDisplayed?: string;
  userAction?: "accept" | "ignore" | "modify";
  suggestionId?: string;
  feedback?: string;
  userUIFeedbackEnabled?: boolean;
  error?: string;
}
