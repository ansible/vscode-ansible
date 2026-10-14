import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_ROOT } from "@test/setup";
import {
  ALS_DIST_REL,
  assertAlsDistComplete,
  extractVsixExtensionRoot,
  findSingleVsix,
  smokeAlsCli,
} from "@root/tools/als-packaging.mts";
import {
  requirePathOnCi,
  requireVsixOnCi,
} from "@test/unit/als/alsPackagingTestUtils";

const alsPackageDir = path.join(
  PROJECT_ROOT,
  "packages",
  "ansible-language-server",
);
const alsDistDir = path.join(alsPackageDir, "dist");
const alsCliPath = path.join(alsDistDir, "cli.cjs");

function resolveVsixPath(): string | undefined {
  const outDir = path.join(PROJECT_ROOT, "out");
  if (!fs.existsSync(outDir)) {
    return undefined;
  }
  try {
    return findSingleVsix(outDir);
  } catch {
    return undefined;
  }
}

describe("ALS packaging", function () {
  describe(".vscodeignore includes ALS dist files", function () {
    const vscodeignore = fs.readFileSync(
      path.join(PROJECT_ROOT, ".vscodeignore"),
      "utf8",
    );

    it("should whitelist ALS dist files", function () {
      expect(vscodeignore).toContain(
        "!packages/ansible-language-server/dist/**/*",
      );
    });
  });

  describe("ALS package structure", function () {
    it("should have package.json with bin pointing at dist/cli.cjs", function () {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(alsPackageDir, "package.json"), "utf8"),
      ) as { name: string; bin: string };
      expect(pkg.name).toBe("@ansible/ansible-language-server");
      expect(pkg.bin).toBe("dist/cli.cjs");
    });
  });

  describe("ALS dist layout after build", function () {
    it("should include cli.cjs, server.cjs, and runtime chunks", function () {
      const hasDist = fs.existsSync(alsCliPath);
      if (
        !requirePathOnCi(
          hasDist,
          "ALS dist missing in CI — ensure `task build` runs before `task unit`",
        )
      ) {
        console.warn(
          "ALS not built yet (dist/cli.cjs missing) - run 'task build' first",
        );
        return;
      }
      expect(() => assertAlsDistComplete(alsDistDir)).not.toThrow();
    });
  });

  describe("packaged VSIX contains complete ALS dist", function () {
    it("should include ALS dist entrypoints inside the VSIX", function () {
      const vsixPath = resolveVsixPath();
      if (
        !requireVsixOnCi(
          vsixPath !== undefined,
          "ansible-*.vsix missing in CI — run `task package` before `task unit` on this runner",
        )
      ) {
        console.warn("No ansible-*.vsix in out/ - run 'task package' first");
        return;
      }
      if (vsixPath === undefined) {
        return;
      }

      const { extensionRoot, cleanup } = extractVsixExtensionRoot(vsixPath);
      try {
        expect(() =>
          assertAlsDistComplete(path.join(extensionRoot, ALS_DIST_REL)),
        ).not.toThrow();
      } finally {
        cleanup();
      }
    });
  });

  describe("packaged ALS CLI smoke", function () {
    it("should start --stdio without MODULE_NOT_FOUND from workspace dist", async function () {
      const hasDist = fs.existsSync(alsCliPath);
      if (
        !requirePathOnCi(
          hasDist,
          "ALS dist missing in CI — ensure `task build` runs before `task unit`",
        )
      ) {
        console.warn("ALS not built — skipping CLI smoke");
        return;
      }
      await expect(
        smokeAlsCli(alsCliPath, alsPackageDir),
      ).resolves.toBeUndefined();
    });

    it("should start --stdio from extracted VSIX layout", async function () {
      const vsixPath = resolveVsixPath();
      if (
        !requireVsixOnCi(
          vsixPath !== undefined,
          "ansible-*.vsix missing in CI — run `task package` before `task unit` on this runner",
        )
      ) {
        console.warn("No VSIX — skipping packaged CLI smoke");
        return;
      }
      if (vsixPath === undefined) {
        return;
      }

      const { extensionRoot, cleanup } = extractVsixExtensionRoot(vsixPath);
      try {
        const cliPath = path.join(extensionRoot, ALS_DIST_REL, "cli.cjs");
        await expect(
          smokeAlsCli(cliPath, extensionRoot),
        ).resolves.toBeUndefined();
      } finally {
        cleanup();
      }
    });
  });
});
