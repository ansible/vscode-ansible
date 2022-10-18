/* eslint-disable  @typescript-eslint/no-explicit-any */
import { MarkdownString, workspace } from "vscode";
import * as os from "os";
import * as path from "path";

export function formatAnsibleMetaData(ansibleMetaData: any) {
  let mdString = "";
  let ansiblePresent = true;
  let ansibleLintPresent = true;
  let eeEnabled = false;

  // check if ansible is missing
  if (Object.keys(ansibleMetaData["ansible information"]).length === 0) {
    ansiblePresent = false;
    mdString += "#### $(close) Ansible not found in the environment\n";

    // if python exists
    if (Object.keys(ansibleMetaData["python information"]).length !== 0) {
      const obj = ansibleMetaData["python information"];
      mdString += `Python version used: \`${obj["python version"]}\` from \`${obj["python location"]}\``;
    }

    const markdown = new MarkdownString(mdString, true);
    markdown.supportHtml = true;
    markdown.isTrusted = true;

    return {
      metaData: ansibleMetaData,
      markdown,
      ansiblePresent,
      ansibleLintPresent,
      eeEnabled,
    };
  }

  // check if ee is enabled or not
  if (ansibleMetaData["execution environment information"]) {
    eeEnabled = true;
  }

  // check is ansible-lint is missing
  if (Object.keys(ansibleMetaData["ansible-lint information"]).length === 0) {
    ansibleLintPresent = false;
  }

  mdString += eeEnabled
    ? `### Ansible meta data (in Execution Environment)\n`
    : `### Ansible meta data\n`;
  mdString += `\n<hr>\n`;

  // check if ansible-lint is enabled or not
  const lintEnabled = workspace
    .getConfiguration("ansible.validation.lint")
    .get("enabled");

  Object.keys(ansibleMetaData).forEach((mainKey) => {
    if (Object.keys(ansibleMetaData[mainKey]).length === 0) {
      return;
    }
    // put a marker stating ansible-lint setting is disabled
    if (mainKey === "ansible-lint information" && !lintEnabled) {
      mdString += `\n- **${mainKey}:** `;
      mdString += `*<span style="color:#FFEF4A;">(disabled)*\n`;
    } else {
      mdString += `\n- **${mainKey}:** \n`;
    }

    const valueObj = ansibleMetaData[mainKey];
    Object.keys(valueObj).forEach((key) => {
      mdString += `\n   - ${key}: `;
      const value = valueObj[key];
      if (typeof value === "object") {
        value.forEach((val: any, index: any) => {
          if (val && val !== "None") {
            if (key.includes("path")) {
              mdString += `\n       ${
                index + 1
              }. <a href='${val}'>${getTildePath(val)}</a>`;
            } else {
              mdString += `\n       ${index + 1}. ${getTildePath(val)}`;
            }
          }
          if (index === value.length - 1) {
            mdString += `\n`;
          }
        });
      } else {
        if (key.includes("version")) {
          mdString += `\`${value}\`\n`;
        } else if (key.includes("path") || key.includes("location")) {
          mdString += `${getTildePath(value)}\n`;
        } else {
          mdString += `${value}\n`;
        }
      }
    });
    mdString += `\n<hr>\n`;
  });

  // markdown conversion
  const markdown = new MarkdownString(mdString, true);
  markdown.supportHtml = true;
  markdown.isTrusted = true;

  if (!ansibleLintPresent) {
    markdown.appendMarkdown(
      `\n<p><span style="color:#FFEF4A;">$(warning) Warning(s):</p></h5>`
    );
    markdown.appendMarkdown(`Ansible lint is missing in the environment`);
  }

  return {
    metaData: ansibleMetaData,
    markdown,
    ansiblePresent,
    ansibleLintPresent,
    eeEnabled,
  };
}

export function getTildePath(absolutePath: string) {
  if (process.platform === "win32") {
    return path.win32.resolve(absolutePath);
  }
  const home = os.homedir();
  const dirPath = path.posix.resolve(absolutePath);

  if (dirPath === home) {
    return "~";
  }
  const homeWithTrailingSlash = `${home}/`;

  if (dirPath.startsWith(homeWithTrailingSlash)) {
    return dirPath.replace(homeWithTrailingSlash, "~/");
  }

  return dirPath;
}
