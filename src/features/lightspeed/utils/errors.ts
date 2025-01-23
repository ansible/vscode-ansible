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
