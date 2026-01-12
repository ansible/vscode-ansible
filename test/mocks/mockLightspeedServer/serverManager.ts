// Helper to start/stop the Mock Lightspeed Server from Mocha hooks
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

let serverProcess: ChildProcess | null = null;
let serverUrl: string | null = null;

const SERVER_PORT = 3000;

/**
 * Start the Mock Lightspeed Server
 * @param testId - The test ID for log file naming
 * @returns The server URL ("http://localhost:3000")
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function startMockLightspeedServer(
  testId: string = "e2e",
): Promise<string> {
  if (serverProcess && serverUrl) {
    console.log("[Lightspeed Mock] Server already running");
    return serverUrl;
  }

  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "server.js");
    // __dirname will be out/client/test/ui/mockLightspeedServer/ when compiled
    // Go up 4 levels to project root, then to out/log
    const logDir = path.join(__dirname, "../../../../out/log");
    const expressLogPath = path.join(logDir, `${testId}-express.log`);
    const mockServerLogPath = path.join(logDir, `${testId}-mock-server.log`);

    // Ensure log directory exists
    fs.mkdirSync(logDir, { recursive: true });

    // Truncate log files
    fs.writeFileSync(expressLogPath, "");
    fs.writeFileSync(mockServerLogPath, "");

    console.log(`[Lightspeed Mock] Starting server from: ${serverPath}`);

    serverProcess = spawn("node", [serverPath], {
      env: {
        ...process.env,
        TEST_LIGHTSPEED_PORT: String(SERVER_PORT),
        TEST_LIGHTSPEED_ACCESS_TOKEN: "dummy",
        TEST_ID: testId,
        DEBUG: "express:*",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Write stdout to express log file
    const expressLogStream = fs.createWriteStream(expressLogPath, {
      flags: "a",
    });
    serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      expressLogStream.write(data);
      console.log(`[Lightspeed Mock] ${output.trim()}`);

      // Extract URL from "Listening on port X at Y" message
      const match = output.match(/Listening on port (\d+) at ([^\s"]+)/);
      if (match) {
        const port = match[1];
        const host = match[2];
        serverUrl = `http://${host}:${port}`;
        console.log(`[Lightspeed Mock] Server ready at ${serverUrl}`);
        process.env.TEST_LIGHTSPEED_URL = serverUrl;
        process.env.TEST_LIGHTSPEED_ACCESS_TOKEN = "dummy";
        expressLogStream.end();
        resolve(serverUrl);
      }
    });

    // Write stderr to express log file as well
    serverProcess.stderr?.on("data", (data: Buffer) => {
      expressLogStream.write(data);
      console.error(`[Lightspeed Mock Error] ${data.toString().trim()}`);
    });

    serverProcess.on("error", (err) => {
      console.error(`[Lightspeed Mock] Failed to start server:`, err);
      expressLogStream.end();
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[Lightspeed Mock] Server exited with code ${code}`);
      expressLogStream.end();
      serverProcess = null;
      serverUrl = null;
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!serverUrl) {
        expressLogStream.end();
        reject(
          new Error("Mock Lightspeed Server failed to start within timeout"),
        );
      }
    }, 15000);
  });
}

/**
 * Stop the Mock Lightspeed Server
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stopMockLightspeedServer(): Promise<void> {
  if (!serverProcess) {
    console.log("[Lightspeed Mock] Server not running");
    return;
  }

  console.log("[Lightspeed Mock] Stopping server...");
  serverProcess.kill("SIGTERM");

  // Wait a bit for graceful shutdown
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Force kill if still running
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGKILL");
  }

  serverProcess = null;
  serverUrl = null;
  delete process.env.TEST_LIGHTSPEED_URL;
  console.log("[Lightspeed Mock] Server stopped");
}
