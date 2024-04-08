require("assert");

import { AxiosError, AxiosHeaders } from "axios";
import { mapError } from "../../../src/features/lightspeed/handleApiError";
import assert from "assert";

function createError(
  http_code: number,
  data: unknown | string = {},
  err_headers = {},
): AxiosError {
  const request = { path: "/wisdom" };
  const headers = new AxiosHeaders({
    ...err_headers,
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });
  const config = {
    url: "http://localhost:8000",
    headers,
  };
  const code = "SOME_ERR";

  const error = new AxiosError("nothing", code, config, request);
  if (http_code > 0) {
    const response = {
      data: data,
      status: http_code,
      statusText: "",
      config: config,
      headers: headers,
    };
    error.response = response;
  }

  return error;
}

describe("testing the error handling", () => {
  // =================================
  // HTTP 200
  // ---------------------------------
  it("err generic", () => {
    const error = mapError(createError(200));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 204
  // ---------------------------------
  it("err Postprocessing error", () => {
    const error = mapError(
      createError(204, {
        code: "postprocess_error",
      }),
    );
    assert.equal(
      error.message,
      "An error occurred post-processing the inline suggestion. Please contact your administrator.",
    );
  });

  it("err Model timeout", () => {
    const error = mapError(
      createError(204, {
        code: "model_timeout",
      }),
    );
    assert.equal(
      error.message,
      "Ansible Lightspeed timed out processing your request. Please try again later.",
    );
  });

  it("err WCA Bad Request", () => {
    const error = mapError(
      createError(204, {
        code: "error__wca_bad_request",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant returned a bad request response. Please contact your administrator.",
    );
  });

  it("err WCA Empty Response", () => {
    const error = mapError(
      createError(204, {
        code: "error__wca_empty_response",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant returned an empty response. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 400
  // ---------------------------------
  it("err Bad Request from Cloudflare", () => {
    const error = mapError(
      createError(400, { code: "error__wca_cloud_flare_rejection" }),
    );
    assert.equal(
      error.message,
      "Cloudflare rejected the request. Please contact your administrator.",
    );
  });

  it("err Bad Request", () => {
    const error = mapError(createError(400));
    assert.equal(error.message, "Bad Request response. Please try again.");
  });

  it("err Postprocessing error", () => {
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

  it("err Feedback validation error", () => {
    const error = mapError(
      createError(400, {
        code: "error__feedback_validation",
        message: "A field was invalid.",
      }),
    );
    assert.equal(error.message, "A field was invalid.");
  });

  it("err WCA Suggestion Correlation failure", () => {
    const error = mapError(
      createError(400, {
        code: "error__wca_suggestion_correlation_failed",
      }),
    );
    assert.equal(
      error.message,
      "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 401
  // ---------------------------------
  it("err Unauthorized", () => {
    const error = mapError(createError(401));
    assert.equal(
      error.message,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });
  // =================================

  // =================================
  // HTTP 403
  // ---------------------------------
  it("err Forbidden - Org ready, No seat", () => {
    const error = mapError(
      createError(403, {
        code: "permission_denied__org_ready_user_has_no_seat",
      }),
    );
    assert.equal(
      error.message,
      "You do not have a licensed seat for Ansible Lightspeed and your organization is using the paid commercial service. Contact your Red Hat Organization's administrator for more information on how to get a licensed seat.",
    );
  });

  it("err Forbidden - No Seat", () => {
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

  it("err Forbidden - Trial expired", () => {
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

  it("err Forbidden - WCA not ready", () => {
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

  it("err Forbidden", () => {
    const error = mapError(createError(403));
    assert.equal(
      error.message,
      "You are not authorized to access Ansible Lightspeed. Please contact your administrator.",
    );
  });

  it("err Bad Request from CloudFront", () => {
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

  it("err Not a Bad Request from CloudFront", () => {
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

  it("err WCA API Key missing", () => {
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

  it("err WCA Model Id missing", () => {
    const error = mapError(
      createError(403, {
        code: "error__wca_model_id_not_found",
      }),
    );
    assert.equal(
      error.message,
      "Could not find a Model Id for IBM watsonx Code Assistant. Please contact your administrator.",
    );
  });

  it("err WCA Model Id is invalid", () => {
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

  it("err Terms of Use not accepted", () => {
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

  it("err User has no subscription", () => {
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
  // =================================

  // =================================
  // HTTP 404
  // ---------------------------------
  it("err Not found", () => {
    const error = mapError(createError(404));
    assert.equal(
      error.message,
      "The resource could not be found. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 429
  // ---------------------------------
  it("err Too Many Requests", () => {
    const error = mapError(createError(429));
    assert.equal(
      error.message,
      "Too many requests to Ansible Lightspeed. Please try again later.",
    );
  });
  // =================================

  // =================================
  // HTTP 500
  // ---------------------------------
  it("err Internal Server Error - Generic", () => {
    const error = mapError(createError(500));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Internal Server Error - Codified", () => {
    const error = mapError(createError(500, { code: "internal_server" }));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Error submitting feedback", () => {
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
  // =================================

  // =================================
  // HTTP 503
  // ---------------------------------
  it("err Attribution error", () => {
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

  it("err Service unavailable", () => {
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
  it("err Timeout", () => {
    const err = createError(0);
    err.code = AxiosError.ECONNABORTED;
    const error = mapError(err);
    assert.equal(
      error.message,
      "Ansible Lightspeed connection timeout. Please try again later.",
    );
  });

  it("err Unexpected Client error", () => {
    const error = mapError(createError(0));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });

  it("err Unexpected Err code", () => {
    const error = mapError(createError(999));
    assert.equal(
      error.message,
      "An error occurred attempting to complete your request. Please try again later.",
    );
  });
  // =================================
});
