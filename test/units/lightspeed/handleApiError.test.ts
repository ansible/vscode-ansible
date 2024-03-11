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
  it("err generic", () => {
    const msg = retrieveError(createError(200));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed with status code: 200. Try again after some time."
    );
  });
  it("err Unauthorized", () => {
    const msg = retrieveError(createError(401));
    assert.equal(msg, "User not authorized to access Ansible Lightspeed.");
  });
  it("err Too Many Requests", () => {
    const msg = retrieveError(createError(429));
    assert.equal(
      msg,
      "Too many requests to Ansible Lightspeed. Please try again after some time."
    );
  });
  it("err Bad Request from Cloudflare", () => {
    const msg = retrieveError(
      createError(400, { message: "Some string from Cloudflare." })
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
  it("err Forbidden - WCA Model ID is invalid", () => {
    const msg = retrieveError(
      createError(403, { message: "WCA Model ID is invalid" })
    );
    assert.equal(
      msg,
      `Model ID is invalid. Please contact your administrator.`
    );
  });
  it("err Forbidden - No seat", () => {
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
  it("err Forbidden - No Seat", () => {
    const msg = retrieveError(
      createError(403, {
        code: "permission_denied__user_with_no_seat",
      })
    );
    assert.equal(
      msg,
      "You don't have access to IBM watsonx Code Assistant. Contact your administrator."
    );
  });

  it("err Forbidden", () => {
    const msg = retrieveError(createError(403));
    assert.equal(msg, `User not authorized to access Ansible Lightspeed.`);
  });
  it("err Internal Server Error", () => {
    const msg = retrieveError(createError(500));
    assert.equal(
      msg,
      `Ansible Lightspeed encountered an error. Try again after some time.`
    );
  });
  it("err Unexpected Err code", () => {
    const msg = retrieveError(createError(999));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed with status code: 999. Try again after some time."
    );
  });
  it("err Timeout", () => {
    const err = createError(0);
    err.code = AxiosError.ECONNABORTED;
    const msg = retrieveError(err);
    assert.equal(
      msg,
      "Ansible Lightspeed connection timeout. Try again after some time."
    );
  });

  it("err Unexpected Client error", () => {
    const msg = retrieveError(createError(0));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed. Try again after some time."
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
});
