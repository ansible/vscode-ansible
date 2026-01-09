// Helper to start/stop the LLM Provider Mock Server from Mocha hooks
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

let serverProcess: ChildProcess | null = null;
let serverUrl: string | null = null;

const SERVER_PORT = 3001;
const SERVER_HOST = "localhost";

/**
 * Start the LLM Provider Mock Server
 * @returns The server URL ("http://localhost:3001")
 */
export async function startLLMProviderServer(): Promise<string> {
  if (serverProcess && serverUrl) {
    console.log("[LLM Mock] Server already running");
    return serverUrl;
  }

  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "server.js");

    console.log(`[LLM Mock] Starting server from: ${serverPath}`);

    serverProcess = spawn("node", [serverPath], {
      env: {
        ...process.env,
        TEST_LLM_PROVIDER_PORT: String(SERVER_PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[LLM Mock] ${output.trim()}`);

      if (output.includes("Listening on port")) {
        serverUrl = `http://${SERVER_HOST}:${SERVER_PORT}`;
        console.log(`[LLM Mock] Server ready at ${serverUrl}`);
        resolve(serverUrl);
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[LLM Mock Error] ${data.toString().trim()}`);
    });

    serverProcess.on("error", (err) => {
      console.error(`[LLM Mock] Failed to start server:`, err);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[LLM Mock] Server exited with code ${code}`);
      serverProcess = null;
      serverUrl = null;
    });

    setTimeout(() => {
      if (!serverUrl) {
        reject(new Error("LLM Mock Server failed to start within timeout"));
      }
    }, 15000);
  });
}

/**
 * Stop the LLM Provider Mock Server
 */
export async function stopLLMProviderServer(): Promise<void> {
  if (!serverProcess) {
    console.log("[LLM Mock] Server not running");
    return;
  }

  console.log("[LLM Mock] Stopping server...");
  serverProcess.kill("SIGTERM");
  serverProcess = null;
  serverUrl = null;
  console.log("[LLM Mock] Server stopped");
}
