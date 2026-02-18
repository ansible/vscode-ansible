import {
  ExplanationResponseParams,
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
} from "../../../interfaces/lightspeed";

export interface IError {
  code: string;
  message?: string;
  detail?: unknown;
}

export const UNKNOWN_ERROR: string = "An unknown error occurred.";

/** Format error detail for display; avoids [object Object] when detail is an object. */
export function formatErrorDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return "";
  if (typeof detail === "object") return JSON.stringify(detail);
  return typeof detail === "string"
    ? detail
    : String(detail as number | boolean);
}

export function isError(
  response:
    | ExplanationResponseParams
    | PlaybookGenerationResponseParams
    | RoleGenerationResponseParams
    | IError,
): response is IError {
  return (response as IError).code !== undefined;
}

export class HTTPError extends Error {
  readonly response: Response;
  readonly code: number;
  readonly body: object;

  constructor(response: Response, code: number, body: object) {
    super();
    this.response = response;
    this.code = code;
    this.body = body;
  }
}
