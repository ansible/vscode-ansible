import { afterEach, describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveResourceInDir,
  resolveResourcePath,
} from "@src/utils/resourcePath.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("resolveResourcePath", () => {
  const expectedAgentsPath = path.join(
    packageRoot,
    "src",
    "resources",
    "data",
    "agents.md",
  );

  it("resolves an existing resource via utils-to-resources fallback", async () => {
    // Under Vitest, __dirname short-circuits getResourceBaseDir to src/utils,
    // then resolveResourcePath falls back to src/resources/data/.
    const result = await resolveResourcePath("agents.md");
    expect(result).toBe(expectedAgentsPath);
  });

  it("throws a descriptive error when the resource file is missing", async () => {
    await expect(resolveResourcePath("does-not-exist.md")).rejects.toThrow(
      /Could not resolve resource path[\s\S]*Base directory:/,
    );
  });
});

describe("resolveResourceInDir", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  // Mirrors the packaged layout: chunks in dist/utils/ and dist/resources/,
  // resource files copied to dist/data/.
  it.each(["utils", "resources"])(
    "resolves data/ next to dist/%s in the bundled layout",
    async (chunkDir) => {
      tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-resource-"));
      const dist = path.join(tmpRoot, "dist");
      await fs.mkdir(path.join(dist, chunkDir), { recursive: true });
      await fs.mkdir(path.join(dist, "data"));
      await fs.writeFile(path.join(dist, "data", "agents.md"), "# agents\n");

      const result = await resolveResourceInDir(
        path.join(dist, chunkDir),
        "agents.md",
      );
      expect(result).toBe(path.join(dist, "data", "agents.md"));
    },
  );
});
