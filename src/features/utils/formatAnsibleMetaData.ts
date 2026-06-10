/* eslint-disable  @typescript-eslint/no-explicit-any */
import { MarkdownString, workspace } from "vscode";
import * as os from "os";
import * as path from "path";

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export interface FormattedAnsibleMetaData {
  metaData: Record<string, unknown>;
  markdown: MarkdownString;
  ansiblePresent: boolean;
  ansibleLintPresent: boolean;
  eeEnabled?: boolean;
}

export function formatAnsibleMetaData(
  ansibleMetaData: unknown,
): FormattedAnsibleMetaData {
  let mdString = "";
  let ansiblePresent = true;
  let ansibleLintPresent = true;
  let eeEnabled = false;

  const WARNING_COLOR = "#FFEF4A";
  const WARNING_STYLE = `style="color:${WARNING_COLOR};"`;

  // check if ansible is missing
  const ansibleInfo = asRecord(
    asRecord(ansibleMetaData)["ansible information"],
  );
  if (Object.keys(ansibleInfo).length === 0) {
    ansiblePresent = false;
    mdString += "#### $(close) Ansible not found in the environment\n";

    // if python exists
    const pythonInfo = asRecord(
      asRecord(ansibleMetaData)["python information"],
    );
    if (Object.keys(pythonInfo).length !== 0) {
      const obj = pythonInfo;
      mdString += `Python version used: \`${String(obj["version"])}\` from \`${String(obj["location"])}\``;
    }

    const markdown = new MarkdownString(mdString, true);
    markdown.supportHtml = true;
    markdown.isTrusted = true;

    return {
      metaData: asRecord(ansibleMetaData),
      markdown,
      ansiblePresent,
      ansibleLintPresent,
    };
  }

  const metaDataRoot = asRecord(ansibleMetaData);

  // check if ee is enabled or not
  if (metaDataRoot["execution environment information"]) {
    eeEnabled = true;
  }

  // check is ansible-lint is missing
  if (
    Object.keys(asRecord(metaDataRoot["ansible-lint information"])).length === 0
  ) {
    ansibleLintPresent = false;
  }

  mdString += eeEnabled
    ? `### Ansible meta data (in Execution Environment)\n`
    : `### Ansible meta data\n`;
  mdString += `\n<hr>\n`;
  mdString += `<hr>\n`;
  mdString += `<hr>\n`;

  // check if ansible-lint is enabled or not
  const lintEnabled = workspace
    .getConfiguration("ansible.validation.lint")
    .get("enabled");

  const root = metaDataRoot;
  Object.keys(root).forEach((mainKey) => {
    const section = asRecord(root[mainKey]);
    if (Object.keys(section).length === 0) {
      return;
    }
    // put a marker stating ansible-lint setting is disabled
    if (mainKey === "ansible-lint information" && !lintEnabled) {
      mdString += `\n**${mainKey}:** `;
      mdString += `*<span ${WARNING_STYLE}>(disabled)*\n`;
    } else {
      mdString += `\n**${mainKey}:** \n`;
    }

    const valueObj = section;
    Object.keys(valueObj).forEach((key) => {
      if (key === "upgrade status") {
        const value = valueObj[key] as string | number | boolean | null;
        if (value != null && String(value).trim().toLowerCase() !== "nil") {
          mdString += ` <span ${WARNING_STYLE}>${String(value)}</span>`;
        }
        return;
      }
      mdString += `\n   - ${key}: `;
      const value = valueObj[key] as any;
      if (Array.isArray(value)) {
        value.forEach((val: any, index: any) => {
          if (val && val !== "None") {
            if (key.includes("path")) {
              mdString += `\n       ${
                index + 1
              }. <a href='${val}'>${getTildePath(val as string)}</a>`;
            } else {
              mdString += `\n       ${index + 1}. ${getTildePath(val as string)}`;
            }
          }
          if (index === value.length - 1) {
            mdString += `\n`;
          }
        });
      } else {
        if (key.includes("path")) {
          mdString += `<a href='${value}'>${getTildePath(value as string)}</a>`;
        } else if (key.includes("version")) {
          const versionInfo = (value as string).split(/\r?\n/); // first part of versionInfo has the version no., the second part has message (if any)
          mdString += `\`${versionInfo[0]}\`\n`;
          if (versionInfo[1]) {
            mdString += `*<span style="color:${WARNING_COLOR};">${versionInfo[1]}*\n`;
          }
        } else if (key.includes("location")) {
          mdString += `${getTildePath(value as string)}\n`;
        } else {
          mdString += `${value}\n`;
        }
      }
    });
    mdString += `\n<hr>\n`;
    mdString += `<hr>\n`;
    mdString += `<hr>\n`;
  });

  // markdown conversion
  const markdown = new MarkdownString(mdString, true);
  markdown.supportHtml = true;
  markdown.isTrusted = true;

  if (!ansibleLintPresent) {
    markdown.appendMarkdown(
      `\n<p><span ${WARNING_STYLE}>$(warning) Warning(s):</p></h5>`,
    );
    markdown.appendMarkdown(`Ansible lint is missing in the environment`);
  }

  return {
    metaData: metaDataRoot,
    markdown,
    ansiblePresent,
    ansibleLintPresent,
    eeEnabled,
  };
}

function getTildePath(absolutePath: string) {
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
