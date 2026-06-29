import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createProjectsHandler } from "@src/tools/creator.js";

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

  describe("Path traversal prevention", () => {
    let traversalTestDir: string;

    beforeAll(() => {
      traversalTestDir = mkdtempSync(join(tmpdir(), "vitest-traversal-"));
    });

    afterAll(() => {
      rmSync(traversalTestDir, { recursive: true, force: true });
    });

    it("should reject path parameter outside workspace", async () => {
      const handler = createProjectsHandler(traversalTestDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "bar",
        path: "/tmp/evil-project",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("outside the workspace");
    });

    it("should reject projectDirectory with traversal", async () => {
      const handler = createProjectsHandler(traversalTestDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "bar",
        projectDirectory: "../../etc",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("outside the workspace");
    });
  });

  describe("Input validation for extracted helpers", () => {
    let validationTestDir: string;

    beforeAll(() => {
      validationTestDir = mkdtempSync(join(tmpdir(), "vitest-validation-"));
    });

    afterAll(() => {
      rmSync(validationTestDir, { recursive: true, force: true });
    });

    it("should prompt when projectType is not provided", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        namespace: "foo",
        collectionName: "bar",
        projectDirectory: "test_dir",
      });
      expect(result.content[0].text).toContain(
        "Please specify the project type",
      );
    });

    it("should reject invalid projectType", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "invalid" as "collection",
        namespace: "foo",
        collectionName: "bar",
        projectDirectory: "test_dir",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid project type");
    });

    it("should reject invalid namespace format", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "collection",
        namespace: "My-Org!",
        collectionName: "bar",
        projectDirectory: "test_dir",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid namespace");
    });

    it("should prompt when namespace is empty string", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "playbook",
        namespace: "",
        collectionName: "bar",
        projectDirectory: "test_dir",
      });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("namespace");
    });

    it("should prompt when collectionName is empty string", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "playbook",
        namespace: "foo",
        collectionName: "",
        projectDirectory: "test_dir",
      });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("collectionName");
    });

    it("should reject invalid collectionName format", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "BAR-invalid!",
        projectDirectory: "test_dir",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid collection name");
    });

    it("should prompt when neither projectDirectory nor path is provided", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "bar",
      });
      expect(result.content[0].text).toContain(
        "Please provide a project directory name",
      );
    });

    it("should accept valid path parameter within workspace", async () => {
      const handler = createProjectsHandler(validationTestDir);
      const validPath = join(validationTestDir, "subdir");
      const result = await handler({
        projectType: "collection",
        namespace: "foo",
        collectionName: "bar",
        path: validPath,
      });
      if (result.isError) {
        expect(result.content[0].text).toContain("ansible-creator");
      }
    });
  });
});
