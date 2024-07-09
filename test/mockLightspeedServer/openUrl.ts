// Based on https://www.npmjs.com/package/openurl
import { spawn } from "child_process";
import { logger, options } from "./server";

export function openUrl(url: string) {
  let command: string;
  if (process.platform === "darwin") {
    command = options.uiTest
      ? "./out/test-resources/Visual Studio Code.app/Contents/MacOS/Electron"
      : "open";
  } else {
    command = options.uiTest
      ? "./out/test-resources/VSCode-linux-x64/bin/code"
      : "xdg-open";
  }

  const start = Date.now();
  logger.info(`openUrl: open ${url} with ${command}`);
  const child = spawn(
    command,
    options.uiTest
      ? ["--open-url", url, "--user-data-dir", "./out/test-resources/settings"]
      : [url],
  );
  let errorText = "";
  child.on("error", function (err) {
    logger.info(`An error occurred at openUrl: ${err}`);
    throw err;
  });
  child.on("exit", function (code, signal) {
    const elapsed = Date.now() - start;
    logger.info(
      `openUrl exited in ${elapsed} msecs ` +
        `with code ${code} and signal ${signal}`,
    );
    child.kill();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", function (data) {
    errorText += data;
  });
  child.stderr.on("end", function () {
    if (errorText) {
      throw new Error(errorText);
    }
  });
}
