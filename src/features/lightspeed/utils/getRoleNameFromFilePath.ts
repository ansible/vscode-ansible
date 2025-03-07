import * as path from "path";

export function getRoleNameFromFilePath(filePath: string): string {
  const fileNameParts = filePath.split(path.sep);
  const rolesIndex = fileNameParts.lastIndexOf("roles");

  if (rolesIndex >= 0 && rolesIndex + 1 < fileNameParts.length) {
    return fileNameParts[rolesIndex + 1];
  }

  return "";
}
