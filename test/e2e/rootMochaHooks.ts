import { createLogger, format, transports } from "winston";
import path from "path";
import fs from "fs";

type ConsoleMethod = "log" | "info" | "warn" | "error";

process.env = {
  ...process.env,
  NODE_NO_WARNINGS: "1",
  DONT_PROMPT_WSL_INSTALL: "1",
};

const testHome = path.resolve("out/e2e/tmp/home");
fs.mkdirSync(testHome, { recursive: true });
process.env.HOME = testHome;

// Capturing console output and redirecting it to a file to avoid console
// pollution from language server logging during test execution.
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      return `${String(timestamp)} ${String(level)}: ${String(message)}`;
    }),
  ),
  transports: [
    new transports.File({
      filename: path.join("./out/e2e/e2e.log"),
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
  beforeAll() {
    fs.mkdirSync("out/userdata/User/", { recursive: true });
    fs.mkdirSync("out/junit", { recursive: true });
    fs.cpSync(
      "test/testFixtures/settings.json",
      "out/userdata/User/settings.json",
    );
  },

  // Delete test fixture settings.json after all tests complete
  afterAll() {
    const settingsPath = path.join("test/testFixtures/.vscode/settings.json");
    try {
      if (fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath);
      }
    } catch (err) {
      console.warn(
        `Error deleting settings file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
