/**
 * Interface for Lightspeed playbook generation/explanation APIs
 */
export interface GenerationResponse {
  content: string;
  format: string;
  generationId: string;
}

export interface SummaryResponse {
  content: string;
  format: string;
  summaryId: string;
}

export interface ExplanationResponse {
  content: string;
  format: string;
  explanationId: string;
}
