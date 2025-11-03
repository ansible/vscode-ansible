import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createInitHandler } from "../../src/tools/creator.js";

describe("creator", () => {
  describe("ansible_create_playbook", () => {
    let tempDir: string;
    let currentDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "vitest-"));
      currentDir = process.cwd();
      process.chdir(tempDir);
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
      process.chdir(currentDir);
    });

    it("should create playbook", async () => {
      // Remove folder from disk, ignore error if it does not exist
      const handler = createInitHandler("playbook");
      const result = await handler({ name: "foo.bar" });
      expect(result.isError).toBeUndefined();
    });

    it("should create playbook (fail)", async () => {
      const handler = createInitHandler("playbook");
      const result = await handler({ name: "foo.bar.ss..s" });
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe("ansible_create_collection", () => {
    let tempDir: string;
    let currentDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "vitest-"));
      currentDir = process.cwd();
      process.chdir(tempDir);
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
      process.chdir(currentDir);
    });

    it("should create collection", async () => {
      // Remove folder from disk, ignore error if it does not exist
      const handler = createInitHandler("collection");
      const result = await handler({ name: "foo.bar" });
      expect(result.isError).toBeUndefined();
    });

    it("create collection (fail)", async () => {
      const handler = createInitHandler("collection");
      const result = await handler({ name: "this.is.invalid.collection.name" });
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });

    it("create collection (fail no name)", async () => {
      const handler = createInitHandler("collection");
      const result = await handler({ name: "" });
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });
  });
});
