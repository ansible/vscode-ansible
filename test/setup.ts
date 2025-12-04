import { existsSync } from "fs";
import path from "path";

function getProjectRoot(): string {
  let currentDir = path.resolve(__dirname);
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Could not find project root (package.json)");
}

export const PROJECT_ROOT = getProjectRoot();