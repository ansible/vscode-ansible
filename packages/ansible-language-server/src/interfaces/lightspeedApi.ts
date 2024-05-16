/**
 * Interface for Lightspeed playbook generation/explanation APIs
 */
export interface GenerationResponse {
  playbook: string;
  outline?: string;
  generationId: string;
}

export interface ExplanationResponse {
  content: string;
  format: string;
  explanationId: string;
}
