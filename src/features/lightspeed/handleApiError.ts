import { AxiosError } from "axios";
import { CanceledError } from "axios";

import {
  ERRORS,
  ERRORS_UNAUTHORIZED,
  ERRORS_TOO_MANY_REQUESTS,
  ERRORS_BAD_REQUEST,
  ERRORS_UNKNOWN,
  ERRORS_CONNECTION_CANCELED_TIMEOUT,
  ERRORS_CONNECTION_TIMEOUT,
  ERRORS_NOT_FOUND,
} from "./errors";
import { IError } from "./utils/errors";

export function mapError(err: AxiosError): IError {
  // Lookup _known_ errors
  const mappedError = ERRORS.getError(err);
  if (mappedError) {
    return mappedError;
  }

  // If the error is unknown fallback to defaults
  const detail = err.response?.data;
  const status: number | string = err?.response?.status ?? err?.code ?? 500;
  if (err instanceof CanceledError) {
    return ERRORS_CONNECTION_CANCELED_TIMEOUT;
  }
  if (status === 400) {
    return ERRORS_BAD_REQUEST.withDetail(detail);
  }
  if (status === 401) {
    return ERRORS_UNAUTHORIZED.withDetail(detail);
  }
  if (status === 403) {
    return ERRORS_UNAUTHORIZED.withDetail(detail);
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
  if (status === AxiosError.ECONNABORTED) {
    return ERRORS_CONNECTION_TIMEOUT.withDetail(detail);
  }

  console.log(`Lightspeed request failed with unknown error ${err}`);
  return ERRORS_UNKNOWN.withDetail(detail);
}
