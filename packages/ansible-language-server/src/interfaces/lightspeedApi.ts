/**
 * Interface for Lightspeed playbook generation/explanation APIs
 */
export interface IError {
  code: string;
  message?: string;
  detail?: unknown;
}

export interface GenerationSuccessResponse {
  playbook: string;
  outline?: string;
  generationId: string;
}

export interface ExplanationSuccessResponse {
  content: string;
  format: string;
  explanationId: string;
}

export type GenerationResponse = GenerationSuccessResponse | IError;

export type ExplanationResponse = ExplanationSuccessResponse | IError;
