import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as yaml from "yaml";

function directoryContainsSomeRoleDirectories(files: string[]): boolean {
  const roleDirectories = [
    "tasks",
    "handlers",
    "templates",
    "files",
    "vars",
    "defaults",
    "meta",
  ];
  return files.some((file) => roleDirectories.includes(file));
}

export function getObjectKeys(content: string): string[] {
  try {
    const parsedAnsibleDocument = yaml.parse(content);
    const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
    if (typeof lastObject === "object") {
      return Object.keys(lastObject);
    }
  } catch {
    return [];
  }
  return [];
}

export async function isDocumentInRole(
  document: vscode.TextDocument,
): Promise<boolean> {
  const fileNameParts = document.fileName.split("/");
  const rolesIndex = fileNameParts.findIndex((part) => part === "roles");
  if (rolesIndex >= 0 && rolesIndex + 1 < fileNameParts.length) {
    const dir = await fs.readdir(
      fileNameParts.slice(0, rolesIndex + 2).join("/"),
    );

    const containsRoleDirectories = directoryContainsSomeRoleDirectories(dir);
    if (containsRoleDirectories) {
      return true;
    }
  }
  return false;
}

export function isPlaybook(content: string): boolean {
  for (const keyword of getObjectKeys(content)) {
    if (keyword === "hosts") {
      return true;
    }
  }
  return false;
}

export function findTasks(content: string): boolean {
  const tasksTags = ["tasks", "pre_tasks", "post_tasks", "handlers"];
  for (const keyword of getObjectKeys(content)) {
    if (tasksTags.includes(keyword)) {
      return true;
    }
  }
  return false;
}
