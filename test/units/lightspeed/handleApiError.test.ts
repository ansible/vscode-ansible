require("assert");

import { AxiosError, AxiosHeaders } from "axios";
import { retrieveError } from "../../../src/features/lightspeed/handleApiError";
import assert from "assert";

function createError(
  http_code: number,
  data = {},
  err_headers = {}
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
    const msg = retrieveError(createError(200));
    assert.equal(
      msg,
      "An error occurred attempting to complete your request. Please try again later."
    );
  });
  // =================================

  // =================================
  // HTTP 204
  // ---------------------------------
  it("err Postprocessing error", () => {
    const msg = retrieveError(
      createError(204, {
        code: "postprocess_error",
      })
    );
    assert.equal(
      msg,
      "An error occurred post-processing the inline suggestion. Please contact your administrator."
    );
  });

  it("err Model timeout", () => {
    const msg = retrieveError(
      createError(204, {
        code: "model_timeout",
      })
    );
    assert.equal(
      msg,
      "Ansible Lightspeed timed out processing your request. Please try again later."
    );
  });

  it("err WCA Bad Request", () => {
    const msg = retrieveError(
      createError(204, {
        code: "error__wca_bad_request",
      })
    );
    assert.equal(
      msg,
      "IBM watsonx Code Assistant returned a bad request response. Please contact your administrator."
    );
  });

  it("err WCA Empty Response", () => {
    const msg = retrieveError(
      createError(204, {
        code: "error__wca_empty_response",
      })
    );
    assert.equal(
      msg,
      "IBM watsonx Code Assistant returned an empty response. Please contact your administrator."
    );
  });
  // =================================

  // =================================
  // HTTP 400
  // ---------------------------------
  it("err Bad Request from Cloudflare", () => {
    const msg = retrieveError(
      createError(400, { code: "error__wca_cloud_flare_rejection" })
    );
    assert.equal(
      msg,
      "Cloudflare rejected the request. Please contact your administrator."
    );
  });

  it("err Bad Request", () => {
    const msg = retrieveError(createError(400));
    assert.equal(msg, "Bad Request response. Please try again.");
  });

  it("err Postprocessing error", () => {
    const msg = retrieveError(
      createError(400, {
        code: "error__preprocess_invalid_yaml",
      })
    );
    assert.equal(
      msg,
      "An error occurred pre-processing the inline suggestion due to invalid YAML. Please contact your administrator."
    );
  });

  it("err Feedback validation error", () => {
    const msg = retrieveError(
      createError(400, {
        code: "error__feedback_validation",
        message: "A field was invalid.",
      })
    );
    assert.equal(msg, "A field was invalid.");
  });

  it("err WCA Suggestion Correlation failure", () => {
    const msg = retrieveError(
      createError(400, {
        code: "error__wca_suggestion_correlation_failed",
      })
    );
    assert.equal(
      msg,
      "IBM watsonx Code Assistant request/response correlation failed. Please contact your administrator."
    );
  });
  // =================================

  // =================================
  // HTTP 401
  // ---------------------------------
  it("err Unauthorized", () => {
    const msg = retrieveError(createError(401));
    assert.equal(
      msg,
      "User not authorized to access Ansible Lightspeed. Please contact your administrator."
    );
  });
  // =================================

  // =================================
  // HTTP 403
  // ---------------------------------
  it("err Forbidden - Org ready, No seat", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__org_ready_user_has_no_seat",
      })
    );
    assert.equal(
      msg,
      `You do not have a licensed seat for Ansible Lightspeed and your organization is using the paid commercial service. Contact your Red Hat Organization's administrator for more information on how to get a licensed seat.`
    );
  });

  it("err Forbidden - No Seat", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__user_with_no_seat",
      })
    );
    assert.equal(
      msg,
      "You don't have access to IBM watsonx Code Assistant. Please contact your administrator."
    );
  });

  it("err Forbidden - Trial expired", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__user_trial_expired",
      })
    );
    assert.equal(
      msg,
      `Your trial to the generative AI model has expired. Refer to your IBM Cloud Account to re-enable access to the IBM watsonx Code Assistant by moving to one of the paid plans.`
    );
  });

  it("err Forbidden - WCA not ready", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__org_not_ready_because_wca_not_configured",
      })
    );
    assert.equal(
      msg,
      `Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization.`
    );
  });

  it("err Forbidden", () => {
    const msg = retrieveError(createError(403));
    assert.equal(
      msg,
      `User not authorized to access Ansible Lightspeed. Please contact your administrator.`
    );
  });

  it("err Bad Request from CloudFront", () => {
    const msg = retrieveError(
      createError(
        403,
        { data: "Some string from CloudFront." },
        { server: "CloudFront" }
      )
    );
    assert.match(
      msg,
      /Something in your editor content has caused your inline suggestion request to be blocked.*/
    );
  });

  it("err WCA API Key missing", () => {
    const msg = retrieveError(
      createError(403, {
        code: "error__wca_key_not_found",
      })
    );
    assert.equal(
      msg,
      "Could not find an API Key for IBM watsonx Code Assistant. Please contact your administrator."
    );
  });

  it("err WCA Model Id missing", () => {
    const msg = retrieveError(
      createError(403, {
        code: "error__wca_model_id_not_found",
      })
    );
    assert.equal(
      msg,
      "Could not find a Model Id for IBM watsonx Code Assistant. Please contact your administrator."
    );
  });

  it("err WCA Model Id is invalid", () => {
    const msg = retrieveError(
      createError(403, {
        code: "error__wca_invalid_model_id",
      })
    );
    assert.equal(
      msg,
      "IBM watsonx Code Assistant Model ID is invalid. Please contact your administrator."
    );
  });

  it("err Terms of Use not accepted", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__terms_of_use_not_accepted",
      })
    );
    assert.equal(
      msg,
      "The Terms of Use have not been accepted. Please accept the terms before proceeding."
    );
  });

  it("err User has no subscription", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__user_has_no_subscription",
      })
    );
    assert.equal(
      msg,
      "The User does not have a subscription. Please contact your administrator."
    );
  });
  // =================================

  // =================================
  // HTTP 429
  // ---------------------------------
  it("err Too Many Requests", () => {
    const msg = retrieveError(createError(429));
    assert.equal(
      msg,
      "Too many requests to Ansible Lightspeed. Please try again later."
    );
  });
  // =================================

  // =================================
  // HTTP 500
  // ---------------------------------
  it("err Internal Server Error - Generic", () => {
    const msg = retrieveError(createError(500));
    assert.equal(
      msg,
      `An error occurred attempting to complete your request. Please try again later.`
    );
  });

  it("err Internal Server Error - Codified", () => {
    const msg = retrieveError(createError(500, { code: "internal_server" }));
    assert.equal(
      msg,
      `An error occurred attempting to complete your request. Please try again later.`
    );
  });

  it("err Error submitting feedback", () => {
    const msg = retrieveError(
      createError(500, {
        code: "error__feedback_internal_server",
      })
    );
    assert.equal(
      msg,
      "An error occurred attempting to submit your feedback. Please try again later."
    );
  });
  // =================================

  // =================================
  // HTTP 503
  // ---------------------------------
  it("err Attribution error", () => {
    const msg = retrieveError(
      createError(503, {
        code: "error__attribution_exception",
      })
    );
    assert.equal(
      msg,
      "An error occurred attempting to complete your request. Please try again later."
    );
  });

  it("err Service unavailable", () => {
    const msg = retrieveError(
      createError(503, {
        code: "service_unavailable",
      })
    );
    assert.equal(
      msg,
      "The IBM watsonx Code Assistant is unavailable. Please try again later."
    );
  });
  // =================================

  // =================================
  // Miscellaneous
  // ---------------------------------
  it("err Timeout", () => {
    const err = createError(0);
    err.code = AxiosError.ECONNABORTED;
    const msg = retrieveError(err);
    assert.equal(
      msg,
      "Ansible Lightspeed connection timeout. Please try again later."
    );
  });

  it("err Unexpected Client error", () => {
    const msg = retrieveError(createError(0));
    assert.equal(
      msg,
      "An error occurred attempting to complete your request. Please try again later."
    );
  });

  it("err Unexpected Err code", () => {
    const msg = retrieveError(createError(999));
    assert.equal(
      msg,
      "An error occurred attempting to complete your request. Please try again later."
    );
  });
  // =================================
});
