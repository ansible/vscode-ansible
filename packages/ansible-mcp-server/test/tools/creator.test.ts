import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createProjectsHandler } from "../../src/tools/creator.js";

describe("creator", () => {
  describe("create_ansible_projects - playbook", () => {
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

    it("should create playbook project", async () => {
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "playbook",
        namespace: "foo",
        collectionName: "bar",
        projectDirectory: "test_playbook",
      });
      expect(result.isError).toBeUndefined();
    });

    it("should create playbook project (fail - invalid collection name)", async () => {
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "playbook",
        namespace: "foo",
        collectionName: "bar.ss..s",
        projectDirectory: "test_playbook",
      });
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe("create_ansible_projects - collection", () => {
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
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "bar",
        projectDirectory: "test_collection",
      });
      expect(result.isError).toBeUndefined();
    });

    it("create collection (fail - invalid collection name)", async () => {
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "collection",
        namespace: "this",
        collectionName: "is.invalid.collection.name",
        projectDirectory: "test_collection",
      });
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });

    it("create collection (fail - missing namespace)", async () => {
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "collection",
        collectionName: "bar",
        projectDirectory: "test_collection",
      });
      // Should prompt for namespace, not error
      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
    });

    it("create collection (fail - missing collection name)", async () => {
      const handler = createProjectsHandler(tempDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        projectDirectory: "test_collection",
      });
      // Should prompt for collection name, not error
      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
    });
  });
});
