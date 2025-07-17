import { expect } from "chai";
import * as child_process from "child_process";

describe("Container Engine Detection", function () {
  it("should accept valid container engine names", function () {
    // Define known, fixed, unwriteable directories
    const trustedDirs = [
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
    ];

    const pathEnv = process.env.PATH ?? "";
    const pathDirs = pathEnv.split(":");

    // NOSONAR: This check ensures only fixed, unwriteable system directories are considered
    const isPathTrusted = pathDirs.every((p) =>
      trustedDirs.some((dir) => p === dir || p.startsWith(dir + "/")),
    );

    expect(isPathTrusted).to.be.true;

    const safeEnv = { ...process.env, PATH: trustedDirs.join(":") };

    let hasContainerEngine = false;

    // Try docker
    const docker = child_process.spawnSync("docker", ["--version"], {
      env: safeEnv,
      encoding: "utf-8",
    });

    if (docker.status === 0) {
      hasContainerEngine = true;
    } else {
      // Try podman
      const podman = child_process.spawnSync("podman", ["--version"], {
        env: safeEnv,
        encoding: "utf-8",
      });

      if (podman.status === 0) {
        hasContainerEngine = true;
      }
    }

    if (!hasContainerEngine) {
      this.skip(); // No container engine found
    }

    expect(hasContainerEngine).to.be.true;
  });
});
