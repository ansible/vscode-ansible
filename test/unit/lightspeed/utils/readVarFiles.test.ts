import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as yaml from "yaml";
import { readVarFiles } from "@src/features/lightspeed/utils/readVarFiles";

vi.mock("fs");

vi.mock("yaml", async (importOriginal) => {
  const actual = await importOriginal<typeof import("yaml")>();
  return {
    ...actual,
    default: actual,
    parse: vi.fn(actual.parse),
    stringify: vi.fn(actual.stringify),
  };
});

describe("readVarFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined and does not read when the file is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = readVarFiles("/missing.yml");

    expect(result).toBeUndefined();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("parses and re-stringifies the file contents when it exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("key: value\n");

    const result = readVarFiles("/vars.yml");

    // Assert the contract explicitly rather than recomputing the same
    // parse/stringify pipeline (which would still pass if the impl dropped
    // keepSourceTokens or skipped stringify).
    expect(result).toBe("key: value\n");
    expect(yaml.parse).toHaveBeenCalledWith("key: value\n", {
      keepSourceTokens: true,
    });
    expect(yaml.stringify).toHaveBeenCalled();
  });

  it("returns undefined and logs an Error message when readFileSync throws an Error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("disk failure");
    });

    const result = readVarFiles("/vars.yml");

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("disk failure"),
    );
    errorSpy.mockRestore();
  });

  it("returns undefined for a non-Error throw (String(err) branch)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("contents");
    vi.mocked(yaml.parse).mockImplementationOnce(() => {
      // throw a non-Error value to hit the String(err) branch
      throw "string failure";
    });

    const result = readVarFiles("/vars.yml");

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("string failure"),
    );
    errorSpy.mockRestore();
  });
});
