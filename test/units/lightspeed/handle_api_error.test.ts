require("assert");

import { AxiosError, AxiosHeaders } from "axios";
import { retrieve_error } from "../../../src/features/lightspeed/handle_api_error";
import assert from "assert";

function create_error(http_code: number, data = {}): AxiosError {
  const request = { path: "/wisdom" };
  const headers = new AxiosHeaders({
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
    const msg = retrieve_error(create_error(200));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed with status code: 200. Try again after some time."
    );
  });
  it("err Unauthorized", () => {
    const msg = retrieve_error(create_error(401));
    assert.equal(msg, "User not authorized to access Ansible Lightspeed.");
  });
  it("err Too Many Requests", () => {
    const msg = retrieve_error(create_error(429));
    assert.equal(
      msg,
      "Too many requests to Ansible Lightspeed. Please try again after some time."
    );
  });
  it("err Bad Request from Cloudflare", () => {
    const msg = retrieve_error(
      create_error(400, { message: "Some string from Cloudflare." })
    );
    assert.equal(
      msg,
      "Cloudflare rejected the request. Please contact your administrator."
    );
  });
  it("err Bad Request", () => {
    const msg = retrieve_error(create_error(400));
    assert.equal(msg, "Bad Request response. Please try again.");
  });
  it("err Forbidden - WCA Model ID is invalid", () => {
    const msg = retrieve_error(
      create_error(403, { message: "WCA Model ID is invalid" })
    );
    assert.equal(
      msg,
      `Model ID is invalid. Please contact your administrator.`
    );
  });
  it("err Forbidden - No seat", () => {
    const msg = retrieve_error(
      create_error(403, {
        code: "permission_denied__org_ready_user_has_no_seat",
      })
    );
    assert.equal(
      msg,
      `You do not have a licensed seat for Ansible Lightspeed and your organization is using the paid commercial service. Contact your Red Hat Organization's administrator for more information on how to get a licensed seat.`
    );
  });
  it("err Forbidden - WCA not ready", () => {
    const msg = retrieve_error(
      create_error(403, {
        code: "permission_denied__org_not_ready_because_wca_not_configured",
      })
    );
    assert.equal(
      msg,
      `Contact your administrator to configure IBM watsonx Code Assistant model settings for your organization.`
    );
  });
  it("err Forbidden", () => {
    const msg = retrieve_error(create_error(403));
    assert.equal(msg, `User not authorized to access Ansible Lightspeed.`);
  });
  it("err Internal Server Error", () => {
    const msg = retrieve_error(create_error(500));
    assert.equal(
      msg,
      `Ansible Lightspeed encountered an error. Try again after some time.`
    );
  });
  it("err Unexpected Err code", () => {
    const msg = retrieve_error(create_error(999));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed with status code: 999. Try again after some time."
    );
  });
  it("err Timeout", () => {
    const err = create_error(0);
    err.code = AxiosError.ECONNABORTED;
    const msg = retrieve_error(err);
    assert.equal(
      msg,
      "Ansible Lightspeed connection timeout. Try again after some time."
    );
  });

  it("err Unexpected Client error", () => {
    const msg = retrieve_error(create_error(0));
    assert.equal(
      msg,
      "Failed to fetch inline suggestion from Ansible Lightspeed. Try again after some time."
    );
  });
});
