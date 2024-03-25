import { AxiosError } from "axios";
import {
  ERRORS,
  ERRORS_UNAUTHORIZED,
  ERRORS_TOO_MANY_REQUESTS,
  ERRORS_BAD_REQUEST,
  ERRORS_UNKNOWN,
  ERRORS_CONNECTION_TIMEOUT,
} from "./errors";

export function retrieveError(err: AxiosError): string {
  if (err && "response" in err) {
    const responseErrorData = <AxiosError<{ message?: string }>>(
      err?.response?.data
    );
    // Lookup _known_ errors
    const status: number = err?.response?.status ?? 500;
    const code: string = responseErrorData.hasOwnProperty("code")
      ? (responseErrorData.code as string)
      : "unknown";
    const message = responseErrorData.hasOwnProperty("message")
      ? (responseErrorData.message as string)
      : "unknown";
    const mappedError = ERRORS.getError(status, code);
    if (mappedError) {
      return mappedError.message || message;
    }

    // If the error is unknown fallback to defaults
    if (status === 400) {
      return ERRORS_BAD_REQUEST.message || message;
    }
    if (status === 401) {
      return ERRORS_UNAUTHORIZED.message || message;
    }
    if (status === 403) {
      // Special case where the error is not from the backend service
      if (
        (err?.response?.headers["server"] || "").toLowerCase() === "cloudfront"
      ) {
        return (
          "Something in your editor content has caused your inline suggestion request to be blocked. \n" +
          "Please open a ticket with Red Hat support and include the content of your editor up to the \n" +
          "line and column where you requested a suggestion."
        );
      } else {
        return ERRORS_UNAUTHORIZED.message || message;
      }
    }
    if (status === 429) {
      return ERRORS_TOO_MANY_REQUESTS.message || message;
    }
    if (status === 500) {
      return ERRORS_UNKNOWN.message || message;
    }
  }

  if (err.code === AxiosError.ECONNABORTED) {
    return ERRORS_CONNECTION_TIMEOUT.message as string;
  }
  return ERRORS_UNKNOWN.message as string;
}
