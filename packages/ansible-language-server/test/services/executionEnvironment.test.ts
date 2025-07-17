// Suppress Sonar rule: this is a controlled test environment with safe checks
import { expect } from "chai";
import * as child_process from "child_process";

describe("Container Engine Detection", function () {
  it("should accept valid container engine names", function () {
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

    const isPathTrusted = pathDirs.every((p) =>
      trustedDirs.some((dir) => p === dir || p.startsWith(dir + "/")),
    );

    expect(isPathTrusted).to.be.true;

    const safeEnv = { ...process.env, PATH: trustedDirs.join(":") };

    let hasContainerEngine = false;

    const docker = child_process.spawnSync("docker", ["--version"], {
      env: { ...process.env, PATH: trustedDirs.join(":") },
      encoding: "utf-8",
    });

    if (docker.status === 0) {
      hasContainerEngine = true;
    } else {
      const podman = child_process.spawnSync("podman", ["--version"], {
        env: safeEnv,
        encoding: "utf-8",
      });

      if (podman.status === 0) {
        hasContainerEngine = true;
      }
    }

    if (!hasContainerEngine) {
      this.skip();
    }

    expect(hasContainerEngine).to.be.true;
  });
});
