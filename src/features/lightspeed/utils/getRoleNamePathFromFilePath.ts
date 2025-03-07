import * as path from "path";

export function getRoleNamePathFromFilePath(filePath: string): string {
  const fileNameParts = filePath.split(path.sep);
  const rolesIndex = fileNameParts.lastIndexOf("roles");
  if (rolesIndex >= 0 && rolesIndex + 1 < fileNameParts.length) {
    return fileNameParts
      .concat(path.sep)
      .slice(0, rolesIndex + 2)
      .join(path.sep);
  }

  return "";
}
