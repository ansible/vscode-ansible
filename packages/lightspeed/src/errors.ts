import type {
    ExplanationResponseParams,
    PlaybookGenerationResponseParams,
    RoleGenerationResponseParams,
} from './interfaces';

/** Structured error returned by the API client. */
export interface IError {
    code: string;
    message?: string;
    detail?: unknown;
}

export const UNKNOWN_ERROR = 'An unknown error occurred.';

/**
 * Formats an error detail value for display, avoiding `[object Object]`.
 * @param detail - The detail value to format.
 * @returns A human-readable string representation.
 */
export function formatErrorDetail(detail: unknown): string {
    if (detail === undefined || detail === null) return '';
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object') return JSON.stringify(detail);
    if (typeof detail === 'number' || typeof detail === 'boolean') {
        return detail.toString();
    }
    if (typeof detail === 'bigint') return detail.toString();
    if (typeof detail === 'symbol') return detail.toString();
    if (typeof detail === 'function') {
        return detail.name.length > 0 ? detail.name : 'function';
    }
    return 'unknown';
}

/**
 * Type guard to distinguish IError from successful response types.
 * @param response - A response or error object.
 * @returns True if the response is an IError.
 */
export function isError(
    response:
        | ExplanationResponseParams
        | PlaybookGenerationResponseParams
        | RoleGenerationResponseParams
        | IError,
): response is IError {
    return 'code' in response;
}

/** HTTP error with access to the response, status code, and parsed body. */
export class HTTPError extends Error {
    readonly response: Response;
    readonly code: number;
    readonly body: object;

    /**
     * @param response - The raw fetch Response.
     * @param code - The HTTP status code.
     * @param body - The parsed response body.
     */
    constructor(response: Response, code: number, body: object) {
        super(`HTTP ${String(code)} from ${response.url}`);
        this.name = 'HTTPError';
        this.response = response;
        this.code = code;
        this.body = body;
    }
}

/** A known/mapped API error with an optional custom check function. */
class MappedError implements IError {
    readonly code: string;
    readonly message?: string;
    readonly detail?: unknown;
    readonly check: (err: HTTPError) => boolean;

    /**
     * @param code - Machine-readable error code.
     * @param message - Human-readable error message.
     * @param detail - Additional detail payload.
     * @param check - Custom predicate to match this error against an HTTPError.
     */
    public constructor(
        code: string,
        message?: string,
        detail?: unknown,
        check?: (err: HTTPError) => boolean,
    ) {
        this.code = code;
        this.message = message;
        this.detail = detail;
        if (check) {
            this.check = check;
        } else {
            this.check = (err: HTTPError) => {
                const responseErrorData = err.body as Record<string, unknown>;
                const errCode = Object.prototype.hasOwnProperty.call(responseErrorData, 'code')
                    ? String(responseErrorData.code)
                    : 'unknown';
                return this.code === errCode;
            };
        }
    }

    /**
     * Returns a clone of this error with a new detail value.
     * @param detail - The detail to attach.
     * @returns A new MappedError with the given detail.
     */
    public withDetail(detail?: unknown): MappedError {
        return new MappedError(this.code, this.message, detail, this.check);
    }
}

/** Registry of known HTTP errors keyed by status code. */
class ErrorRegistry {
    private errors = new Map<number, MappedError[]>();

    /**
     * Registers a known error for a given HTTP status code.
     * @param statusCode - The HTTP status code.
     * @param error - The error definition.
     */
    public addError(statusCode: number, error: MappedError): void {
        if (!this.errors.has(statusCode)) {
            this.errors.set(statusCode, []);
        }
        this.errors.get(statusCode)?.push(error);
    }

    /**
     * Looks up a known error matching the given HTTPError.
     * @param err - The HTTP error to match.
     * @returns The matching MappedError, or undefined.
     */
    public getError(err: HTTPError): MappedError | undefined {
        if (!('response' in err)) {
            return undefined;
        }

        const statusCode: number = err.response.status;
        const errors = this.errors.get(statusCode);
        if (!errors) {
            return undefined;
        }
        const e = errors.find((el) => el.check(err));

        if (e) {
            const responseErrorData = err.body as Record<string, unknown>;

            const message =
                e.message ??
                (Object.prototype.hasOwnProperty.call(responseErrorData, 'message')
                    ? String(responseErrorData.message)
                    : 'unknown');
            const items = err.body as Record<string, unknown>;
            const detail = Object.prototype.hasOwnProperty.call(items, 'detail')
                ? items.detail
                : undefined;

            return new MappedError(e.code, message, this.prettyPrintDetail(detail), e.check);
        }

        return undefined;
    }

    /**
     * Formats a detail value for user-facing display.
     * @param detail - The detail payload.
     * @returns Formatted string, or undefined if no detail.
     */
    public prettyPrintDetail(detail: unknown): string | undefined {
        let pretty = '';
        if (detail === undefined) {
            return undefined;
        } else if (typeof detail === 'string') {
            pretty = detail;
        } else if (Array.isArray(detail)) {
            const items = detail as string[];
            items.forEach((value: string, index: number) => {
                pretty =
                    pretty +
                    '(' +
                    String(index + 1) +
                    ') ' +
                    value +
                    (index < items.length - 1 ? ' ' : '');
            });
        } else if (detail instanceof Object && detail.constructor === Object) {
            const items = detail as Record<string, unknown>;
            const keys: string[] = Object.keys(detail);
            keys.forEach((key, index) => {
                pretty =
                    pretty + `${key}: ${String(items[key])}` + (index < keys.length - 1 ? ' ' : '');
            });
        }
        return pretty;
    }
}

export const ERRORS = new ErrorRegistry();

export const ERRORS_UNAUTHORIZED = new MappedError(
    'fallback__unauthorized',
    'You are not authorized to access Ansible Lightspeed. Please contact your administrator.',
);
export const ERRORS_NOT_FOUND = new MappedError(
    'fallback__not_found',
    'The resource could not be found. Please try again later.',
);
export const ERRORS_TOO_MANY_REQUESTS = new MappedError(
    'fallback__too_many_requests',
    'Too many requests to Ansible Lightspeed. Please try again later.',
);
export const ERRORS_BAD_REQUEST = new MappedError(
    'fallback__bad_request',
    'Bad Request response. Please try again.',
);
export const ERRORS_UNKNOWN = new MappedError(
    'fallback__unknown',
    'An error occurred attempting to complete your request. Please try again later.',
);
export const ERRORS_CONNECTION_TIMEOUT = new MappedError(
    'fallback__connection_timeout',
    'Ansible Lightspeed connection timeout. Please try again later.',
);
export const ERRORS_CONNECTION_CANCELED_TIMEOUT = new MappedError(
    'fallback__connection_canceled_timeout',
    'Ansible Lightspeed connection was canceled because of a timeout. Please try again later.',
);

// 400 errors
ERRORS.addError(
    400,
    new MappedError(
        'error__wca_cloud_flare_rejection',
        'Cloudflare rejected the request. Please contact your administrator.',
    ),
);
ERRORS.addError(
    400,
    new MappedError(
        'error__wca_hap_filter_rejection',
        'Potentially harmful language was detected in your request. Please check your input and try again.',
    ),
);
ERRORS.addError(
    400,
    new MappedError(
        'error__preprocess_invalid_yaml',
        'An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator.',
    ),
);
ERRORS.addError(400, new MappedError('error__feedback_validation'));
ERRORS.addError(
    400,
    new MappedError(
        'error__wca_inference_failure',
        'IBM watsonx Code Assistant inference failed. Please check your input and try again.',
    ),
);
ERRORS.addError(
    400,
    new MappedError(
        'error__wca_validation_failure',
        'IBM watsonx Code Assistant failed to validate the response from the model. Please check your input and try again.',
    ),
);

// 403 errors
ERRORS.addError(
    403,
    new MappedError(
        'error__wca_invalid_model_id',
        'IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'error__wca_key_not_found',
        'Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'error__no_default_model_id',
        'Ansible Lightspeed does not have a model configured. Contact your Ansible administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'error__wca_model_id_not_found',
        'Your organization does not have an IBM watsonx Code Assistant model configured. Contact your Red Hat organization administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__user_trial_expired',
        'Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__terms_of_use_not_accepted',
        'You have not accepted the Terms of Use. Please accept them before proceeding.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__user_not_org_administrator',
        'You are not an Administrator of the Organization.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__user_has_no_subscription',
        'Your organization does not have a subscription. Please contact your administrator.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__org_not_ready_because_wca_not_configured',
        'Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__user_with_no_seat',
        "You don't have access to IBM watsonx Code Assistant. Please contact your administrator.",
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__can_apply_for_trial',
        'Access denied but user can apply for a trial period.',
    ),
);
ERRORS.addError(
    403,
    new MappedError(
        'permission_denied__cloudfront',
        'Something in your editor content has caused your inline suggestion request to be blocked. \n' +
            'Please open a ticket with Red Hat support and include the content of your editor up to the \n' +
            'line and column where you requested a suggestion.',
        undefined,
        (err: HTTPError) => {
            const body: unknown = err.body;
            let bodyContainsCloudFront = false;
            let bodyContainsCloudFrontBlocked = false;
            const headerContainsCloudFrontServer: boolean =
                (err.response.headers.get('server') ?? '').toLowerCase() === 'cloudfront';
            if (typeof body === 'string') {
                bodyContainsCloudFront = (/cloudfront/.exec(body.toLowerCase())?.length ?? 0) > 0;
                bodyContainsCloudFrontBlocked =
                    (/blocked/.exec(body.toLowerCase())?.length ?? 0) > 0;
            }
            return (
                bodyContainsCloudFront &&
                bodyContainsCloudFrontBlocked &&
                headerContainsCloudFrontServer
            );
        },
    ),
);

// 404 errors
ERRORS.addError(
    404,
    new MappedError(
        'feature_not_available',
        'The requested action is not available in your environment.',
    ),
);

// 418 errors
ERRORS.addError(
    418,
    new MappedError(
        'error__wca_instance_deleted',
        'IBM watsonx Code Assistant instance associated with your Model Id has been deleted. Please contact your administrator.',
    ),
);

// 500 errors
ERRORS.addError(
    500,
    new MappedError(
        'internal_server',
        'An error occurred attempting to complete your request. Please try again later.',
    ),
);
ERRORS.addError(
    500,
    new MappedError(
        'error__feedback_internal_server',
        'An error occurred attempting to submit your feedback. Please try again later.',
    ),
);
ERRORS.addError(
    500,
    new MappedError(
        'error__wca_suggestion_correlation_failed',
        'IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.',
    ),
);
ERRORS.addError(
    500,
    new MappedError(
        'error__wca_request_id_correlation_failed',
        'IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.',
    ),
);

// 503 errors
ERRORS.addError(
    503,
    new MappedError(
        'error__attribution_exception',
        'An error occurred attempting to complete your request. Please try again later.',
    ),
);
ERRORS.addError(
    503,
    new MappedError(
        'service_unavailable',
        'The IBM watsonx Code Assistant is unavailable. Please try again later.',
    ),
);
