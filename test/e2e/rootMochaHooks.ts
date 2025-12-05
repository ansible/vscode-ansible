import * as cp from "child_process";
import { createLogger, format, transports } from "winston";
import path from "path";

type ConsoleMethod = "log" | "info" | "warn" | "error";

const PRETEST_ERR_RC = 2;

process.env = {
  ...process.env,
  NODE_NO_WARNINGS: "1",
  DONT_PROMPT_WSL_INSTALL: "1",
};

// display ansible-lint version and exit testing if ansible-lint is absent
const command = "ansible-lint --version --offline";
try {
  // ALWAYS use 'shell: true' when we execute external commands inside the
  // extension because some of the tools may be installed in a way that does
  // not make them available without a shell, common examples tools that may
  // do this are: mise, asdf, pyenv.
  const result = cp.spawnSync(command, { shell: true });
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
    `error: test requisites not met, '${command}' returned ${err}\n${env}`,
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
