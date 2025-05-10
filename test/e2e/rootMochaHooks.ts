import * as cp from "child_process";

const PRETEST_ERR_RC = 2;

process.env = {
  ...process.env,
  NODE_NO_WARNINGS: "1",
  DONT_PROMPT_WSL_INSTALL: "1",
};

// display ansible-lint version and exit testing if ansible-lint is absent
const command = "ansible-lint --version";
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
