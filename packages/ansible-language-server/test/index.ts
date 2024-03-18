// This file is loaded automatically by mocha during the test run.
import { isWindows } from "./helper";
import { execSync } from "child_process";

// Error code returned if we cannot even start testing:
const PRETEST_ERR_RC = 2;

// isWindows returns false under WSL
if (isWindows()) {
  console.error(
    "ERROR: This project does not support pure Windows, try under WSL2.",
  );
  process.exit(PRETEST_ERR_RC);
}

// We don't require colors in the stdout of the command results.
process.env["NO_COLOR"] = "1";

const command = "ansible-lint --version";
const env = process.env;

try {
  const result = execSync(command, { env: env });
  console.info(`Detected: ${result}`);
} catch (e) {
  console.error(`error: test requisites not met, '${command}' returned ${e}`);
  process.exit(PRETEST_ERR_RC);
}

// TODO: add checks for podman and docker that include their ability to pull and run containers using volume mounts.
