import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolveBuiltResourcePath,
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

  it("falls back to the built-output layout", async () => {
    // Only the dist/ layout, data/ one level above the module directory.
    const builtPath = path.join(packageRoot, "src", "data", "agents.md");
    const access = vi
      .spyOn(fsPromises, "access")
      .mockImplementation(async (file) => {
        if (file !== builtPath) {
          throw new Error(`ENOENT: ${String(file)}`);
        }
      });
    try {
      expect(await resolveResourcePath("agents.md")).toBe(builtPath);
    } finally {
      access.mockRestore();
    }
  });

  it("throws a descriptive error when the resource file is missing", async () => {
    await expect(resolveResourcePath("does-not-exist.md")).rejects.toThrow(
      /Could not resolve resource path[\s\S]*Base directory:/,
    );
  });
});

describe("resolveBuiltResourcePath", () => {
  // Same layout as the build: dist/data/ next to dist/utils/ and
  // dist/resources/, lib/resources/data/ next to lib/utils/.
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-resource-path-"));
    for (const dir of ["dist/utils", "dist/resources", "lib/utils"]) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    for (const dir of ["dist/data", "lib/resources/data"]) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, "agents.md"), "");
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ["dist/utils", "dist/data"],
    ["dist/resources", "dist/data"],
    ["lib/utils", "lib/resources/data"],
  ])("finds the data of %s in %s", async (from, dataDir) => {
    const result = await resolveBuiltResourcePath(
      path.join(root, from),
      "agents.md",
    );
    expect(result).toBe(path.join(root, dataDir, "agents.md"));
  });

  it("returns undefined when the resource is missing", async () => {
    const result = await resolveBuiltResourcePath(
      path.join(root, "dist/utils"),
      "does-not-exist.md",
    );
    expect(result).toBeUndefined();
  });
});

describe("resolveResourcePath in the build output", () => {
  // Under Vitest the source tree is used, so load the built modules in a
  // separate node process, where they see their real location on disk.
  const builds = [
    ["dist", "cjs"],
    ["dist", "js"],
    ["lib", "cjs"],
    ["lib", "js"],
  ] as const;

  it.each(builds)("%s/*.%s loads the bundled resource files", (dir, ext) => {
    const load = (name: string) => {
      const file = path.join(packageRoot, dir, "resources", `${name}.${ext}`);
      if (ext === "cjs") {
        return `require(${JSON.stringify(file)})`;
      }
      return `await import(${JSON.stringify(pathToFileURL(file).href)})`;
    };
    const script = [
      `const agents = ${load("agents")};`,
      `const ee = ${load("eeSchema")};`,
      "await agents.getFullAgentsGuidelines();",
      "await ee.getEERules();",
      "await ee.getSampleExecutionEnvironment();",
      "await ee.getExecutionEnvironmentSchema();",
      'console.log("ok");',
    ].join("\n");
    const output = execFileSync(
      process.execPath,
      ext === "cjs"
        ? ["-e", `(async () => {\n${script}\n})();`]
        : ["--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(output.trim()).toBe("ok");
  });
});
