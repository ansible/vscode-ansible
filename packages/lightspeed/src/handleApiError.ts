import {
    ERRORS,
    ERRORS_UNAUTHORIZED,
    ERRORS_TOO_MANY_REQUESTS,
    ERRORS_BAD_REQUEST,
    ERRORS_UNKNOWN,
    ERRORS_CONNECTION_CANCELED_TIMEOUT,
    ERRORS_CONNECTION_TIMEOUT,
    ERRORS_NOT_FOUND,
    HTTPError,
    type IError,
} from './errors';

/**
 * Maps an HTTPError to a user-facing IError using the error registry.
 * @param err - The HTTP error to map.
 * @returns A structured error with code, message, and optional detail.
 */
function mapHttpError(err: HTTPError): IError {
    const mappedError = ERRORS.getError(err);
    if (mappedError) {
        return mappedError;
    }

    const items = err.body as Record<string, unknown>;
    const detail = Object.prototype.hasOwnProperty.call(items, 'detail') ? items.detail : undefined;
    const status: number = err.response.status;
    if (status === 400) {
        return ERRORS_BAD_REQUEST.withDetail(ERRORS.prettyPrintDetail(detail));
    }
    if (status === 401 || status === 403) {
        return ERRORS_UNAUTHORIZED.withDetail(ERRORS.prettyPrintDetail(detail));
    }
    if (status === 404) {
        return ERRORS_NOT_FOUND.withDetail(ERRORS.prettyPrintDetail(detail));
    }
    if (status === 429) {
        return ERRORS_TOO_MANY_REQUESTS.withDetail(ERRORS.prettyPrintDetail(detail));
    }

    return ERRORS_UNKNOWN.withDetail(ERRORS.prettyPrintDetail(detail));
}

/**
 * Maps any Error to a user-facing IError, handling timeouts,
 * cancellations, HTTP errors, and unknown failures.
 * @param err - The error to map.
 * @returns A structured error with code, message, and optional detail.
 */
export function mapError(err: Error): IError {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return ERRORS_CONNECTION_TIMEOUT;
    }
    if (err.name === 'CanceledError') {
        return ERRORS_CONNECTION_CANCELED_TIMEOUT;
    }
    if (err instanceof HTTPError) {
        return mapHttpError(err);
    }

    if (
        err.message.includes('authentication failed') ||
        err.message.includes('Token refresh failed')
    ) {
        return {
            code: 'permission_denied__user_not_authenticated',
            message: 'Your session has expired. Please sign in again.',
        };
    }

    return ERRORS_UNKNOWN.withDetail(err.message);
}
