import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const mcpServerDir = path.join(projectRoot, "packages", "ansible-mcp-server");

describe("MCP server process startup", function () {
  const cliCjsPath = path.join(mcpServerDir, "dist", "cli.cjs");

  it("should have cli.cjs built", function () {
    if (!fs.existsSync(cliCjsPath)) {
      console.warn("cli.cjs not built yet - run 'pnpm build' first");
      return;
    }
    expect(fs.statSync(cliCjsPath).isFile()).toBe(true);
  });

  it("should start cli.cjs without 'Dynamic require' errors", async function () {
    if (!fs.existsSync(cliCjsPath)) {
      console.warn("cli.cjs not built yet - skipping startup test");
      return;
    }

    const result = await new Promise<{ exitCode: number; stderr: string }>(
      (resolve) => {
        const child = spawn(process.execPath, [cliCjsPath, "--stdio"], {
          env: { ...process.env, WORKSPACE_ROOT: projectRoot },
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });

        let stderr = "";
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        // Send a valid JSON-RPC initialize then close stdin to trigger clean exit
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "test", version: "0.0.1" },
            },
          }) + "\n",
        );

        setTimeout(() => {
          child.stdin.end();
          child.kill("SIGTERM");
        }, 2000);

        child.on("close", (code) => {
          resolve({ exitCode: code ?? 1, stderr });
        });
      },
    );

    expect(result.stderr).not.toContain("Dynamic require");
    expect(result.stderr).not.toContain(
      'Dynamic require of "process" is not supported',
    );
  });
});
