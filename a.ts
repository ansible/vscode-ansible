// Functions for detecting presence of WSL, Docker, and Podman.
"use strict";
import os from "os";
import fs from "fs";

let isDockerCached: boolean | undefined = undefined;
let isPodmanCached: boolean | undefined = undefined;
let containerEngineCached: string | undefined = undefined;
let wslCached: number | undefined = undefined;

export default function isDocker() {
  function hasDockerEnv() {
    try {
      fs.statSync("/.dockerenv");
      return true;
    } catch {
      return false;
    }
  }

  function hasDockerCGroup() {
    try {
      return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
    } catch {
      return false;
    }
  }

  if (isDockerCached === undefined) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }

  return isDockerCached;
}

function isPodman() {
  if (isPodmanCached === undefined) {
    try {
      fs.statSync("/run/.containerenv");
      isPodmanCached = true;
    } catch {
      isPodmanCached = false;
    }
  }

  return isPodmanCached;
}

function getContainerEngine(): string | undefined {
  if (containerEngineCached === undefined) {
    if (isDocker()) {
      containerEngineCached = "docker";
    } else if (isPodman()) {
      containerEngineCached = "podman";
    }
  }
  return containerEngineCached;
}

function getWsl(): number {
  if (wslCached === undefined) {
    if (process.platform !== "linux") {
      wslCached = 0;
    } else {
      const os_release = os.release().toLowerCase();
      if (os_release.includes("wsl2")) {
        wslCached = 2;
      } else if (os_release.includes("microsoft")) {
        if (isDocker()) {
          wslCached = 0;
        }
        wslCached = 1;
      } else {
        try {
          if (
            !isDocker() &&
            fs
              .readFileSync("/proc/version", "utf8")
              .toLowerCase()
              .includes("microsoft")
          ) {
            wslCached = 1;
          } else {
            wslCached = 0;
          }
        } catch (_) {
          wslCached = 0;
        }
      }
    }
  }
  return wslCached;
}

if (require.main === module) {
  console.log("Called directly...");
  for (let i = 0; i < 3; i++) {
    console.log(
      `getWsl:${getWsl()} isDocker:${isDocker()} isPodman:${isPodman()} getContainerEngine:${getContainerEngine()}`
    );
  }
}
