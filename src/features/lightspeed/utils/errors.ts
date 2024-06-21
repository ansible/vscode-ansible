import {
  GenerationResponse,
  ExplanationResponse,
} from "@ansible/ansible-language-server/src/interfaces/lightspeedApi";
import { IError } from "@ansible/ansible-language-server/src/interfaces/lightspeedApi";

export const UNKNOWN_ERROR: string = "An unknown error occurred.";

export function isError(
  response: GenerationResponse | ExplanationResponse,
): response is IError {
  return (response as IError).code !== undefined;
}
