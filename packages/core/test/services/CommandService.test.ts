import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Node may call exec(cmd, cb) or exec(cmd, opts, cb); promisify uses the latter. */
function asExecCallback(
  arg2: unknown,
  arg3?: unknown,
): (err: Error | null, stdout?: string, stderr?: string) => void {
  if (typeof arg2 === "function") {
    return arg2 as (err: Error | null, stdout?: string, stderr?: string) => void;
  }
  return arg3 as (err: Error | null, stdout?: string, stderr?: string) => void;
}

const execImpl = vi.hoisted(() =>
  vi.fn((cmd: string, arg2: unknown, arg3?: unknown) => {
    asExecCallback(arg2, arg3)(null, "out\n", "");
  }),
);

const execExport = vi.hoisted(() => {
  const customPromisify = Symbol.for("nodejs.util.promisify.custom");
  return Object.assign(execImpl, {
    [customPromisify](command: string, options?: Record<string, unknown>) {
      return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execImpl(
          command,
          options ?? {},
          (err: Error | null, stdout?: string, stderr?: string) => {
            if (err) {
              reject(err);
            } else {
              resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
            }
          },
        );
      });
    },
  });
});

vi.mock("child_process", () => ({
  exec: execExport,
}));

describe("CommandService", () => {
  let tmpDir: string;
  let previousWorkspace: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-cmd-svc-"));
    previousWorkspace = process.env.ANSIBLE_ENV_WORKSPACE;
    process.env.ANSIBLE_ENV_WORKSPACE = tmpDir;
    execImpl.mockReset();
    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      asExecCallback(arg2, arg3)(null, "out\n", "");
    });
  });

  afterEach(() => {
    if (previousWorkspace === undefined) {
      delete process.env.ANSIBLE_ENV_WORKSPACE;
    } else {
      process.env.ANSIBLE_ENV_WORKSPACE = previousWorkspace;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("getInstance returns the same singleton", async () => {
    const { CommandService } = await import("../../src/services/CommandService");
    const a = CommandService.getInstance();
    const b = CommandService.getInstance();
    expect(a).toBe(b);
  });

  it("runCommand executes via child_process.exec and returns stdout", async () => {
    execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
      asExecCallback(arg2, arg3)(null, "  hello  \n", "");
    });
    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runCommand('echo "test"', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(execImpl).toHaveBeenCalled();
  });

  it("runCommand maps exec failures to exitCode and stderr", async () => {
    const err = Object.assign(new Error("command failed"), {
      code: 127,
      stdout: "partial\n",
      stderr: "not found\n",
    });
    execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
      asExecCallback(arg2, arg3)(err, "partial\n", "not found\n");
    });
    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runCommand("false", { cwd: tmpDir });
    expect(result.exitCode).toBe(127);
    expect(result.stdout).toBe("partial");
    expect(result.stderr).toContain("not found");
  });

  it("getToolPath resolves a tool in the cached venv bin directory", async () => {
    const binDir = path.join(tmpDir, ".venv", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const tool = path.join(binDir, "ansible-doc");
    fs.writeFileSync(tool, "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python3"));

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    await expect(svc.getToolPath("ansible-doc")).resolves.toBe(tool);
  });

  it("runTool runs the resolved executable and forwards args", async () => {
    const binDir = path.join(tmpDir, "venv2", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const tool = path.join(binDir, "mycli");
    fs.writeFileSync(tool, "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));

    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      expect(cmd).toContain("mycli");
      expect(cmd).toContain("--flag");
      asExecCallback(arg2, arg3)(null, "cli-out\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runTool("mycli", ["--flag", "v"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("cli-out");
  });

  it("runTool returns structured failure when the tool cannot be resolved", async () => {
    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      if (/^(which|where)\s+/i.test(cmd.trim())) {
        asExecCallback(arg2, arg3)(new Error("not in path"), "", "");
        return;
      }
      asExecCallback(arg2, arg3)(null, "out\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runTool("tool-that-does-not-exist-zz", []);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  it("runAnsibleCreator delegates to runTool with ansible-creator name", async () => {
    const binDir = path.join(tmpDir, "venv3", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "ansible-creator"), "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));

    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      expect(cmd).toContain("ansible-creator");
      expect(cmd).toContain("init");
      asExecCallback(arg2, arg3)(null, "creator-ok\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runAnsibleCreator(["init", "playbook"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("creator-ok");
  });

  it("runAnsibleDoc delegates to runTool", async () => {
    const binDir = path.join(tmpDir, "venv4", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "ansible-doc"), "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));

    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      expect(cmd).toContain("ansible-doc");
      asExecCallback(arg2, arg3)(null, "doc-json\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.runAnsibleDoc(["-l"]);
    expect(result.stdout).toBe("doc-json");
  });

  it("installCollection runs ade install", async () => {
    const binDir = path.join(tmpDir, "venv5", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "ade"), "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));

    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      expect(cmd).toMatch(/ade.*install.*ns\.coll/);
      asExecCallback(arg2, arg3)(null, "installed\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    const result = await svc.installCollection("ns.coll");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("installed");
  });

  it("isToolAvailable reflects getToolPath resolution", async () => {
    const binDir = path.join(tmpDir, "venv6", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "adt"), "");
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));

    execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
      if (/^(which|where)\s+/i.test(cmd.trim()) && cmd.includes("missing-binary-xyz")) {
        asExecCallback(arg2, arg3)(new Error("not found"), "", "");
        return;
      }
      asExecCallback(arg2, arg3)(null, "out\n", "");
    });

    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    await expect(svc.isToolAvailable("adt")).resolves.toBe(true);
    await expect(svc.isToolAvailable("missing-binary-xyz")).resolves.toBe(false);
  });

  it("runCommand forwards timeout to exec", async () => {
    execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
      const opts = typeof arg2 === "function" ? {} : (arg2 as { timeout?: number });
      expect(opts.timeout).toBe(5000);
      asExecCallback(arg2, arg3)(null, "t\n", "");
    });
    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    await svc.runCommand("sleep 999", { cwd: tmpDir, timeout: 5000 });
  });

  it("getWorkspaceRoot prefers ANSIBLE_ENV_WORKSPACE when vscode is absent", async () => {
    const { CommandService } = await import("../../src/services/CommandService");
    const svc = CommandService.getInstance();
    expect(svc.getWorkspaceRoot()).toBe(tmpDir);
  });
});
