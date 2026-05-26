import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("EnvironmentCache", () => {
  let tmpDir: string;
  let previousWorkspace: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-env-cache-"));
    previousWorkspace = process.env.ANSIBLE_ENV_WORKSPACE;
    process.env.ANSIBLE_ENV_WORKSPACE = tmpDir;
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

  it("cacheSelectedEnvironment writes JSON with pythonPath, binDir, displayName, timestamp", async () => {
    const { cacheSelectedEnvironment } = await import("../../src/services/EnvironmentCache");
    const pythonPath = path.join(tmpDir, "venv", "bin", "python");
    const ok = cacheSelectedEnvironment(pythonPath, "My venv");
    expect(ok).toBe(true);

    const cacheFile = path.join(tmpDir, ".cache", "ansible-environments", "environment.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    expect(raw.selectedEnvironment).toMatchObject({
      pythonPath,
      binDir: path.dirname(pythonPath),
      displayName: "My venv",
    });
    expect(typeof raw.selectedEnvironment.timestamp).toBe("string");
  });

  it("getCachedEnvironment reads back the cached environment", async () => {
    const { cacheSelectedEnvironment, getCachedEnvironment } = await import(
      "../../src/services/EnvironmentCache"
    );
    const pythonPath = path.join(tmpDir, ".venv", "bin", "python3");
    cacheSelectedEnvironment(pythonPath);
    const cached = getCachedEnvironment();
    expect(cached).not.toBeNull();
    expect(cached!.pythonPath).toBe(pythonPath);
    expect(cached!.binDir).toBe(path.dirname(pythonPath));
  });

  it("getCachedBinDir returns the cached bin directory", async () => {
    const { cacheSelectedEnvironment, getCachedBinDir } = await import(
      "../../src/services/EnvironmentCache"
    );
    const pythonPath = path.join(tmpDir, "env", "Scripts", "python.exe");
    cacheSelectedEnvironment(pythonPath);
    expect(getCachedBinDir()).toBe(path.dirname(pythonPath));
  });

  it("clearCachedEnvironment removes selectedEnvironment from the file", async () => {
    const { cacheSelectedEnvironment, clearCachedEnvironment, getCachedEnvironment } = await import(
      "../../src/services/EnvironmentCache"
    );
    cacheSelectedEnvironment(path.join(tmpDir, "bin", "python"));
    expect(getCachedEnvironment()).not.toBeNull();

    const cleared = clearCachedEnvironment();
    expect(cleared).toBe(true);
    expect(getCachedEnvironment()).toBeNull();
  });

  it("findExecutableWithCache resolves a tool path from the cached bin dir", async () => {
    const binDir = path.join(tmpDir, "venv", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const toolPath = path.join(binDir, "ansible-doc");
    fs.writeFileSync(toolPath, "", "utf8");

    const { cacheSelectedEnvironment, findExecutableWithCache } = await import(
      "../../src/services/EnvironmentCache"
    );
    cacheSelectedEnvironment(path.join(binDir, "python"));

    const resolved = await findExecutableWithCache("ansible-doc");
    expect(resolved).toBe(toolPath);
  });

  it("getCachedToolPath returns null when tool file is missing from cached bin", async () => {
    const binDir = path.join(tmpDir, "emptybin");
    fs.mkdirSync(binDir, { recursive: true });
    const { cacheSelectedEnvironment, getCachedToolPath } = await import("../../src/services/EnvironmentCache");
    cacheSelectedEnvironment(path.join(binDir, "python"));
    expect(getCachedToolPath("no-such-tool")).toBeNull();
  });

  it("read invalid JSON yields null from getCachedEnvironment", async () => {
    const cacheFile = path.join(tmpDir, ".cache", "ansible-environments", "environment.json");
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, "{broken", "utf8");
    const { getCachedEnvironment } = await import("../../src/services/EnvironmentCache");
    expect(getCachedEnvironment()).toBeNull();
  });

  it("findExecutableWithCache falls back to PATH via child_process.exec", async () => {
    vi.resetModules();
    process.env.ANSIBLE_ENV_WORKSPACE = tmpDir;

    const execMock = vi.fn((cmd: string, arg2: unknown, arg3?: unknown) => {
      expect(cmd).toMatch(/^(which|where)\s+/);
      const cb =
        typeof arg2 === "function"
          ? (arg2 as (err: Error | null, stdout: string) => void)
          : (arg3 as (err: Error | null, stdout: string) => void);
      cb(null, "/usr/bin/ansible-doc\n");
    });

    vi.doMock("child_process", () => ({
      exec: execMock,
    }));

    const { findExecutableWithCache } = await import("../../src/services/EnvironmentCache");
    const resolved = await findExecutableWithCache("ansible-doc");
    expect(resolved).toBe("/usr/bin/ansible-doc");
    expect(execMock).toHaveBeenCalled();
  });
});
