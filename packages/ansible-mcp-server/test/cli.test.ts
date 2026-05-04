import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8"));

describe("CLI entry point", () => {
  const binPath = resolve(pkgRoot, pkg.bin);

  it("bin field points to a file that exists after build", () => {
    expect(
      existsSync(binPath),
      `bin target "${pkg.bin}" not found at ${binPath}`,
    ).toBe(true);
  });

  it("bin entry starts and prints usage without errors", () => {
    const output = execFileSync(process.execPath, [binPath], {
      timeout: 10_000,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    expect(output).toContain("Usage:");
  });
});
