import { AuthenticationSession } from "vscode";
import {
  LIGHTSPEED_USER_TYPE,
  WizardGenerationActionType,
  ThumbsUpDownAction,
  UserAction,
} from "../definitions/lightspeed";

export interface LightspeedAuthSession extends AuthenticationSession {
  rhOrgHasSubscription: boolean;
  rhUserIsOrgAdmin: boolean;
}
export interface LightspeedUserDetails {
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
  action: WizardGenerationActionType;
  fromPage?: number;
  toPage?: number;
}

export interface RoleGenerationActionEvent {
  wizardId: string;
  action: WizardGenerationActionType;
  fromPage?: number;
  toPage?: number;
}

export interface RoleExplanationEvent {
  explanationId?: string;
}

export interface RoleFeedbackEvent {
  action: ThumbsUpDownAction;
  explanationId?: string;
  generationId?: string;
}

export interface FeedbackRequestParams {
  inlineSuggestion?: InlineSuggestionEvent;
  sentimentFeedback?: SentimentFeedbackEvent;
  suggestionQualityFeedback?: SuggestionQualityEvent;
  issueFeedback?: IssueFeedbackEvent;
  playbookExplanation?: PlaybookExplanationEvent;
  playbookExplanationFeedback?: PlaybookFeedbackEvent;
  playbookGenerationAction?: PlaybookGenerationActionEvent;
  roleGenerationAction?: RoleGenerationActionEvent;
  roleExplanation?: RoleExplanationEvent;
  roleExplanationFeedback?: RoleFeedbackEvent;
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

export interface PlaybookGenerationRequestParams {
  text: string;
  outline?: string;
  generationId: string;
  createOutline: boolean;
  wizardId?: string;
}

export interface RoleGenerationRequestParams {
  name?: string;
  text: string;
  outline?: string;
  generationId: string;
  createOutline: boolean;
  wizardId?: string;
}

export interface PlaybookGenerationResponseParams {
  playbook: string;
  outline?: string;
  generationId: string;
}

export enum RoleFileType {
  Default = "default",
  Task = "task",
  Playbook = "playbook",
}

export interface GenerationListEntry {
  path: string;
  file_type: RoleFileType;
  content: string;
}

export interface RoleGenerationResponseParams {
  files: GenerationListEntry[];
  outline?: string;
  generationId: string;
  name: string;
  role?: string; // deprecated
}

export interface RoleExplanationRequestParams {
  files: GenerationListEntry[];
  explanationId: string;
  roleName: string;
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
