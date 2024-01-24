// Based on https://www.npmjs.com/package/openurl
import { spawn } from "child_process";

const command = process.platform === "darwin" ? "open" : "xdg-open";

export function openurl(url: string) {
  const child = spawn(command, [url]);
  let errorText = "";
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
