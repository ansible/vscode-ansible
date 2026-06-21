import { describe, it, expect } from 'vitest';
import { mapError } from '../../src/handleApiError';
import { HTTPError, isError } from '../../src/errors';

describe('mapError', () => {
    it('maps AbortError to a timeout error', () => {
        const abort = new DOMException('The operation was aborted', 'AbortError');
        const result = mapError(abort);
        expect(isError(result)).toBe(true);
        expect(result.code).toBeTruthy();
    });

    it('maps TimeoutError to a timeout error', () => {
        const timeout = new DOMException('Signal timed out', 'TimeoutError');
        const result = mapError(timeout);
        expect(isError(result)).toBe(true);
        expect(result.code).toBeTruthy();
    });

    it('maps HTTPError with known status to a known error', () => {
        const httpErr = new HTTPError({} as Response, 403, { detail: 'forbidden' });
        const result = mapError(httpErr);
        expect(isError(result)).toBe(true);
        expect(result.code).toBeTruthy();
        expect(result.message).toBeTruthy();
    });

    it('maps HTTPError with unknown status to a fallback error', () => {
        const httpErr = new HTTPError({} as Response, 999, {});
        const result = mapError(httpErr);
        expect(isError(result)).toBe(true);
    });

    it('maps a generic Error to an unknown error', () => {
        const err = new Error('something broke');
        const result = mapError(err);
        expect(isError(result)).toBe(true);
    });
});
