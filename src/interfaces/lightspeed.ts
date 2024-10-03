import { AuthenticationSession } from "vscode";
import {
  LIGHTSPEED_USER_TYPE,
  PlaybookGenerationActionType,
  ThumbsUpDownAction,
  UserAction,
} from "../definitions/lightspeed";

export interface LightspeedAuthSession extends AuthenticationSession {
  rhUserHasSeat: boolean;
  rhOrgHasSubscription: boolean;
  rhUserIsOrgAdmin: boolean;
}
export interface LightspeedUserDetails {
  rhUserHasSeat: boolean;
  rhOrgHasSubscription: boolean;
  rhUserIsOrgAdmin: boolean;
  displayName: string;
  displayNameWithUserType: string;
  orgOptOutTelemetry: boolean;
}

export interface CompletionResponseParams {
  predictions: string[];
  model?: string;
  suggestionId: string;
}

export interface MetadataParams {
  documentUri: string;
  ansibleFileType: IAnsibleFileType;
  activityId: string;
  additionalContext?: IAdditionalContext;
}

export interface CompletionRequestParams {
  prompt: string;
  suggestionId?: string;
  metadata?: MetadataParams;
  model?: string;
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

export interface SentimentFeedbackEvent {
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

export interface PlaybookExplanationEvent {
  explanationId?: string;
}

export interface PlaybookFeedbackEvent {
  action: ThumbsUpDownAction;
  explanationId?: string;
  generationId?: string;
}

export interface PlaybookGenerationActionEvent {
  wizardId: string;
  action: PlaybookGenerationActionType;
  fromPage?: number;
  toPage?: number;
}

export interface FeedbackRequestParams {
  inlineSuggestion?: InlineSuggestionEvent;
  sentimentFeedback?: SentimentFeedbackEvent;
  suggestionQualityFeedback?: SuggestionQualityEvent;
  issueFeedback?: IssueFeedbackEvent;
  playbookExplanation?: PlaybookExplanationEvent;
  playbookExplanationFeedback?: PlaybookFeedbackEvent;
  playbookGenerationFeedback?: PlaybookFeedbackEvent;
  playbookGenerationAction?: PlaybookGenerationActionEvent;
  playbookOutlineFeedback?: PlaybookFeedbackEvent;
  model?: string;
}

export interface IDocumentTrackerFields {
  activityId: string;
  content: string;
}

export interface IDocumentTracker {
  [key: string]: IDocumentTrackerFields;
}

export interface ContentMatchesRequestParams {
  suggestions: string[];
  suggestionId: string;
  model?: string;
}

export interface IContentMatchParams {
  repo_name: string;
  repo_url: string;
  path: string;
  license: string;
  data_source_description: string;
  score: number;
}

export interface IContentMatch {
  contentmatch: IContentMatchParams[];
}

export interface ContentMatchesResponseParams {
  contentmatches: IContentMatch[];
}

export interface ISuggestionDetails {
  suggestion: string;
  suggestionId: string;
  isPlaybook: boolean;
}

export interface GenerationRequestParams {
  text: string;
  outline?: string;
  generationId: string;
  createOutline: boolean;
  wizardId?: string;
}

export interface GenerationResponseParams {
  playbook: string;
  outline?: string;
  generationId: string;
}

export interface ExplanationRequestParams {
  content: string;
  explanationId: string;
}

export interface ExplanationResponseParams {
  content: string;
  format: string;
  explanationId: string;
}

export type IAnsibleFileType = "playbook" | "tasks_in_role" | "tasks" | "other";

export type VarType = "defaults" | "vars";

export interface IAnsibleFileTypes {
  [key: string]: IAnsibleFileType;
}

export interface IVarsContext {
  [key: string]: string;
}

export interface IIncludeVarsContext {
  [key: string]: string;
}

export interface IVarsFileContext {
  [key: string]: string;
}

export interface IRoleVarsContext {
  defaults: IVarsFileContext;
  vars: IVarsFileContext;
}

export interface IRoleContext {
  name?: string;
  tasks?: string[];
  roleVars?: IRoleVarsContext;
  includeVars?: IIncludeVarsContext;
}

export interface IRolesContext {
  [rolePath: string]: IRoleContext;
}

export interface IStandaloneTaskContext {
  includeVars?: IIncludeVarsContext;
}

export interface IWorkSpaceRolesContext {
  [workSpaceRoot: string]: IRolesContext;
}

export interface IPlaybookContext {
  varInfiles?: IVarsFileContext;
  roles?: IRolesContext;
  taskFileNames?: string[];
  includeVars?: IIncludeVarsContext;
}

export interface IAdditionalContext {
  playbookContext?: IPlaybookContext;
  roleContext?: IRoleContext;
  standaloneTaskContext?: IStandaloneTaskContext;
}

export interface LightspeedSessionUserInfo {
  userType?: LIGHTSPEED_USER_TYPE;
  role?: string;
  subscribed?: boolean;
}

export interface LightspeedSessionModelInfo {
  model?: string;
}

export interface LightspeedSessionInfo {
  userInfo?: LightspeedSessionUserInfo;
  modelInfo?: LightspeedSessionModelInfo;
}
