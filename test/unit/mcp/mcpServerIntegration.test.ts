import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { AnsibleMcpServerProvider } from "@src/utils/mcpProvider";

/**
 * Send a JSON-RPC message over MCP stdio transport (newline-delimited JSON).
 */
function sendMessage(
  stdin: NodeJS.WritableStream,
  message: Record<string, unknown>,
): void {
  stdin.write(JSON.stringify(message) + "\n");
}

/**
 * Wait for a JSON-RPC response with a specific id, or time out.
 */
function waitForResponse(
  stdout: NodeJS.ReadableStream,
  expectedId: number,
  timeout: number,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let buffer = "";

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if ("id" in msg && msg.id === expectedId) {
            clearTimeout(timer);
            stdout.removeListener("data", onData);
            resolve(msg);
            return;
          }
        } catch {
          // skip non-JSON lines
        }
      }
    };

    stdout.on("data", onData);
    const timer = setTimeout(() => {
      stdout.removeListener("data", onData);
      resolve(null);
    }, timeout);
  });
}

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const mcpServerSrc = path.join(projectRoot, "packages", "ansible-mcp-server");

describe("MCP server integration — packaged extension simulation", function () {
  let tempDir: string;

  beforeAll(() => {
    // Create a temp directory that mimics the packaged vsix layout.
    // NO node_modules/ — just the files .vscodeignore should whitelist.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-vsix-sim-"));

    const distSrc = path.join(mcpServerSrc, "dist");
    const resourcesSrc = path.join(mcpServerSrc, "src", "resources", "data");

    if (!fs.existsSync(distSrc)) {
      return;
    }

    const distDest = path.join(
      tempDir,
      "packages",
      "ansible-mcp-server",
      "dist",
    );
    const resourcesDest = path.join(
      tempDir,
      "packages",
      "ansible-mcp-server",
      "src",
      "resources",
      "data",
    );

    fs.mkdirSync(distDest, { recursive: true });
    for (const file of fs.readdirSync(distSrc)) {
      const srcFile = path.join(distSrc, file);
      const stat = fs.statSync(srcFile);
      if (stat.isFile()) {
        fs.copyFileSync(srcFile, path.join(distDest, file));
      }
    }

    // Copy package.json (needed for module resolution)
    fs.copyFileSync(
      path.join(mcpServerSrc, "package.json"),
      path.join(tempDir, "packages", "ansible-mcp-server", "package.json"),
    );

    // Copy a minimal root package.json so createRequire has an anchor
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "fake-extension", version: "0.0.1" }),
    );

    if (fs.existsSync(resourcesSrc)) {
      fs.mkdirSync(resourcesDest, { recursive: true });
      for (const file of fs.readdirSync(resourcesSrc)) {
        fs.copyFileSync(
          path.join(resourcesSrc, file),
          path.join(resourcesDest, file),
        );
      }
    }
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("findCliPath() should resolve the CLI in a packaged extension layout (no node_modules)", function () {
    if (!fs.existsSync(path.join(mcpServerSrc, "dist", "cli.cjs"))) {
      console.warn("MCP server not built — skipping");
      return;
    }

    // Point the provider at the simulated vsix directory — no node_modules/
    // exists there, so createRequire().resolve() will fail. The provider
    // must fall back to the direct packaged path to find the CLI.
    const provider = new AnsibleMcpServerProvider(tempDir);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cliPath = (provider as any).findCliPath();

    expect(cliPath).not.toBeNull();
    expect(cliPath).toContain("cli.cjs");
    expect(fs.existsSync(cliPath)).toBe(true);
  });

  it("MCP server should start and list tools via JSON-RPC stdio", async function () {
    const cliPath = path.join(mcpServerSrc, "dist", "cli.cjs");
    if (!fs.existsSync(cliPath)) {
      console.warn("MCP server not built — skipping");
      return;
    }

    const child = spawn(process.execPath, [cliPath, "--stdio"], {
      env: { ...process.env, WORKSPACE_ROOT: projectRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Step 1: Initialize
    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "0.0.1" },
      },
    });

    const initResult = await waitForResponse(child.stdout, 1, 10000);
    expect(stderr).not.toContain("Dynamic require");
    expect(initResult).not.toBeNull();
    expect(initResult).toHaveProperty("result");

    // Step 2: Send initialized notification
    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    // Step 3: List tools
    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    const toolResult = await waitForResponse(child.stdout, 2, 10000);
    expect(toolResult).not.toBeNull();
    expect(toolResult).toHaveProperty("result");

    const result = (toolResult as Record<string, unknown>).result as {
      tools: { name: string }[];
    };
    expect(result.tools).toBeInstanceOf(Array);
    expect(result.tools.length).toBeGreaterThan(0);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("zen_of_ansible");

    child.kill("SIGTERM");
  });
});
