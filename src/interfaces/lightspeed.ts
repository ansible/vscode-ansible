import { AuthenticationSession } from "vscode";
import {
  AnsibleContentUploadTrigger,
  UserAction,
} from "../definitions/lightspeed";

export interface LightspeedAuthSession extends AuthenticationSession {
  rhUserHasSeat: boolean;
}

export interface CompletionResponseParams {
  predictions: string[];
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

export interface IDocumentTrackerFields {
  activityId: string;
  content: string;
}

export interface IDocumentTracker {
  [key: string]: IDocumentTrackerFields;
}

export interface AttributionsRequestParams {
  suggestion: string;
  suggestionId: string;
  model?: string;
}

export interface IAttributionParams {
  repo_name: string;
  repo_url: string;
  path: string;
  license: string;
  data_source: string;
  ansible_type: string;
  score: number;
}

export interface IAttribution {
  attribution: IAttributionParams[];
}

export interface AttributionsResponseParams {
  attributions: IAttributionParams[] | IAttribution[];
}

export interface ISuggestionDetails {
  suggestion: string;
  suggestionId: string;
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
