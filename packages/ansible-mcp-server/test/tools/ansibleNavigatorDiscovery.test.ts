import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn() };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: vi.fn() };
});

import {
  findNavigatorInSpecificVenv,
  findNavigatorInCommonVenvs,
  checkVenv,
  checkAnsibleNavigatorAvailable,
  resolveNavigatorPath,
} from "@src/tools/ansibleNavigator.js";

describe("Navigator discovery functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findNavigatorInSpecificVenv", () => {
    it("should find navigator in absolute venv path", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => p === "/abs/venv/bin/ansible-navigator",
      );
      expect(findNavigatorInSpecificVenv("/abs/venv", "/workspace")).toBe(
        "/abs/venv/bin/ansible-navigator",
      );
    });

    it("should return undefined when absolute venv has no navigator", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(
        findNavigatorInSpecificVenv("/abs/venv", "/workspace"),
      ).toBeUndefined();
    });

    it("should find navigator relative to workspace root", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => p === "/workspace/my-venv/bin/ansible-navigator",
      );
      expect(findNavigatorInSpecificVenv("my-venv", "/workspace")).toBe(
        "/workspace/my-venv/bin/ansible-navigator",
      );
    });

    it("should find navigator in parent directory", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => p === "/home/user/my-venv/bin/ansible-navigator",
      );
      expect(
        findNavigatorInSpecificVenv("my-venv", "/home/user/project/sub"),
      ).toBe("/home/user/my-venv/bin/ansible-navigator");
    });

    it("should return undefined when not found anywhere", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(
        findNavigatorInSpecificVenv("my-venv", "/workspace/project"),
      ).toBeUndefined();
    });
  });

  describe("findNavigatorInCommonVenvs", () => {
    it("should return undefined when no common venvs exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(findNavigatorInCommonVenvs("/workspace")).toBeUndefined();
    });

    it("should find navigator in workspace venv directory", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/workspace/venv" ||
          String(p) === "/workspace/venv/bin/ansible-navigator",
      );
      expect(findNavigatorInCommonVenvs("/workspace")).toBe(
        "/workspace/venv/bin/ansible-navigator",
      );
    });

    it("should find navigator in .venv directory", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/workspace/.venv" ||
          String(p) === "/workspace/.venv/bin/ansible-navigator",
      );
      expect(findNavigatorInCommonVenvs("/workspace")).toBe(
        "/workspace/.venv/bin/ansible-navigator",
      );
    });

    it("should find navigator in parent directory common venv", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => String(p) === "/home/venv/bin/ansible-navigator",
      );
      expect(findNavigatorInCommonVenvs("/home/user/project")).toBe(
        "/home/venv/bin/ansible-navigator",
      );
    });

    it("should prefer workspace root over parent directories", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/workspace/venv" ||
          String(p) === "/workspace/venv/bin/ansible-navigator" ||
          String(p) === "/venv/bin/ansible-navigator",
      );
      expect(findNavigatorInCommonVenvs("/workspace")).toBe(
        "/workspace/venv/bin/ansible-navigator",
      );
    });
  });

  describe("checkVenv", () => {
    it("should return available false when no workspace root", () => {
      expect(checkVenv()).toEqual({ available: false });
    });

    it("should return available false with undefined workspace root", () => {
      expect(checkVenv(undefined)).toEqual({ available: false });
    });

    it("should check specific venv first when provided", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => String(p) === "/ws/my-venv/bin/ansible-navigator",
      );
      expect(checkVenv("/ws", "my-venv")).toEqual({
        available: true,
        path: "/ws/my-venv/bin/ansible-navigator",
      });
    });

    it("should fall back to common venvs when specific not found", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/ws/venv" ||
          String(p) === "/ws/venv/bin/ansible-navigator",
      );
      expect(checkVenv("/ws", "nonexistent")).toEqual({
        available: true,
        path: "/ws/venv/bin/ansible-navigator",
      });
    });

    it("should return available false when nothing found", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(checkVenv("/ws", "nonexistent")).toEqual({ available: false });
    });

    it("should check common venvs when no specific venv provided", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/ws/.venv" ||
          String(p) === "/ws/.venv/bin/ansible-navigator",
      );
      expect(checkVenv("/ws")).toEqual({
        available: true,
        path: "/ws/.venv/bin/ansible-navigator",
      });
    });
  });

  describe("checkAnsibleNavigatorAvailable", () => {
    it("should check system only when environment is 'system'", () => {
      vi.mocked(execSync).mockReturnValue("/usr/bin/ansible-navigator\n");
      const result = checkAnsibleNavigatorAvailable("/ws", "system");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/usr/bin/ansible-navigator");
    });

    it("should return error when system check fails", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      const result = checkAnsibleNavigatorAvailable("/ws", "system");
      expect(result.available).toBe(false);
      expect(result.error).toContain("not found in PATH/system");
    });

    it("should check venv only when environment is 'venv'", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = checkAnsibleNavigatorAvailable("/ws", "venv");
      expect(result.available).toBe(false);
      expect(result.error).toContain("virtual environments");
    });

    it("should return available when venv has navigator", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/ws/venv" ||
          String(p) === "/ws/venv/bin/ansible-navigator",
      );
      const result = checkAnsibleNavigatorAvailable("/ws", "venv");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/ws/venv/bin/ansible-navigator");
    });

    it("should check specific venv when environment is custom name", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = checkAnsibleNavigatorAvailable("/ws", "custom-env");
      expect(result.available).toBe(false);
      expect(result.error).toContain("custom-env");
    });

    it("should find specific custom venv when it exists", () => {
      vi.mocked(existsSync).mockImplementation(
        (p) => String(p) === "/ws/custom-env/bin/ansible-navigator",
      );
      const result = checkAnsibleNavigatorAvailable("/ws", "custom-env");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/ws/custom-env/bin/ansible-navigator");
    });

    it("should check system PATH first in auto mode", () => {
      vi.mocked(execSync).mockReturnValue("/usr/local/bin/ansible-navigator\n");
      const result = checkAnsibleNavigatorAvailable("/ws", "auto");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/usr/local/bin/ansible-navigator");
    });

    it("should fall back to venv in auto mode when system not found", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/ws/.venv" ||
          String(p) === "/ws/.venv/bin/ansible-navigator",
      );
      const result = checkAnsibleNavigatorAvailable("/ws", "auto");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/ws/.venv/bin/ansible-navigator");
    });

    it("should return available false when nothing found in auto mode", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockReturnValue(false);
      const result = checkAnsibleNavigatorAvailable("/ws", "auto");
      expect(result.available).toBe(false);
    });

    it("should default to auto mode when environment not specified", () => {
      vi.mocked(execSync).mockReturnValue("/usr/bin/ansible-navigator\n");
      const result = checkAnsibleNavigatorAvailable("/ws");
      expect(result.available).toBe(true);
      expect(result.path).toBe("/usr/bin/ansible-navigator");
    });
  });

  describe("resolveNavigatorPath", () => {
    it("should return path and shouldDisableEE=true for venv path", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockImplementation(
        (p) =>
          String(p) === "/ws/.venv" ||
          String(p) === "/ws/.venv/bin/ansible-navigator",
      );
      const result = resolveNavigatorPath("/ws", "auto");
      expect(result.navigatorPath).toBe("/ws/.venv/bin/ansible-navigator");
      expect(result.shouldDisableEE).toBe(true);
    });

    it("should detect /bin/ path as venv even for system installs", () => {
      vi.mocked(execSync).mockReturnValue("/usr/local/bin/ansible-navigator\n");
      const result = resolveNavigatorPath("/ws", "system");
      expect(result.navigatorPath).toBe("/usr/local/bin/ansible-navigator");
      // Any path containing /bin/ansible-navigator triggers shouldDisableEE
      expect(result.shouldDisableEE).toBe(true);
    });

    it("should throw when navigator is not available", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => resolveNavigatorPath("/ws", "auto")).toThrow(
        "ansible-navigator is not available",
      );
    });

    it("should include workspace root in error message", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => resolveNavigatorPath("/my/workspace", "auto")).toThrow(
        "/my/workspace",
      );
    });

    it("should throw without workspace info when no workspace root", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => resolveNavigatorPath(undefined, "auto")).toThrow(
        "ansible-navigator is not available",
      );
    });

    it("should use 'ansible-navigator' as fallback when path is empty", () => {
      vi.mocked(execSync).mockReturnValue("\n");
      vi.mocked(existsSync).mockReturnValue(false);
      const result = resolveNavigatorPath("/ws", "system");
      expect(result.navigatorPath).toBe("ansible-navigator");
      expect(result.shouldDisableEE).toBe(false);
    });
  });
});
