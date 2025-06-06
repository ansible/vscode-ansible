require("assert");

import { mapError } from "../../../../src/features/lightspeed/handleApiError";
import assert from "assert";
import { integer } from "vscode-languageclient";
import { HTTPError } from "../../../../src/features/lightspeed/utils/errors";

function createError(
  http_code: number,
  data: unknown | string = {},
  err_headers = {},
): HTTPError {
  const headers = {
    ...err_headers,
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const options =
    http_code > 0
      ? {
          status: http_code,
          statusText: "",
          headers: headers,
        }
      : undefined;

  const response = new Response(data as BodyInit, options);

  const error = new HTTPError(response, http_code, data as object);

  return error;
}

describe("testing the error handling", function () {
  function withDetailTest(statusCode: integer, expectedMessage: string) {
    const error = mapError(
      createError(statusCode, { detail: { item: "details" } }),
    );
    assert.equal(error.message, expectedMessage);
    assert.equal(error.detail, "item: details");
  }

  // =================================
  // HTTP 200
  // ---------------------------------
  it("err generic", function () {
    const error = mapError(createError(200));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 400
  // ---------------------------------
  it("err Bad Request from Cloudflare", function () {
    const error = mapError(
      createError(400, { code: "error__wca_cloud_flare_rejection" }),
    );
    assert.equal(
      error.message,
      "Cloudflare rejected the request. Please contact your administrator.",
    );
  });

  it("err Bad Request WCA HAP filter", function () {
    const error = mapError(
      createError(400, { code: "error__wca_hap_filter_rejection" }),
    );
    assert.equal(
      error.message,
      "Potentially harmful language was detected in your request. Please check your input and try again.",
    );
  });

  it("err Bad Request", function () {
    const error = mapError(createError(400));
    assert.equal(error.message, "Bad Request response. Please try again.");
  });

  it("err Preprocessing error", function () {
    const error = mapError(
      createError(400, {
        code: "error__preprocess_invalid_yaml",
      }),
    );
    assert.equal(
      error.message,
      "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator.",
    );
  });

  it("err Preprocessing error with simple detail", function () {
    const error = mapError(
      createError(400, {
        code: "error__preprocess_invalid_yaml",
        detail: "A simple error.",
      }),
    );
    assert.equal(
      error.message,
      "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator.",
    );
    assert.equal(error.detail, "A simple error.");
  });

  it("err Preprocessing error with complex detail", function () {
    const error = mapError(
      createError(400, {
        code: "error__preprocess_invalid_yaml",
        detail: ["error 1", "error 2"],
      }),
    );
    assert.equal(
      error.message,
      "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator.",
    );
    assert.equal(error.detail, "(1) error 1 (2) error 2");
  });

  it("err generic validation error", function () {
    const error = mapError(
      createError(400, {
        detail: {
          field1: "field 1 is invalid",
          field2: "field 2 is also invalid",
        },
      }),
    );
    assert.equal(
      error.detail,
      "field1: field 1 is invalid field2: field 2 is also invalid",
    );
  });

  it("err Feedback validation error", function () {
    const error = mapError(
      createError(400, {
        code: "error__feedback_validation",
        message: "A field was invalid.",
      }),
    );
    assert.equal(error.message, "A field was invalid.");
  });

  it("err WCA inference failure", function () {
    const error = mapError(
      createError(400, {
        code: "error__wca_inference_failure",
        message:
          "IBM watsonx Code Assistant inference failed. Please check your input and try again.",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant inference failed. Please check your input and try again.",
    );
  });

  it("err WCA validation failure", function () {
    const error = mapError(
      createError(400, {
        code: "error__wca_validation_failure",
        detail: { reason: "error 1" },
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant failed to validate the response from the model. Please check your input and try again.",
    );
    assert.equal(error.detail, "reason: error 1");
  });
  // =================================

  // =================================
  // HTTP 401
  // ---------------------------------
  it("err Unauthorized", function () {
    const error = mapError(createError(401));
    assert.equal(
      error.message,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });

  it("err Unauthorized with detail", function () {
    withDetailTest(
      401,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 403
  // ---------------------------------
  it("err Forbidden - No Seat", function () {
    const error = mapError(
      createError(403, {
        code: "permission_denied__user_with_no_seat",
      }),
    );
    assert.equal(
      error.message,
      "You don't have access to IBM watsonx Code Assistant. Please contact your administrator.",
    );
  });

  it("err Forbidden - Trial expired", function () {
    const error = mapError(
      createError(403, {
        code: "permission_denied__user_trial_expired",
      }),
    );
    assert.equal(
      error.message,
      "Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans.",
    );
  });

  it("err Forbidden - WCA not ready", function () {
    const error = mapError(
      createError(403, {
        code: "permission_denied__org_not_ready_because_wca_not_configured",
      }),
    );
    assert.equal(
      error.message,
      "Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization.",
    );
  });

  it("err Forbidden", function () {
    const error = mapError(createError(403));
    assert.equal(
      error.message,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });

  it("err Bad Request from CloudFront", function () {
    const error = mapError(
      createError(
        403,
        "<html><body><p>Blocked by CloudFront.</p></body></html>",
        { server: "CloudFront" },
      ),
    );
    assert.match(
      error.message ?? "",
      /Something in your editor content has caused your inline suggestion request to be blocked.*/,
    );
  });

  it("err Not a Bad Request from CloudFront", function () {
    const error = mapError(
      createError(
        403,
        { data: "something else happened" },
        { server: "CloudFront" },
      ),
    );
    assert.doesNotMatch(
      error.message ?? "",
      /Something in your editor content has caused your inline suggestion request to be blocked.*/,
    );
    assert.equal(
      error.message,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });

  it("err WCA API Key missing", function () {
    const error = mapError(
      createError(403, {
        code: "error__wca_key_not_found",
      }),
    );
    assert.equal(
      error.message,
      "Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator.",
    );
  });

  it("err no default WCA Model Id found", function () {
    const error = mapError(
      createError(403, {
        code: "error__no_default_model_id",
      }),
    );
    assert.equal(
      error.message,
      "Ansible Lightspeed does not have a model configured. Contact your Ansible administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.",
    );
  });

  it("err WCA Model Id missing", function () {
    const error = mapError(
      createError(403, {
        code: "error__wca_model_id_not_found",
      }),
    );
    assert.equal(
      error.message,
      "Your organization does not have an IBM watsonx Code Assistant model configured. Contact your Red Hat organization administrator to configure a model, or specify a model in your Ansible extension settings under Lightspeed: Model Id Override.",
    );
  });

  it("err WCA Model Id is invalid", function () {
    const error = mapError(
      createError(403, {
        code: "error__wca_invalid_model_id",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator.",
    );
  });

  it("err Terms of Use not accepted", function () {
    const error = mapError(
      createError(403, {
        code: "permission_denied__terms_of_use_not_accepted",
      }),
    );
    assert.equal(
      error.message,
      "You have not accepted the Terms of Use. Please accept them before proceeding.",
    );
  });

  it("err User has no subscription", function () {
    const error = mapError(
      createError(403, {
        code: "permission_denied__user_has_no_subscription",
      }),
    );
    assert.equal(
      error.message,
      "Your organization does not have a subscription. Please contact your administrator.",
    );
  });

  it("err Forbidden with detail", function () {
    withDetailTest(
      403,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 404
  // ---------------------------------
  it("err Not found", function () {
    const error = mapError(createError(404));
    assert.equal(
      error.message,
      "The resource could not be found. Please try again later.",
    );
  });

  it("err Feature not available", function () {
    const error = mapError(
      createError(404, {
        code: "feature_not_available",
      }),
    );
    assert.equal(
      error.message,
      "The requested action is not available in your environment.",
    );
  });

  it("err Not found with detail", function () {
    withDetailTest(
      404,
      "The resource could not be found. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 418
  // ---------------------------------
  it("err WCA instance deleted", function () {
    const error = mapError(
      createError(418, {
        code: "error__wca_instance_deleted",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant instance associated with your Model Id has been deleted. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 429
  // ---------------------------------
  it("err Too Many Requests", function () {
    const error = mapError(createError(429));
    assert.equal(
      error.message,
      "Too many requests to Ansible Lightspeed. Please try again later.",
    );
  });

  it("err Too Many Requests with detail", function () {
    withDetailTest(
      429,
      "Too many requests to Ansible Lightspeed. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 500
  // ---------------------------------
  it("err Internal Server Error - Generic", function () {
    const error = mapError(createError(500));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Internal Server Error - Codified", function () {
    const error = mapError(createError(500, { code: "internal_server" }));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Error submitting feedback", function () {
    const error = mapError(
      createError(500, {
        code: "error__feedback_internal_server",
      }),
    );
    assert.equal(
      error.message,
      "An error occurred attempting to submit your feedback. Please try again later.",
    );
  });

  it("err WCA Suggestion Correlation failure", function () {
    const error = mapError(
      createError(500, {
        code: "error__wca_suggestion_correlation_failed",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.",
    );
  });

  it("err WCA X-Request-ID Correlation failure", function () {
    const error = mapError(
      createError(500, {
        code: "error__wca_request_id_correlation_failed",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.",
    );
  });

  it("err Internal Server Error - Generic with detail", function () {
    withDetailTest(
      500,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 503
  // ---------------------------------
  it("err Attribution error", function () {
    const error = mapError(
      createError(503, {
        code: "error__attribution_exception",
      }),
    );
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Service unavailable", function () {
    const error = mapError(
      createError(503, {
        code: "service_unavailable",
      }),
    );
    assert.equal(
      error.message,
      "The IBM watsonx Code Assistant is unavailable. Please try again later.",
    );
  });
  // =================================

  // =================================
  // Miscellaneous
  // ---------------------------------
  it("err Abort", function () {
    const err = new Error("Connection aborted");
    err.name = "AbortError";

    const error = mapError(err);
    assert.equal(
      error.message,
      "Ansible Lightspeed connection timeout. Please try again later.",
    );
  });

  it("err Timeout", function () {
    const err = new Error("Connection timed out");
    err.name = "TimeoutError";

    const error = mapError(err);
    assert.equal(
      error.message,
      "Ansible Lightspeed connection timeout. Please try again later.",
    );
  });

  it("err Canceled", function () {
    const err = new Error("Connection canceled");
    err.name = "CanceledError";

    const error = mapError(err);
    assert.equal(
      error.message,
      "Ansible Lightspeed connection was canceled because of a timeout. Please try again later.",
    );
  });

  it("err Unexpected Client error", function () {
    const error = mapError(createError(0));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Unexpected Err code", function () {
    const error = mapError(createError(599));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });
  // =================================
});
