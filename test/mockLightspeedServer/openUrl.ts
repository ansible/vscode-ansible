// Based on https://www.npmjs.com/package/openurl
import { spawn } from "child_process";
import { logger } from "./server";

const command =
  process.platform === "darwin"
    ? "open"
    : process.env.UI_TEST // for supporting authentication UI tests on Linux
      ? "./out/test-resources/VSCode-linux-x64/bin/code"
      : "xdg-open";

export function openUrl(url: string) {
  const start = Date.now();
  logger.info(`openUrl: open ${url} with ${command}`);
  const child = spawn(
    command,
    process.env.UI_TEST
      ? ["--open-url", url, "--user-data-dir", "./out/test-resources/settings"]
      : [url],
  );
  let errorText = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", function (data) {
    errorText += data;
  });
  child.stderr.on("end", function () {
    if (errorText) {
      throw new Error(errorText);
    }
    const elapsed = Date.now() - start;
    logger.info(`openUrl: completed in ${elapsed} msecs`);
  });
}
