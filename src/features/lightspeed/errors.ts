import { AxiosError } from "axios";
import { IError } from "./utils/errors";

class Error implements IError {
  readonly code: string;
  readonly message?: string;
  readonly detail?: unknown;
  readonly check: (err: AxiosError) => boolean;

  private getCode(err: AxiosError): string {
    const responseErrorData = <AxiosError<{ code?: string; message?: string }>>(
      err?.response?.data
    );
    const code: string = Object.prototype.hasOwnProperty.call(
      responseErrorData,
      "code",
    )
      ? (responseErrorData.code as string)
      : "unknown";
    return code;
  }

  public constructor(
    code: string,
    message?: string,
    detail?: unknown,
    check?: (err: AxiosError) => boolean,
  ) {
    this.code = code;
    this.message = message;
    this.detail = detail;
    if (check) {
      this.check = check;
    } else {
      this.check = (err: AxiosError) => {
        return this.code === this.getCode(err);
      };
    }
  }

  public withDetail(detail?: unknown): Error {
    // Clone the Error to preserve the original definition
    return new Error(this.code, this.message, detail, this.check);
  }
}

class Errors {
  private errors: Map<number, Array<Error>> = new Map();

  public addError(statusCode: number, error: Error) {
    if (!this.errors.has(statusCode)) {
      this.errors.set(statusCode, []);
    }
    this.errors.get(statusCode)?.push(error);
  }

  public getError(err: AxiosError): Error | undefined {
    if (err && !("response" in err)) {
      return undefined;
    }

    const statusCode: number = err.response?.status ?? 500;
    const errors: Array<Error> | undefined = this.errors.get(statusCode);
    if (!errors) {
      return undefined;
    }
    const e: Error | undefined = errors.find(function (el: Error) {
      return el.check(err);
    });

    if (e) {
      const responseErrorData = <
        AxiosError<{ code?: string; message?: unknown }>
      >err?.response?.data;

      // If the Error does not have a default message use the payload message
      let message = e.message;
      if (message === undefined) {
        message = Object.prototype.hasOwnProperty.call(
          responseErrorData,
          "message",
        )
          ? responseErrorData.message
          : "unknown";
      }

      let detail: string = "";
      if (typeof responseErrorData.message == "string") {
        detail = responseErrorData.message ?? "";
      } else if (Array.isArray(responseErrorData.message)) {
        const messages = responseErrorData.message as [];
        messages.forEach((value: string, index: number) => {
          detail =
            detail +
            "(" +
            (index + 1) +
            ") " +
            value +
            (index < messages.length - 1 ? " " : "");
        });
      }

      // Clone the Error to preserve the original definition
      return new Error(e.code, message, detail, e.check);
    }

    return undefined;
  }
}

export const ERRORS = new Errors();

export const ERRORS_UNAUTHORIZED = new Error(
  "fallback__unauthorized",
  "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
);
export const ERRORS_NOT_FOUND = new Error(
  "fallback__not_found",
  "The resource could not be found. Please try again later.",
);
export const ERRORS_TOO_MANY_REQUESTS = new Error(
  "fallback__too_many_requests",
  "Too many requests to Ansible Lightspeed. Please try again later.",
);
export const ERRORS_BAD_REQUEST = new Error(
  "fallback__bad_request",
  "Bad Request response. Please try again.",
);
export const ERRORS_UNKNOWN = new Error(
  "fallback__unknown",
  "An error occurred attempting to complete your request. Please try again later.",
);
export const ERRORS_CONNECTION_TIMEOUT = new Error(
  "fallback__connection_timeout",
  "Ansible Lightspeed connection timeout. Please try again later.",
);
export const ERRORS_CONNECTION_CANCELED_TIMEOUT = new Error(
  "",
  "Ansible Lightspeed connection was canceled because of a timeout. Please try again later.",
);

ERRORS.addError(
  400,
  new Error(
    "error__wca_cloud_flare_rejection",
    "Cloudflare rejected the request. Please contact your administrator.",
  ),
);
ERRORS.addError(
  400,
  new Error(
    "error__wca_hap_filter_rejection",
    "Potentially harmful language was detected in your request. Please check your input and try again.",
  ),
);
ERRORS.addError(
  400,
  new Error(
    "error__preprocess_invalid_yaml",
    "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator.",
  ),
);
ERRORS.addError(400, new Error("error__feedback_validation"));

ERRORS.addError(
  403,
  new Error(
    "error__wca_invalid_model_id",
    "IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "error__wca_key_not_found",
    "Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "error__no_default_model_id",
    "Ansible Lightspeed does not have a model configured. Contact your Ansible administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "error__wca_model_id_not_found",
    "Your organization does not have an IBM watsonx Code Assistant model configured. Contact your Red Hat organization administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_trial_expired",
    "Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__terms_of_use_not_accepted",
    "You have not accepted the Terms of Use. Please accept them before proceeding.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_not_org_administrator",
    "You are not an Administrator of the Organization.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_has_no_subscription",
    "Your organization does not have a subscription. Please contact your administrator.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__org_not_ready_because_wca_not_configured",
    "Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__user_with_no_seat",
    "You don't have access to IBM watsonx Code Assistant. Please contact your administrator.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__can_apply_for_trial",
    "Access denied but user can apply for a trial period.",
  ),
);
ERRORS.addError(
  403,
  new Error(
    "permission_denied__cloudfront",
    "Something in your editor content has caused your inline suggestion request to be blocked. \n" +
      "Please open a ticket with Red Hat support and include the content of your editor up to the \n" +
      "line and column where you requested a suggestion.",
    undefined,
    (err: AxiosError) => {
      const body: unknown = err?.response?.data;
      let bodyContainsCloudFront: boolean = false;
      let bodyContainsCloudFrontBlocked: boolean = false;
      const headerContainsCloudFrontServer: boolean =
        (err?.response?.headers["server"] || "").toLowerCase() === "cloudfront";
      if (typeof body === "string") {
        bodyContainsCloudFront =
          (body.toLowerCase().match("cloudfront")?.length || 0) > 0;
        bodyContainsCloudFrontBlocked =
          (body.toLowerCase().match("blocked")?.length || 0) > 0;
      }
      return (
        bodyContainsCloudFront &&
        bodyContainsCloudFrontBlocked &&
        headerContainsCloudFrontServer
      );
    },
  ),
);

ERRORS.addError(
  404,
  new Error(
    "feature_not_available",
    "The requested action is not available in your environment.",
  ),
);

ERRORS.addError(
  418,
  new Error(
    "error__wca_instance_deleted",
    "IBM watsonx Code Assistant instance associated with your Model Id has been deleted. Please contact your administrator.",
  ),
);

ERRORS.addError(
  500,
  new Error(
    "internal_server",
    "An error occurred attempting to complete your request. Please try again later.",
  ),
);
ERRORS.addError(
  500,
  new Error(
    "error__feedback_internal_server",
    "An error occurred attempting to submit your feedback. Please try again later.",
  ),
);
// error__wca_suggestion_correlation_failed is deprecated but
// kept for backwards compatibility between new versions of the VSCode
// extension and older ansible-ai-connect-service instances.
ERRORS.addError(
  500,
  new Error(
    "error__wca_suggestion_correlation_failed",
    "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.",
  ),
);
ERRORS.addError(
  500,
  new Error(
    "error__wca_request_id_correlation_failed",
    "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.",
  ),
);

ERRORS.addError(
  503,
  new Error(
    "error__attribution_exception",
    "An error occurred attempting to complete your request. Please try again later.",
  ),
);
ERRORS.addError(
  503,
  new Error(
    "service_unavailable",
    "The IBM watsonx Code Assistant is unavailable. Please try again later.",
  ),
);
