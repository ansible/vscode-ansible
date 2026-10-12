import * as path from "node:path";

/**
 * Maps an absolute Windows host path to the corresponding Linux path used
 * inside a Linux execution environment. Non-Windows paths are preserved.
 */
export function mapHostPathToContainerPath(
  hostPath: string,
  isWindowsHost: boolean,
): string {
  if (!isWindowsHost || !path.win32.isAbsolute(hostPath)) {
    return hostPath;
  }

  const normalized = path.win32.normalize(hostPath);
  const drive = normalized.slice(0, 2).toLowerCase();
  const remainder = normalized.slice(2).replace(/\\/g, "/");
  return "/mnt/" + drive[0] + remainder;
}
