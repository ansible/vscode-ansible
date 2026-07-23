import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs, {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePathWithinWorkspace,
  PathTraversalError,
} from "@src/utils/pathValidation.js";

describe("validatePathWithinWorkspace", () => {
  let workspaceRoot: string;
  let realWorkspaceRoot: string;
  let outsideDir: string;

  beforeAll(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "ws-test-"));
    realWorkspaceRoot = realpathSync(workspaceRoot);
    outsideDir = mkdtempSync(join(tmpdir(), "outside-test-"));

    mkdirSync(join(workspaceRoot, "subdir"), { recursive: true });
    writeFileSync(join(workspaceRoot, "file.yml"), "test");
    writeFileSync(join(outsideDir, "secret.txt"), "secret");
  });

  afterAll(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("should accept a path within the workspace", () => {
    const result = validatePathWithinWorkspace("subdir", workspaceRoot);
    expect(result).toBe(join(realWorkspaceRoot, "subdir"));
  });

  it("should accept the workspace root itself", () => {
    const result = validatePathWithinWorkspace(workspaceRoot, workspaceRoot);
    expect(result).toBe(realWorkspaceRoot);
  });

  it("should accept an absolute path within the workspace", () => {
    const absPath = join(workspaceRoot, "subdir");
    const result = validatePathWithinWorkspace(absPath, workspaceRoot);
    expect(result).toBe(join(realWorkspaceRoot, "subdir"));
  });

  it("should accept a non-existent path within the workspace", () => {
    const result = validatePathWithinWorkspace("new-dir/nested", workspaceRoot);
    expect(result).toBe(join(realWorkspaceRoot, "new-dir", "nested"));
  });

  it("should reject relative path traversal with ../", () => {
    expect(() =>
      validatePathWithinWorkspace("../../../etc/cron.d", workspaceRoot),
    ).toThrow(PathTraversalError);
  });

  it("should reject traversal via subdir/../../..", () => {
    expect(() =>
      validatePathWithinWorkspace("subdir/../../../etc", workspaceRoot),
    ).toThrow(PathTraversalError);
  });

  it("should reject absolute path outside workspace", () => {
    expect(() =>
      validatePathWithinWorkspace("/etc/cron.d", workspaceRoot),
    ).toThrow(PathTraversalError);
  });

  it("should reject absolute path to another tmp directory", () => {
    expect(() =>
      validatePathWithinWorkspace(outsideDir, workspaceRoot),
    ).toThrow(PathTraversalError);
  });

  it("should reject symlink that points outside workspace", () => {
    const symlinkPath = join(workspaceRoot, "evil-link");
    try {
      symlinkSync(outsideDir, symlinkPath);
      expect(() =>
        validatePathWithinWorkspace("evil-link", workspaceRoot),
      ).toThrow(PathTraversalError);
    } finally {
      rmSync(symlinkPath, { force: true });
    }
  });

  it("should reject empty path", () => {
    expect(() => validatePathWithinWorkspace("", workspaceRoot)).toThrow(
      PathTraversalError,
    );
  });

  it("should reject whitespace-only path", () => {
    expect(() => validatePathWithinWorkspace("   ", workspaceRoot)).toThrow(
      PathTraversalError,
    );
  });

  it("should reject empty workspace root", () => {
    expect(() => validatePathWithinWorkspace("subdir", "")).toThrow(
      PathTraversalError,
    );
  });

  it("should reject path that is a prefix of workspace but not a child", () => {
    const trickPath = workspaceRoot + "def";
    mkdirSync(trickPath, { recursive: true });
    try {
      expect(() =>
        validatePathWithinWorkspace(trickPath, workspaceRoot),
      ).toThrow(PathTraversalError);
    } finally {
      rmSync(trickPath, { recursive: true, force: true });
    }
  });

  it("should handle paths with trailing slashes", () => {
    const result = validatePathWithinWorkspace("subdir/", workspaceRoot);
    expect(result).toBe(join(realWorkspaceRoot, "subdir"));
  });

  it("should reject whitespace-only workspace root", () => {
    expect(() => validatePathWithinWorkspace("subdir", "   ")).toThrow(
      PathTraversalError,
    );
  });

  it("should accept nested paths when realpathSync is forced to fail", () => {
    // Intentionally force realpathSync to throw so resolveWithSymlinks walks
    // parents until parent === path (filesystem root) and uses the fallback.
    // Expect workspaceRoot (not realWorkspaceRoot): resolution stays logical.
    const spy = vi.spyOn(fs, "realpathSync").mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    try {
      const result = validatePathWithinWorkspace("ghost/nested", workspaceRoot);
      expect(spy).toHaveBeenCalled();
      expect(result).toBe(join(workspaceRoot, "ghost", "nested"));
    } finally {
      spy.mockRestore();
    }
  });
});
