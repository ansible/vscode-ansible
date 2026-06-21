import { describe, it, expect } from 'vitest';
import {
    ERRORS,
    HTTPError,
    isError,
    formatErrorDetail,
    ERRORS_UNAUTHORIZED,
    ERRORS_NOT_FOUND,
    ERRORS_TOO_MANY_REQUESTS,
    ERRORS_BAD_REQUEST,
    ERRORS_UNKNOWN,
    UNKNOWN_ERROR,
} from '../../src/errors';

describe('isError', () => {
    it('returns true for objects with a code property', () => {
        expect(isError({ code: 'ERR', message: 'fail' })).toBe(true);
    });

    it('returns false for objects without a code property', () => {
        expect(isError({ message: 'no code' } as never)).toBe(false);
    });
});

describe('formatErrorDetail', () => {
    it('formats string details as-is', () => {
        expect(formatErrorDetail('details here')).toBe('details here');
    });

    it('formats object details as JSON', () => {
        const result = formatErrorDetail({ key: 'value' });
        expect(result).toContain('key');
        expect(result).toContain('value');
    });

    it('handles undefined detail', () => {
        expect(formatErrorDetail(undefined)).toBe('');
    });

    it('handles null detail', () => {
        expect(formatErrorDetail(null)).toBe('');
    });

    it('handles number detail', () => {
        expect(formatErrorDetail(42)).toBe('42');
    });

    it('handles boolean detail', () => {
        expect(formatErrorDetail(true)).toBe('true');
    });
});

describe('HTTPError', () => {
    it('stores status code in .code and body', () => {
        const mockResponse = { status: 403, url: 'https://test.com' } as Response;
        const error = new HTTPError(mockResponse, 403, { detail: 'forbidden' });
        expect(error.code).toBe(403);
        expect(error.body).toEqual({ detail: 'forbidden' });
        expect(error.response).toBe(mockResponse);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('HTTPError');
    });
});

describe('ERRORS registry', () => {
    it('returns a matching error for a known 403 status with matching code', () => {
        const mockResponse = {
            status: 403,
            url: 'https://test.com',
            headers: new Headers(),
        } as Response;
        const httpErr = new HTTPError(mockResponse, 403, {
            code: 'error__wca_invalid_model_id',
        });
        const result = ERRORS.getError(httpErr);
        expect(result).toBeDefined();
        expect(result?.code).toBe('error__wca_invalid_model_id');
    });

    it('returns undefined for an unregistered HTTP status', () => {
        const mockResponse = {
            status: 999,
            url: 'https://test.com',
            headers: new Headers(),
        } as Response;
        const httpErr = new HTTPError(mockResponse, 999, {});
        const result = ERRORS.getError(httpErr);
        expect(result).toBeUndefined();
    });

    it('matches 503 service_unavailable', () => {
        const mockResponse = {
            status: 503,
            url: 'https://test.com',
            headers: new Headers(),
        } as Response;
        const httpErr = new HTTPError(mockResponse, 503, { code: 'service_unavailable' });
        const result = ERRORS.getError(httpErr);
        expect(result).toBeDefined();
        expect(result?.code).toBe('service_unavailable');
    });

    it('matches 500 internal_server', () => {
        const mockResponse = {
            status: 500,
            url: 'https://test.com',
            headers: new Headers(),
        } as Response;
        const httpErr = new HTTPError(mockResponse, 500, { code: 'internal_server' });
        const result = ERRORS.getError(httpErr);
        expect(result).toBeDefined();
        expect(result?.code).toBe('internal_server');
    });
});

describe('pre-defined error constants', () => {
    it('ERRORS_UNAUTHORIZED has code and message', () => {
        expect(ERRORS_UNAUTHORIZED.code).toBe('fallback__unauthorized');
        expect(ERRORS_UNAUTHORIZED.message).toBeTruthy();
    });

    it('ERRORS_NOT_FOUND has code and message', () => {
        expect(ERRORS_NOT_FOUND.code).toBe('fallback__not_found');
        expect(ERRORS_NOT_FOUND.message).toBeTruthy();
    });

    it('ERRORS_TOO_MANY_REQUESTS has code and message', () => {
        expect(ERRORS_TOO_MANY_REQUESTS.code).toBe('fallback__too_many_requests');
        expect(ERRORS_TOO_MANY_REQUESTS.message).toBeTruthy();
    });

    it('ERRORS_BAD_REQUEST has code and message', () => {
        expect(ERRORS_BAD_REQUEST.code).toBe('fallback__bad_request');
        expect(ERRORS_BAD_REQUEST.message).toBeTruthy();
    });

    it('ERRORS_UNKNOWN has code and message', () => {
        expect(ERRORS_UNKNOWN.code).toBe('fallback__unknown');
        expect(ERRORS_UNKNOWN.message).toBeTruthy();
    });

    it('UNKNOWN_ERROR is a non-empty string', () => {
        expect(UNKNOWN_ERROR).toBeTruthy();
        expect(typeof UNKNOWN_ERROR).toBe('string');
    });

    it('all error constants pass isError type guard', () => {
        expect(isError(ERRORS_UNAUTHORIZED)).toBe(true);
        expect(isError(ERRORS_NOT_FOUND)).toBe(true);
        expect(isError(ERRORS_TOO_MANY_REQUESTS)).toBe(true);
        expect(isError(ERRORS_BAD_REQUEST)).toBe(true);
        expect(isError(ERRORS_UNKNOWN)).toBe(true);
    });
});
