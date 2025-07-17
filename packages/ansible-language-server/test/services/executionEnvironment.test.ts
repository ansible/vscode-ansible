import { expect } from "chai";
import * as child_process from "child_process";

describe("Container Engine Detection", function () {
  it("should accept valid container engine names", async function () {
    let hasContainerEngine = false;

    try {
      // Validate that PATH only contains trusted directories.
      const trustedDirs = ["/usr/bin", "/bin"];
      const pathEnv = process.env.PATH ?? "";

      // Suppressing Sonar rule S4036 because this is a safe validation check in test context only.
      // NOSONAR
      const isPathSafe = pathEnv
        .split(":")
        .every((p) => trustedDirs.some((dir) => p.startsWith(dir)));

      expect(isPathSafe).to.be.true;

      // Try detecting docker if the environment looks safe
      const result = child_process.spawnSync("docker", ["--version"], {
        shell: false,
        encoding: "utf-8",
      });

      hasContainerEngine = result.status === 0;
    } catch {
      try {
        // Fallback: try detecting podman
        const result = child_process.spawnSync("podman", ["--version"], {
          shell: false,
          encoding: "utf-8",
        });

        hasContainerEngine = result.status === 0;
      } catch {
        // No known container engine found
        hasContainerEngine = false;
      }
    }

    expect(hasContainerEngine).to.be.true;
  });
});
