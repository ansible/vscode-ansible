import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export function getExpandedPath(filePath: string, basePath?: string): string {
  if (basePath && !path.isAbsolute(filePath)) {
    filePath = path.join(basePath, filePath);
  }

  filePath = filePath.replace(/^~(?=$|\/|\\)/, os.homedir());
  filePath = path.resolve(filePath);
  return filePath;
}

export function isFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (error) {
    console.error(`Error checking if ${filePath} is a file: ${error}`);
    return false;
  }
}
