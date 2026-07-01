import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as yaml from "yaml";
import type * as vscode from "vscode";
import {
  getObjectKeys,
  isDocumentInRole,
  isPlaybook,
} from "@src/features/lightspeed/utils/explanationUtils";

vi.mock("fs/promises");

vi.mock("yaml", async (importOriginal) => {
  const actual = await importOriginal<typeof import("yaml")>();
  return {
    ...actual,
    default: actual,
    parse: vi.fn(actual.parse),
  };
});

const fakeDoc = (fileName: string) =>
  ({ fileName }) as unknown as vscode.TextDocument;

describe("explanationUtils - getObjectKeys", () => {
  it("returns [] for a non-array YAML document", () => {
    expect(getObjectKeys("key: value")).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(getObjectKeys("[]")).toEqual([]);
  });

  it("returns the keys of the last element when it is an object", () => {
    expect(getObjectKeys("- a: 1\n- b: 2\n  c: 3")).toEqual(["b", "c"]);
  });

  it("returns [] when the last element is not an object", () => {
    expect(getObjectKeys("- foo\n- bar")).toEqual([]);
  });

  it("returns [] on a parse error", () => {
    vi.mocked(yaml.parse).mockImplementationOnce(() => {
      throw new Error("parse failure");
    });
    expect(getObjectKeys("- a: 1")).toEqual([]);
  });
});

describe("explanationUtils - isDocumentInRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the role dir contains recognized subdirs", async () => {
    vi.mocked(fs.readdir).mockResolvedValue(["tasks"] as never);
    const result = await isDocumentInRole(
      fakeDoc("/a/roles/myrole/tasks/main.yml"),
    );
    expect(result).toBe(true);
    expect(fs.readdir).toHaveBeenCalledWith("/a/roles/myrole");
  });

  it("returns false when the role dir has no recognized subdirs", async () => {
    vi.mocked(fs.readdir).mockResolvedValue(["random"] as never);
    const result = await isDocumentInRole(
      fakeDoc("/a/roles/myrole/something.yml"),
    );
    expect(result).toBe(false);
  });

  it("returns false and does not read when there is no roles segment", async () => {
    const result = await isDocumentInRole(fakeDoc("/a/b/c.yml"));
    expect(result).toBe(false);
    expect(fs.readdir).not.toHaveBeenCalled();
  });

  it("returns false when 'roles' is the trailing segment", async () => {
    const result = await isDocumentInRole(fakeDoc("/a/roles"));
    expect(result).toBe(false);
    expect(fs.readdir).not.toHaveBeenCalled();
  });
});

describe("explanationUtils - isPlaybook", () => {
  it("returns true when content has a hosts key", () => {
    expect(isPlaybook("- hosts: all")).toBe(true);
  });

  it("returns false when content has no hosts key", () => {
    expect(isPlaybook("- name: do a thing")).toBe(false);
  });
});
