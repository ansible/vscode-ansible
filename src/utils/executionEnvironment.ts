import * as child_process from "child_process";

export function getContainerEngine(containerEngine: string): string {
  let engine = containerEngine;
  if (engine !== "auto") {
    return engine;
  }

  let isCEFound = false;
  for (const ce of ["podman", "docker"]) {
    const result = child_process.spawnSync("which", [ce], {
      encoding: "utf-8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) {
      continue;
    }
    engine = ce;
    isCEFound = true;
    break;
  }
  if (!isCEFound) {
    console.error(
      "Supported container engine not found, set it explicitly to podman",
    );
    engine = "podman";
  }
  console.log(`Container engine set to: '${engine}'`);
  return engine;
}
