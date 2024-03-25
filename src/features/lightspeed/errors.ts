class ErrorHolder {
  code: string;
  message?: string;

  public constructor(code: string, message?: string) {
    this.code = code;
    this.message = message;
  }
}

class Errors {
  private errors: Map<number, Array<ErrorHolder>> = new Map();

  public addError(statusCode: number, error: ErrorHolder) {
    if (!this.errors.has(statusCode)) {
      this.errors.set(statusCode, []);
    }
    this.errors.get(statusCode)?.push(error);
  }

  public getError(statusCode: number, code: string): ErrorHolder | undefined {
    if (!this.errors.has(statusCode)) {
      return undefined;
    }
    const errors: Array<ErrorHolder> | undefined = this.errors.get(statusCode);
    if (!errors) {
      return undefined;
    }
    const e: ErrorHolder | undefined = errors.find(function (el: ErrorHolder) {
      return el.code === code;
    });
    if (e) {
      return e;
    }
    return undefined;
  }
}

export const ERRORS = new Errors();

export const ERRORS_UNAUTHORIZED = new ErrorHolder(
  "fallback__unauthorized",
  "User not authorized to access Ansible Lightspeed. Please contact your administrator."
);
export const ERRORS_TOO_MANY_REQUESTS = new ErrorHolder(
  "fallback__too_many_requests",
  "Too many requests to Ansible Lightspeed. Please try again later."
);
export const ERRORS_BAD_REQUEST = new ErrorHolder(
  "fallback__bad_request",
  "Bad Request response. Please try again."
);
export const ERRORS_UNKNOWN = new ErrorHolder(
  "fallback__unknown",
  "An error occurred attempting to complete your request. Please try again later."
);
export const ERRORS_CONNECTION_TIMEOUT = new ErrorHolder(
  "fallback__connection_timeout",
  "Ansible Lightspeed connection timeout. Please try again later."
);

ERRORS.addError(
  204,
  new ErrorHolder(
    "postprocess_error",
    "An error occurred post-processing the inline suggestion. Please contact your administrator."
  )
);
ERRORS.addError(
  204,
  new ErrorHolder(
    "model_timeout",
    "Ansible Lightspeed timed out processing your request. Please try again later."
  )
);
ERRORS.addError(
  204,
  new ErrorHolder(
    "error__wca_bad_request",
    "IBM watsonx Code Assistant returned a bad request response. Please contact your administrator."
  )
);
ERRORS.addError(
  204,
  new ErrorHolder(
    "error__wca_empty_response",
    "IBM watsonx Code Assistant returned an empty response. Please contact your administrator."
  )
);

ERRORS.addError(
  400,
  new ErrorHolder(
    "error__wca_cloud_flare_rejection",
    "Cloudflare rejected the request. Please contact your administrator."
  )
);
ERRORS.addError(
  400,
  new ErrorHolder(
    "error__preprocess_invalid_yaml",
    "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator."
  )
);
ERRORS.addError(400, new ErrorHolder("error__feedback_validation"));
ERRORS.addError(
  400,
  new ErrorHolder(
    "error__wca_suggestion_correlation_failed",
    "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator."
  )
);

ERRORS.addError(
  403,
  new ErrorHolder(
    "error__wca_invalid_model_id",
    "IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "error__wca_key_not_found",
    "Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "error__wca_model_id_not_found",
    "Could not find a Model Id for IBM watsonx Code Assistant. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__user_trial_expired",
    "Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__terms_of_use_not_accepted",
    "The Terms of Use have not been accepted. Please accept the terms before proceeding."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__user_not_org_administrator",
    "The User is not an Administrator of the Organization."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__user_has_no_subscription",
    "The User does not have a subscription. Please contact your administrator."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__org_ready_user_has_no_seat",
    "You do not have a licensed seat for Ansible Lightspeed and your organization is using the paid commercial service. Contact your Red Hat Organization's administrator for more information on how to get a licensed seat."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__org_not_ready_because_wca_not_configured",
    "Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization."
  )
);
ERRORS.addError(
  403,
  new ErrorHolder(
    "permission_denied__user_with_no_seat",
    "You don't have access to IBM watsonx Code Assistant. Please contact your administrator."
  )
);

ERRORS.addError(
  500,
  new ErrorHolder(
    "internal_server",
    "An error occurred attempting to complete your request. Please try again later."
  )
);
ERRORS.addError(
  500,
  new ErrorHolder(
    "error__feedback_internal_server",
    "An error occurred attempting to submit your feedback. Please try again later."
  )
);

ERRORS.addError(
  503,
  new ErrorHolder(
    "error__attribution_exception",
    "An error occurred attempting to complete your request. Please try again later."
  )
);
ERRORS.addError(
  503,
  new ErrorHolder(
    "service_unavailable",
    "The IBM watsonx Code Assistant is unavailable. Please try again later."
  )
);
