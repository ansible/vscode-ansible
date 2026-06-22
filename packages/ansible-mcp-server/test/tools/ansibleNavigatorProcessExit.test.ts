import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined),
  stat: vi
    .fn()
    .mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

import { runAnsibleNavigator } from "@src/tools/ansibleNavigator.js";

function createMockProcess(
  exitCode: number | null,
  stdout: string,
  stderr: string,
) {
  const mockChild = {
    stdout: {
      on: vi.fn((event: string, cb: (data: string) => void) => {
        if (event === "data" && stdout) {
          setTimeout(() => cb(stdout), 5);
        }
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (data: string) => void) => {
        if (event === "data" && stderr) {
          setTimeout(() => cb(stderr), 5);
        }
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "close") {
        setTimeout(() => cb(exitCode), 20);
      }
    }),
    kill: vi.fn(),
    killed: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return mockChild as unknown as ChildProcess;
}

describe("interpretProcessExit via runAnsibleNavigator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue("/usr/local/bin/ansible-navigator\n");
  });

  it("should resolve with output on success (exit code 0)", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(0, "PLAY [all] ***\nok: [localhost]", ""),
    );

    const result = await runAnsibleNavigator("/workspace/play.yml");

    expect(result.output).toContain("PLAY [all]");
    expect(result.output).toContain("ok: [localhost]");
    expect(result.navigatorPath).toBe("/usr/local/bin/ansible-navigator");
  });

  it("should resolve with playbook failure note on non-zero exit with stdout", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(2, "PLAY [all] ***\nfatal: [localhost]: FAILED!", ""),
    );

    const result = await runAnsibleNavigator("/workspace/play.yml");

    expect(result.output).toContain(
      "Playbook execution completed with exit code 2",
    );
    expect(result.output).toContain("fatal: [localhost]: FAILED!");
  });

  it("should reject with error on stderr-only output", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(1, "", "ERROR: Cannot find ansible-runner"),
    );

    await expect(runAnsibleNavigator("/workspace/play.yml")).rejects.toThrow(
      "ansible-navigator failed with exit code 1",
    );
  });

  it("should reject with debug info on non-zero exit with no stdout and no stderr", async () => {
    vi.mocked(spawn).mockReturnValue(createMockProcess(127, "", ""));

    await expect(runAnsibleNavigator("/workspace/play.yml")).rejects.toThrow(
      "ansible-navigator exited with code 127",
    );
  });

  it("should include stderr as debug output on success", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(
        0,
        "ok: [localhost]",
        "Warning: some deprecation notice",
      ),
    );

    const result = await runAnsibleNavigator("/workspace/play.yml");

    expect(result.output).toContain("ok: [localhost]");
    expect(result.debugOutput).toBe("Warning: some deprecation notice");
  });

  it("should detect container engine error from stderr", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(1, "", "Error: Cannot connect to Podman"),
    );

    await expect(runAnsibleNavigator("/workspace/play.yml")).rejects.toThrow(
      /container/i,
    );
  });

  it("should detect container engine error with stdout present", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(
        1,
        "PLAY [all] ***",
        "Error: container engine not available",
      ),
    );

    await expect(runAnsibleNavigator("/workspace/play.yml")).rejects.toThrow(
      /container/i,
    );
  });
});
