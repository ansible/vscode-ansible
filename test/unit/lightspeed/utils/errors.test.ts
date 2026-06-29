import { describe, it, expect } from "vitest";
import {
  formatErrorDetail,
  isError,
  HTTPError,
  type IError,
} from "@src/features/lightspeed/utils/errors";

describe("errors - formatErrorDetail", () => {
  it("returns empty string for undefined", () => {
    expect(formatErrorDetail(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(formatErrorDetail(null)).toBe("");
  });

  it("returns the string as-is", () => {
    expect(formatErrorDetail("boom")).toBe("boom");
  });

  it("JSON-stringifies an object", () => {
    expect(formatErrorDetail({ x: 1 })).toBe(JSON.stringify({ x: 1 }));
  });

  it("stringifies a number", () => {
    expect(formatErrorDetail(42)).toBe("42");
  });

  it("stringifies a boolean", () => {
    expect(formatErrorDetail(true)).toBe("true");
  });

  it("stringifies a bigint", () => {
    expect(formatErrorDetail(10n)).toBe("10");
  });

  it("stringifies a symbol", () => {
    const sym = Symbol("s");
    expect(formatErrorDetail(sym)).toBe(sym.toString());
  });

  it("returns the name for a named function", () => {
    function namedFn() {
      /* intentionally empty */
    }
    expect(formatErrorDetail(namedFn)).toBe("namedFn");
  });

  it("returns 'function' for an anonymous function with empty name", () => {
    const anon = (() => {
      const f = function () {
        /* intentionally empty */
      };
      Object.defineProperty(f, "name", { value: "" });
      return f;
    })();
    expect(formatErrorDetail(anon)).toBe("function");
  });
});

describe("errors - HTTPError", () => {
  it("stores response, code and body", () => {
    const resp = {} as Response;
    const body = { x: 1 };
    const err = new HTTPError(resp, 500, body);
    expect(err).toBeInstanceOf(Error);
    expect(err.response).toBe(resp);
    expect(err.code).toBe(500);
    expect(err.body).toBe(body);
  });
});

describe("errors - isError", () => {
  it("returns true when a code is present", () => {
    const e: IError = { code: "ERR" };
    expect(isError(e)).toBe(true);
  });

  it("returns false when no code is present", () => {
    expect(isError({} as IError)).toBe(false);
  });
});
