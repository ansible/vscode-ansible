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
 * Read JSON-RPC responses from stdout, collecting all complete messages
 * within a timeout window.
 */
function readMessages(
  stdout: NodeJS.ReadableStream,
  timeout: number,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const messages: Record<string, unknown>[] = [];
    let buffer = "";

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            messages.push(JSON.parse(trimmed));
          } catch {
            // skip non-JSON lines
          }
        }
      }
    };

    stdout.on("data", onData);
    setTimeout(() => {
      stdout.removeListener("data", onData);
      resolve(messages);
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

  it("MCP server should start and list tools from the packaged extension path", async function () {
    if (!fs.existsSync(path.join(mcpServerSrc, "dist", "cli.cjs"))) {
      console.warn("MCP server not built — skipping");
      return;
    }

    const provider = new AnsibleMcpServerProvider(tempDir);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cliPath = (provider as any).findCliPath() as string | null;

    // If findCliPath() can't find it, fail immediately — this is the bug
    expect(cliPath).not.toBeNull();
    if (!cliPath) return;

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

    const initResponses = await readMessages(child.stdout, 3000);
    expect(stderr).not.toContain("Dynamic require");
    expect(initResponses.length).toBeGreaterThanOrEqual(1);

    const initResult = initResponses.find((msg) => "id" in msg && msg.id === 1);
    expect(initResult).toBeDefined();
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

    const toolResponses = await readMessages(child.stdout, 3000);

    const toolResult = toolResponses.find(
      (msg) => "id" in msg && msg.id === 2,
    ) as Record<string, unknown> | undefined;

    expect(toolResult).toBeDefined();
    expect(toolResult).toHaveProperty("result");

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = toolResult!.result as { tools: { name: string }[] };
    expect(result.tools).toBeInstanceOf(Array);
    expect(result.tools.length).toBeGreaterThan(0);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("zen_of_ansible");

    child.kill("SIGTERM");
  });
});
