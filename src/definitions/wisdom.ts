export interface SuggestionResult {
  predictions: string[];
}

export interface RequestParams {
  prompt: string;
  userId?: string;
  suggestionId?: string;
}

export interface WisdomTelemetryEvent {
  request?: RequestParams;
  requestDateTime?: string;
  response?: SuggestionResult;
  responseDateTime?: string;
  duration?: number;
  documentUri?: string;
  suggestionDisplayed?: string;
  userAction?: "accept" | "ignore";
  suggestionId?: string;
  error?: string;
}
