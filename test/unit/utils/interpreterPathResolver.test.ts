import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";

vi.mock("vscode", () => ({
  workspace: {
    getWorkspaceFolder: vi.fn(),
    workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    homedir: vi.fn(() => "/home/testuser"),
  };
});

import { workspace, Uri } from "vscode";
import {
  resolveInterpreterPath,
  getWorkspaceFolderPath,
  isUserConfiguredPath,
  expandTilde,
} from "../../../src/features/utils/interpreterPathResolver";

describe("interpreterPathResolver", () => {
  const mockWorkspacePath = "/home/user/project";

  beforeEach(() => {
    vi.resetAllMocks();
    (
      workspace as unknown as {
        workspaceFolders: { uri: { fsPath: string } }[];
      }
    ).workspaceFolders = [{ uri: { fsPath: mockWorkspacePath } }];
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("resolveInterpreterPath", () => {
    it("should return undefined for empty or undefined paths", () => {
      expect(resolveInterpreterPath(undefined)).toBeUndefined();
      expect(resolveInterpreterPath("")).toBeUndefined();
      expect(resolveInterpreterPath("   ")).toBeUndefined();
    });

    it("should return absolute paths unchanged", () => {
      const absolutePath = "/usr/bin/python3";
      expect(resolveInterpreterPath(absolutePath)).toBe(absolutePath);
    });

    it("should resolve ${workspaceFolder} variable", () => {
      const pathWithVar = "${workspaceFolder}/venv/bin/python";
      const expected = path.join(mockWorkspacePath, "venv/bin/python");
      expect(resolveInterpreterPath(pathWithVar)).toBe(expected);
    });

    it("should resolve multiple ${workspaceFolder} occurrences", () => {
      const pathWithMultipleVars =
        "${workspaceFolder}/test/${workspaceFolder}/bin/python";
      const result = resolveInterpreterPath(pathWithMultipleVars);
      expect(result).not.toContain("${workspaceFolder}");
    });

    it("should resolve relative paths starting with ./", () => {
      const relativePath = "./venv/bin/python";
      const result = resolveInterpreterPath(relativePath);
      expect(result).toBeDefined();
      expect(path.isAbsolute(result as string)).toBe(true);
      expect(result).toBe(path.resolve(mockWorkspacePath, relativePath));
    });

    it("should resolve relative paths starting with ../", () => {
      const relativePath = "../other-project/venv/bin/python";
      const result = resolveInterpreterPath(relativePath);
      expect(result).toBeDefined();
      expect(path.isAbsolute(result as string)).toBe(true);
      expect(result).toBe(path.resolve(mockWorkspacePath, relativePath));
    });

    it("should use document URI workspace folder when provided", () => {
      const documentUri = Uri.file("/home/user/other-project/file.yml");
      const otherWorkspacePath = "/home/user/other-project";

      vi.mocked(workspace.getWorkspaceFolder).mockReturnValue({
        uri: { fsPath: otherWorkspacePath },
      } as ReturnType<typeof workspace.getWorkspaceFolder>);

      const pathWithVar = "${workspaceFolder}/venv/bin/python";
      const result = resolveInterpreterPath(pathWithVar, documentUri);

      expect(result).toBe(path.join(otherWorkspacePath, "venv/bin/python"));
    });

    it("should return original path when ${workspaceFolder} cannot be resolved", () => {
      (
        workspace as unknown as { workspaceFolders: undefined }
      ).workspaceFolders = undefined;

      const pathWithVar = "${workspaceFolder}/venv/bin/python";
      expect(resolveInterpreterPath(pathWithVar)).toBe(pathWithVar);
    });

    it("should expand tilde (~) to home directory", () => {
      const tildePath = "~/venv/ansible/bin/python";
      const result = resolveInterpreterPath(tildePath);
      expect(result).toBe("/home/testuser/venv/ansible/bin/python");
    });

    it("should expand standalone tilde (~)", () => {
      const tildePath = "~";
      const result = resolveInterpreterPath(tildePath);
      expect(result).toBe("/home/testuser");
    });
  });

  describe("expandTilde", () => {
    it("should expand ~/path to home directory path", () => {
      expect(expandTilde("~/venv/bin/python")).toBe(
        "/home/testuser/venv/bin/python",
      );
    });

    it("should expand standalone ~ to home directory", () => {
      expect(expandTilde("~")).toBe("/home/testuser");
    });

    it("should return absolute paths unchanged", () => {
      expect(expandTilde("/usr/bin/python")).toBe("/usr/bin/python");
    });

    it("should return relative paths unchanged", () => {
      expect(expandTilde("./venv/bin/python")).toBe("./venv/bin/python");
    });

    it("should return empty string for empty input", () => {
      expect(expandTilde("")).toBe("");
    });
  });

  describe("getWorkspaceFolderPath", () => {
    it("should return workspace folder for document URI", () => {
      const documentUri = Uri.file("/home/user/project/file.yml");
      const workspacePath = "/home/user/project";

      vi.mocked(workspace.getWorkspaceFolder).mockReturnValue({
        uri: { fsPath: workspacePath },
      } as ReturnType<typeof workspace.getWorkspaceFolder>);

      expect(getWorkspaceFolderPath(documentUri)).toBe(workspacePath);
    });

    it("should fall back to first workspace folder when no document URI", () => {
      expect(getWorkspaceFolderPath()).toBe(mockWorkspacePath);
    });

    it("should return undefined when no workspace folders exist", () => {
      (
        workspace as unknown as { workspaceFolders: undefined }
      ).workspaceFolders = undefined;
      expect(getWorkspaceFolderPath()).toBeUndefined();
    });
  });

  describe("isUserConfiguredPath", () => {
    it("should return false for empty or undefined paths", () => {
      expect(isUserConfiguredPath(undefined)).toBe(false);
      expect(isUserConfiguredPath("")).toBe(false);
      expect(isUserConfiguredPath("   ")).toBe(false);
    });

    it("should return true for paths with ${workspaceFolder}", () => {
      expect(isUserConfiguredPath("${workspaceFolder}/venv/bin/python")).toBe(
        true,
      );
    });

    it("should return true for relative paths starting with ./", () => {
      expect(isUserConfiguredPath("./venv/bin/python")).toBe(true);
    });

    it("should return true for relative paths starting with ../", () => {
      expect(isUserConfiguredPath("../venv/bin/python")).toBe(true);
    });

    it("should return true for tilde paths (~)", () => {
      expect(isUserConfiguredPath("~/venv/ansible/bin/python")).toBe(true);
      expect(isUserConfiguredPath("~")).toBe(true);
      expect(isUserConfiguredPath("~/.pyenv/versions/3.11/bin/python")).toBe(
        true,
      );
    });

    it("should return true for all portable path formats", () => {
      expect(isUserConfiguredPath("${workspaceFolder}/venv/bin/python")).toBe(
        true,
      );
      expect(
        isUserConfiguredPath("${workspaceFolder}/.venv/bin/python3"),
      ).toBe(true);
      expect(isUserConfiguredPath("~/venv/ansible/bin/python")).toBe(true);
      expect(isUserConfiguredPath("~/.local/venv/bin/python")).toBe(true);
      expect(isUserConfiguredPath("./venv/bin/python")).toBe(true);
      expect(isUserConfiguredPath("../shared-venv/bin/python")).toBe(true);
      expect(isUserConfiguredPath("./.venv/bin/python3")).toBe(true);
    });

    it("should return false for absolute paths", () => {
      expect(isUserConfiguredPath("/usr/bin/python3")).toBe(false);
      expect(isUserConfiguredPath("/home/user/.venv/bin/python")).toBe(false);
      expect(isUserConfiguredPath("/usr/local/bin/python3.11")).toBe(false);
      expect(
        isUserConfiguredPath("/Users/john/.pyenv/versions/3.11.0/bin/python"),
      ).toBe(false);
    });

    it("should return false for simple executable names", () => {
      expect(isUserConfiguredPath("python3")).toBe(false);
      expect(isUserConfiguredPath("python")).toBe(false);
    });
  });
});
