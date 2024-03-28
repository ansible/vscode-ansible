import { IError } from "../../interfaces/lightspeed";

class Error implements IError {
  readonly code: string;
  readonly message?: string;
  readonly detail?: unknown;

  public constructor(code: string, message?: string, detail?: unknown) {
    this.code = code;
    this.message = message;
    this.detail = detail;
  }

  public withMessage(message?: string): Error {
    return new Error(this.code, message, this.detail);
  }

  public withDetail(detail?: unknown): Error {
    return new Error(this.code, this.message, detail);
  }
}

class Errors {
  private errors: Map<number, Array<IError>> = new Map();

  public addError(statusCode: number, error: IError) {
    if (!this.errors.has(statusCode)) {
      this.errors.set(statusCode, []);
    }
    this.errors.get(statusCode)?.push(error);
  }

  public getError(statusCode: number, code: string): Error | undefined {
    if (!this.errors.has(statusCode)) {
      return undefined;
    }
    const errors: Array<IError> | undefined = this.errors.get(statusCode);
    if (!errors) {
      return undefined;
    }
    const e: IError | undefined = errors.find(function (el: IError) {
      return el.code === code;
    });
    if (e) {
      // Clone the object as we may update the associated message
      return new Error(e.code, e.message);
    }
    return undefined;
  }
}

export const ERRORS = new Errors();

export const ERRORS_UNAUTHORIZED = new Error(
  "fallback__unauthorized",
  "You are not authorized to access Ansible Lightspeed. Please contact your administrator."
);
export const ERRORS_NOT_FOUND = new Error(
  "fallback__not_found",
  "The resource could not be found. Please try again later."
);
export const ERRORS_TOO_MANY_REQUESTS = new Error(
  "fallback__too_many_requests",
  "Too many requests to Ansible Lightspeed. Please try again later."
);
export const ERRORS_BAD_REQUEST = new Error(
  "fallback__bad_request",
  "Bad Request response. Please try again."
);
export const ERRORS_UNKNOWN = new Error(
  "fallback__unknown",
  "An error occurred attempting to complete your request. Please try again later."
);
export const ERRORS_CONNECTION_TIMEOUT = new Error(
  "fallback__connection_timeout",
  "Ansible Lightspeed connection timeout. Please try again later."
);
export const ERRORS_CLOUDFRONT = new Error(
  "permission_denied__cloudfront",
  "Something in your editor content has caused your inline suggestion request to be blocked. \n" +
    "Please open a ticket with Red Hat support and include the content of your editor up to the \n" +
    "line and column where you requested a suggestion."
);

ERRORS.addError(
  204,
  new Error(
    "postprocess_error",
    "An error occurred post-processing the inline suggestion. Please contact your administrator."
  )
);
ERRORS.addError(
  204,
  new Error(
    "model_timeout",
    "Ansible Lightspeed timed out processing your request. Please try again later."
  )
);
ERRORS.addError(
  204,
  new Error(
    "error__wca_bad_request",
    "IBM watsonx Code Assistant returned a bad request response. Please contact your administrator."
  )
);
ERRORS.addError(
  204,
  new Error(
    "error__wca_empty_response",
    "IBM watsonx Code Assistant returned an empty response. Please contact your administrator."
  )
);

ERRORS.addError(
  400,
  new Error(
    "error__wca_cloud_flare_rejection",
    "Cloudflare rejected the request. Please contact your administrator."
  )
);
ERRORS.addError(
  400,
  new Error(
    "error__preprocess_invalid_yaml",
    "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator."
  )
);
ERRORS.addError(400, new Error("error__feedback_validation"));
ERRORS.addError(
  400,
  new Error(
    "error__wca_suggestion_correlation_failed",
    "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator."
  )
);

ERRORS.addError(
  403,
  new Error(
    "error__wca_invalid_model_id",
    "IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new Error(
    "error__wca_key_not_found",
    "Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new Error(
    "error__wca_model_id_not_found",
    "Could not find a Model Id for IBM watsonx Code Assistant. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_trial_expired",
    "Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__terms_of_use_not_accepted",
    "You have not accepted the Terms of Use. Please accept them before proceeding."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_not_org_administrator",
    "You are not an Administrator of the Organization."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_has_no_subscription",
    "Your organization does not have a subscription. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__org_ready_user_has_no_seat",
    "You do not have a licensed seat for Ansible Lightspeed and your organization is using the paid commercial service. Contact your Red Hat Organization's administrator for more information on how to get a licensed seat."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__org_not_ready_because_wca_not_configured",
    "Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization."
  )
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_with_no_seat",
    "You don't have access to IBM watsonx Code Assistant. Please contact your administrator."
  )
);

ERRORS.addError(
  500,
  new Error(
    "internal_server",
    "An error occurred attempting to complete your request. Please try again later."
  )
);
ERRORS.addError(
  500,
  new Error(
    "error__feedback_internal_server",
    "An error occurred attempting to submit your feedback. Please try again later."
  )
);

ERRORS.addError(
  503,
  new Error(
    "error__attribution_exception",
    "An error occurred attempting to complete your request. Please try again later."
  )
);
ERRORS.addError(
  503,
  new Error(
    "service_unavailable",
    "The IBM watsonx Code Assistant is unavailable. Please try again later."
  )
);
