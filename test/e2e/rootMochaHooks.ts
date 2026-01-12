import * as cp from "child_process";
import { createLogger, format, transports } from "winston";
import path from "path";
import fs from "fs";
import {
  startMockLightspeedServer,
  stopMockLightspeedServer,
} from "../ui/mockLightspeedServer/serverManager";

type ConsoleMethod = "log" | "info" | "warn" | "error";

const PRETEST_ERR_RC = 2;

process.env = {
  ...process.env,
  NODE_NO_WARNINGS: "1",
  DONT_PROMPT_WSL_INSTALL: "1",
};

// display ansible-lint version and exit testing if ansible-lint is absent
const command = "ansible-lint";
const args = ["--version", "--offline"];
try {
  // ALWAYS use 'shell: true' when we execute external commands inside the
  // extension because some of the tools may be installed in a way that does
  // not make them available without a shell, common examples tools that may
  // do this are: mise, asdf, pyenv.
  const result = cp.spawnSync(command, args, { shell: true });
  if (result.status === 0) {
    console.info(`Detected: ${result.stdout}`);
  } else {
    throw new Error(
      `rc=${result.status} stderr=${result.stderr} stdout=${result.stdout}`,
    );
  }
} catch (err) {
  const env = Object.entries(process.env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  console.error(
    `error: test requisites not met, '${command} ${args.join(" ")}' returned ${err}\n${env}`,
  );
  process.exit(PRETEST_ERR_RC);
}

// Capturing console output and redirecting it to a file to avoid console
// pollution from language server logging during test execution.
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    }),
  ),
  transports: [
    new transports.File({
      filename: path.join("./out/log/e2e.log"),
      level: "info",
    }),
  ],
});

const overrideConsole = (method: ConsoleMethod) => {
  const logMethod = method === "log" ? "info" : method;
  Object.defineProperty(console, method, {
    value: (...args: unknown[]) => {
      logger[logMethod](args.map((arg) => String(arg)).join(" "));
    },
    writable: true,
  });
};

(["log", "info", "warn", "error"] as ConsoleMethod[]).forEach(overrideConsole);

export const mochaHooks = {
  async beforeAll() {
    fs.rmSync("out/junit/e2e", { recursive: true, force: true });
    fs.mkdirSync("out/userdata/User/", { recursive: true });
    fs.mkdirSync("out/junit/e2e", { recursive: true });
    fs.cpSync(
      "test/testFixtures/settings.json",
      "out/userdata/User/settings.json",
    );

    // Start mock Lightspeed server if MOCK_LIGHTSPEED_API is set
    if (process.env.MOCK_LIGHTSPEED_API === "1") {
      const testId = process.env.TEST_ID || "e2e";
      if (process.env.TEST_LIGHTSPEED_URL) {
        console.log(
          "[Lightspeed Mock] MOCK_LIGHTSPEED_API is true, the existing TEST_LIGHTSPEED_URL envvar will be ignored!",
        );
      }
      try {
        await startMockLightspeedServer(testId);
      } catch (err) {
        console.error(`[Lightspeed Mock] Failed to start server: ${err}`);
        throw err;
      }
    }
  },

  // Delete test fixture settings.json after all tests complete
  async afterAll() {
    const settingsPath = path.join("test/testFixtures/.vscode/settings.json");
    try {
      if (fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath);
      }
    } catch (err) {
      console.warn(`Error deleting settings file: ${err}`);
    }

    // Stop mock Lightspeed server if it was started
    if (process.env.MOCK_LIGHTSPEED_API === "1") {
      try {
        await stopMockLightspeedServer();
      } catch (err) {
        console.warn(`[Lightspeed Mock] Error stopping server: ${err}`);
      }
    }
  },
};
