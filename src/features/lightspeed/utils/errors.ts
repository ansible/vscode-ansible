import {
  GenerationResponseParams,
  ExplanationResponseParams,
} from "../../../interfaces/lightspeed";

export interface IError {
  code: string;
  message?: string;
  detail?: unknown;
}

export const UNKNOWN_ERROR: string = "An unknown error occurred.";

export function isError(
  response: GenerationResponseParams | ExplanationResponseParams | IError,
): response is IError {
  return (response as IError).code !== undefined;
}
