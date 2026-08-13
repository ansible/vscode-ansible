import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveResourcePath } from "@src/utils/resourcePath.js";

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
