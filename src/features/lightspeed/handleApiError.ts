import { AxiosError } from "axios";
import {
  ERRORS,
  ERRORS_UNAUTHORIZED,
  ERRORS_TOO_MANY_REQUESTS,
  ERRORS_BAD_REQUEST,
  ERRORS_UNKNOWN,
  ERRORS_CONNECTION_TIMEOUT,
  ERRORS_CLOUDFRONT,
  ERRORS_NOT_FOUND,
} from "./errors";
import { IError } from "../../interfaces/lightspeed";

export function mapError(err: AxiosError): IError {
  const detail = err.response?.data;
  if (err && "response" in err) {
    const responseErrorData = <AxiosError<{ code?: string; message?: string }>>(
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
    let mappedError = ERRORS.getError(status, code);
    if (mappedError) {
      if (mappedError.message === undefined) {
        mappedError = mappedError.withMessage(message);
      }
      return mappedError;
    }

    // If the error is unknown fallback to defaults
    if (status === 400) {
      return ERRORS_BAD_REQUEST.withDetail(detail);
    }
    if (status === 401) {
      return ERRORS_UNAUTHORIZED.withDetail(detail);
    }
    if (status === 403) {
      // Special case where the error is not from the backend service
      if (
        (err?.response?.headers["server"] || "").toLowerCase() === "cloudfront"
      ) {
        return ERRORS_CLOUDFRONT.withDetail(detail);
      } else {
        return ERRORS_UNAUTHORIZED.withDetail(detail);
      }
    }
    if (status === 404) {
      return ERRORS_NOT_FOUND.withDetail(detail);
    }
    if (status === 429) {
      return ERRORS_TOO_MANY_REQUESTS.withDetail(detail);
    }
    if (status === 500) {
      return ERRORS_UNKNOWN.withDetail(detail);
    }
  }

  if (err.code === AxiosError.ECONNABORTED) {
    return ERRORS_CONNECTION_TIMEOUT.withDetail(detail);
  }

  return ERRORS_UNKNOWN.withDetail(detail);
}
