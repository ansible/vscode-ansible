/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createDebugEnvHandler,
  createZenOfAnsibleHandler,
  createAnsibleLintHandler,
  createWorkspaceFileHandler,
  createAnsibleFixPromptHandler,
} from "../src/handlers.js";

// Mock external dependencies for controlled testing
vi.mock("node:child_process");
vi.mock("node:fs/promises");

const mockSpawn = vi.mocked(spawn);
const mockFs = vi.mocked(fs);

describe("Ansible MCP Server Real Handlers", () => {
  const workspaceRoot = "/test/workspace";

  // Create handlers for direct testing
  let debugEnvHandler: ReturnType<typeof createDebugEnvHandler>;
  let zenHandler: ReturnType<typeof createZenOfAnsibleHandler>;
  let ansibleLintHandler: ReturnType<typeof createAnsibleLintHandler>;
  let workspaceResourceHandler: ReturnType<typeof createWorkspaceFileHandler>;
  let fixPromptHandler: ReturnType<typeof createAnsibleFixPromptHandler>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create handlers using the same functions as the server
    debugEnvHandler = createDebugEnvHandler(workspaceRoot);
    zenHandler = createZenOfAnsibleHandler();
    ansibleLintHandler = createAnsibleLintHandler(workspaceRoot);
    workspaceResourceHandler = createWorkspaceFileHandler(workspaceRoot);
    fixPromptHandler = createAnsibleFixPromptHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("debug_env tool handler", () => {
    it("should return actual environment information", async () => {
      const result = await debugEnvHandler();

      expect(result).toEqual({
        content: [
          { type: "text", text: `PATH: ${process.env.PATH}\n` },
          {
            type: "text",
            text: `VIRTUAL_ENV: ${process.env.VIRTUAL_ENV || "undefined"}\n`,
          },
          { type: "text", text: `CWD: ${process.cwd()}\n` },
          { type: "text", text: `Workspace Root: ${workspaceRoot}\n` },
        ],
      });
    });
  });

  describe("zen_of_ansible tool handler", () => {
    it("should return all 20 aphorisms", async () => {
      const result = await zenHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const zenText = result.content[0].text;

      // Verify all 20 aphorisms are present
      for (let i = 1; i <= 20; i++) {
        expect(zenText).toContain(`${i}.`);
      }

      expect(zenText).toContain("Ansible is not Python");
      expect(zenText).toContain("Automation is a journey that never ends");
    });
  });

  describe("ansible_lint tool handler", () => {
    let mockChildProcess: any;

    beforeEach(() => {
      mockChildProcess = {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChildProcess);
    });

    it("should execute ansible-lint successfully", async () => {
      const file = "playbook.yml";
      const expectedPath = path.resolve(workspaceRoot, file);

      // Mock successful execution
      mockChildProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === "close") {
            setTimeout(() => callback(0), 0);
          }
          return mockChildProcess;
        },
      );

      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: string) => void) => {
          if (event === "data") {
            setTimeout(() => callback("No violations found\n"), 0);
          }
          return mockChildProcess.stdout;
        },
      );

      mockChildProcess.stderr.on.mockImplementation(
        (event: string, callback: (data: string) => void) => {
          if (event === "data") {
            setTimeout(() => callback(""), 0);
          }
          return mockChildProcess.stderr;
        },
      );

      const result = await ansibleLintHandler({ file });

      expect(mockSpawn).toHaveBeenCalledWith("ansible-lint", [expectedPath], {
        cwd: workspaceRoot,
        env: process.env,
      });

      expect(result).toEqual({
        content: [
          { type: "text", text: "exitCode: 0\n" },
          { type: "text", text: "No violations found\n" },
          { type: "text", text: "" },
        ],
      });
    });

    it("should handle ansible-lint with extra arguments", async () => {
      const file = "playbook.yml";
      const extraArgs = ["--strict", "--offline"];
      const expectedPath = path.resolve(workspaceRoot, file);

      mockChildProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === "close") {
            setTimeout(() => callback(0), 0);
          }
          return mockChildProcess;
        },
      );

      mockChildProcess.stdout.on.mockImplementation(
        () => mockChildProcess.stdout,
      );
      mockChildProcess.stderr.on.mockImplementation(
        () => mockChildProcess.stderr,
      );

      await ansibleLintHandler({ file, extraArgs });

      expect(mockSpawn).toHaveBeenCalledWith(
        "ansible-lint",
        [expectedPath, "--strict", "--offline"],
        {
          cwd: workspaceRoot,
          env: process.env,
        },
      );
    });

    it("should handle ansible-lint command not found error", async () => {
      const file = "playbook.yml";
      const error = new Error("spawn ansible-lint ENOENT");

      mockChildProcess.on.mockImplementation(
        (event: string, callback: (error: Error) => void) => {
          if (event === "error") {
            setTimeout(() => callback(error), 0);
          }
          return mockChildProcess;
        },
      );

      const result = await ansibleLintHandler({ file });

      expect(result).toEqual({
        content: [
          { type: "text", text: `Error: ${error.message}\n` },
          {
            type: "text",
            text: "Ensure 'ansible-lint' is installed and on PATH",
          },
        ],
        isError: true,
      });
    });

    it("should handle ansible-lint with violations (non-zero exit)", async () => {
      const file = "playbook.yml";

      mockChildProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === "close") {
            setTimeout(() => callback(2), 0); // Exit code 2 = violations found
          }
          return mockChildProcess;
        },
      );

      mockChildProcess.stdout.on.mockImplementation(
        (event: string, callback: (data: string) => void) => {
          if (event === "data") {
            setTimeout(() => callback("Found 3 violations\n"), 0);
          }
          return mockChildProcess.stdout;
        },
      );

      mockChildProcess.stderr.on.mockImplementation(
        (event: string, callback: (data: string) => void) => {
          if (event === "data") {
            setTimeout(() => callback("WARNING: Issues detected\n"), 0);
          }
          return mockChildProcess.stderr;
        },
      );

      const result = await ansibleLintHandler({ file });

      expect(result).toEqual({
        content: [
          { type: "text", text: "exitCode: 2\n" },
          { type: "text", text: "Found 3 violations\n" },
          { type: "text", text: "WARNING: Issues detected\n" },
        ],
      });
    });

    it("should handle process timeout/hanging", async () => {
      const file = "playbook.yml";

      // Mock a process that never completes
      mockChildProcess.on.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_event: string, _callback: (...args: any[]) => void) => {
          // Never call the callback - simulates hanging process
          return mockChildProcess;
        },
      );

      mockChildProcess.stdout.on.mockImplementation(
        () => mockChildProcess.stdout,
      );
      mockChildProcess.stderr.on.mockImplementation(
        () => mockChildProcess.stderr,
      );

      // This test should timeout or be handled gracefully
      // In a real implementation, you might want to add timeouts
      void ansibleLintHandler({ file });

      // For now, we'll just verify the process was spawned
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

      expect(mockSpawn).toHaveBeenCalled();

      // In a full implementation, you'd test timeout handling here
    });
  });

  describe("workspace-file resource handler", () => {
    it("should read file successfully", async () => {
      const fileContent = "[defaults]\nhost_key_checking = False\n";
      const relPath = "ansible.cfg";
      const uri = new URL(`workspace://file/${relPath}`);

      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await workspaceResourceHandler(uri, { relPath });

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.resolve(workspaceRoot, relPath),
        "utf8",
      );

      expect(result).toEqual({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: fileContent,
          },
        ],
      });
    });

    it("should handle file read errors", async () => {
      const relPath = "nonexistent.yml";
      const uri = new URL(`workspace://file/${relPath}`);
      const error = Object.assign(
        new Error("ENOENT: no such file or directory"),
        { code: "ENOENT" },
      );

      mockFs.readFile.mockRejectedValue(error);

      await expect(workspaceResourceHandler(uri, { relPath })).rejects.toThrow(
        error,
      );
    });

    it("should handle array relPath parameter", async () => {
      const fileContent = "---\n- name: Test task\n";
      const relPathArray = ["roles", "common", "tasks", "main.yml"];
      const expectedPath = "roles/common/tasks/main.yml";
      const uri = new URL(`workspace://file/${expectedPath}`);

      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await workspaceResourceHandler(uri, {
        relPath: relPathArray,
      });

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.resolve(workspaceRoot, expectedPath),
        "utf8",
      );

      expect(result.contents[0].text).toBe(fileContent);
    });

    it("should handle permission errors", async () => {
      const relPath = "protected.yml";
      const uri = new URL(`workspace://file/${relPath}`);
      const error = Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      });

      mockFs.readFile.mockRejectedValue(error);

      await expect(workspaceResourceHandler(uri, { relPath })).rejects.toThrow(
        error,
      );
    });
  });

  describe("ansible_fix_prompt handler", () => {
    it("should generate fix prompt correctly", async () => {
      const file = "roles/web/tasks/main.yml";
      const errorSummary =
        "Line 5: [yaml] trailing spaces\nLine 12: [ansible-lint] Use FQCN for builtin modules";

      const result = await fixPromptHandler({ file, errorSummary });

      expect(result).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are an expert in Ansible. Given lint issues in ${file}, suggest minimal edits.\n\nIssues:\n${errorSummary}\n\nReturn corrected YAML and a brief rationale.`,
            },
          },
        ],
      });
    });

    it("should handle empty error summary", async () => {
      const file = "clean-playbook.yml";
      const errorSummary = "";

      const result = await fixPromptHandler({ file, errorSummary });

      expect(result.messages[0].content.text).toContain(file);
      expect(result.messages[0].content.text).toContain("Issues:\n\n");
    });

    it("should handle complex file paths", async () => {
      const file =
        "collections/ansible_collections/my_org/my_collection/roles/database/tasks/postgresql.yml";
      const errorSummary = "Multiple formatting issues detected";

      const result = await fixPromptHandler({ file, errorSummary });

      expect(result.messages[0].content.text).toContain(file);
      expect(result.messages[0].content.text).toContain(errorSummary);
    });
  });

  describe("Error handling integration", () => {
    it("should handle memory pressure during file operations", async () => {
      const relPath = "large-file.yml";
      const uri = new URL(`workspace://file/${relPath}`);
      const error = Object.assign(new Error("ENOMEM: not enough memory"), {
        code: "ENOMEM",
      });

      mockFs.readFile.mockRejectedValue(error);

      await expect(workspaceResourceHandler(uri, { relPath })).rejects.toThrow(
        error,
      );
    });

    it("should handle network filesystem errors", async () => {
      const relPath = "network-file.yml";
      const uri = new URL(`workspace://file/${relPath}`);
      const error = Object.assign(new Error("ETIMEDOUT: operation timed out"), {
        code: "ETIMEDOUT",
      });

      mockFs.readFile.mockRejectedValue(error);

      await expect(workspaceResourceHandler(uri, { relPath })).rejects.toThrow(
        error,
      );
    });
  });
});
