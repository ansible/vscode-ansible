import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createDefineAndBuildExecutionEnvHandler } from "../../src/handlers.js";
import {
  buildEEStructureFromPrompt,
  generateExecutionEnvironment,
  formatExecutionEnvResult,
} from "../../src/tools/executionEnv.js";
import type { ExecutionEnvResult } from "../../src/tools/executionEnv.js";

describe("Execution Environment Tool", () => {
  describe("Handler - Two-Step Flow", () => {
    let tempDir: string;
    let currentDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "vitest-ee-"));
      currentDir = process.cwd();
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
      process.chdir(currentDir);
    });

    it("should return prompt on first call (without generatedYaml)", async () => {
      const handler = createDefineAndBuildExecutionEnvHandler(tempDir);
      const result = await handler({
        baseImage: "quay.io/fedora/fedora-minimal:42",
        tag: "test-ee:latest",
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Please generate the execution-environment.yml file",
      );
      expect(result.content[0].text).toContain("generatedYaml");
    });

    it("should create file on second call (with generatedYaml)", async () => {
      const handler = createDefineAndBuildExecutionEnvHandler(tempDir);
      const validYaml = `---
version: 3

images:
  base_image:
    name: quay.io/fedora/fedora-minimal:42

dependencies:
  python_interpreter:
    package_system: python3
    python_path: /usr/bin/python3

  ansible_core:
    package_pip: ansible-core

  ansible_runner:
    package_pip: ansible-runner

  galaxy:
    collections:
      - name: ansible.pegasus

additional_build_steps:
  append_base:
    - RUN $PYCMD -m pip install -U pip

options:
  tags:
    - test-ee:latest`;

      const result = await handler({
        baseImage: "quay.io/fedora/fedora-minimal:42",
        tag: "test-ee:latest",
        generatedYaml: validYaml,
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Execution environment file created successfully",
      );

      // Verify file was created
      const filePath = join(tempDir, "execution-environment.yml");
      const fileContent = readFileSync(filePath, "utf8");
      expect(fileContent).toContain("version: 3");
      expect(fileContent).toContain("quay.io/fedora/fedora-minimal:42");
    });

    it("should validate required inputs (baseImage and tag)", async () => {
      const handler = createDefineAndBuildExecutionEnvHandler(tempDir);
      const result = await handler({
        baseImage: "",
        tag: "test-ee:latest",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("baseImage");
      expect(result.content[0].text).toContain("tag");
    });

    it("should handle YAML with markdown code fences", async () => {
      const handler = createDefineAndBuildExecutionEnvHandler(tempDir);
      const yamlWithFences =
        "```yaml\n---\nversion: 3\nimages:\n  base_image:\n    name: quay.io/fedora/fedora-minimal:42\n```";

      const result = await handler({
        baseImage: "quay.io/fedora/fedora-minimal:42",
        tag: "test-ee:latest",
        generatedYaml: yamlWithFences,
      });

      // Should handle code fences and still create file
      expect(result.isError).toBe(false);
      const filePath = join(tempDir, "execution-environment.yml");
      const fileContent = readFileSync(filePath, "utf8");
      expect(fileContent).not.toContain("```");
      expect(fileContent).toContain("version: 3");
    });
  });

  describe("buildEEStructureFromPrompt", () => {
    it("should generate prompt with user requirements", async () => {
      const inputs = {
        baseImage: "quay.io/fedora/fedora-minimal:42",
        tag: "test-ee:latest",
        collections: ["ansible.utils", "amazon.aws"],
        systemPackages: ["git", "vim"],
        pythonPackages: ["boto3"],
      };

      const result = await buildEEStructureFromPrompt(inputs);

      expect(result.prompt).toBeDefined();
      expect(result.prompt).toContain("quay.io/fedora/fedora-minimal:42");
      expect(result.prompt).toContain("test-ee:latest");
      expect(result.prompt).toContain("ansible.utils");
      expect(result.prompt).toContain("amazon.aws");
      expect(result.prompt).toContain("git");
      expect(result.prompt).toContain("boto3");
      expect(result.prompt).toContain("RULES AND GUIDELINES");
      expect(result.prompt).toContain("SAMPLE EE FILE STRUCTURE");
    });

    it("should generate prompt with minimal inputs", async () => {
      const inputs = {
        baseImage: "quay.io/centos/centos:stream10",
        tag: "minimal-ee:latest",
      };

      const result = await buildEEStructureFromPrompt(inputs);

      expect(result.prompt).toBeDefined();
      expect(result.prompt).toContain("quay.io/centos/centos:stream10");
      expect(result.prompt).toContain("minimal-ee:latest");
    });

    it("should include rules and sample in prompt", async () => {
      const inputs = {
        baseImage: "quay.io/fedora/fedora-minimal:42",
        tag: "test-ee:latest",
      };

      const result = await buildEEStructureFromPrompt(inputs);

      expect(result.prompt).toContain("RULES AND GUIDELINES");
      expect(result.prompt).toContain("SAMPLE EE FILE STRUCTURE");
      expect(result.prompt).toContain("USER REQUIREMENTS");
    });
  });

  describe("generateExecutionEnvironment", () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "vitest-ee-gen-"));
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should generate EE file with valid YAML", async () => {
      const validYaml = `---
version: 3

images:
  base_image:
    name: quay.io/fedora/fedora-minimal:42

dependencies:
  python_interpreter:
    package_system: python3
    python_path: /usr/bin/python3

  ansible_core:
    package_pip: ansible-core

  ansible_runner:
    package_pip: ansible-runner

  galaxy:
    collections:
      - name: ansible.pegasus

options:
  tags:
    - test-ee:latest`;

      const result = await generateExecutionEnvironment(
        {
          baseImage: "quay.io/fedora/fedora-minimal:42",
          tag: "test-ee:latest",
        },
        tempDir,
        validYaml,
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toContain("execution-environment.yml");
      expect(result.yamlContent).toBeDefined();
      expect(result.buildCommand).toContain("ansible-builder build");
      expect(result.buildCommand).toContain("test-ee:latest");

      // Verify file exists
      const fileContent = readFileSync(result.filePath, "utf8");
      expect(fileContent).toContain("version: 3");
      expect(fileContent).toContain("quay.io/fedora/fedora-minimal:42");
    });

    it("should use custom destination path", async () => {
      const customPath = join(tempDir, "custom-dir");
      const validYaml = `---
version: 3
images:
  base_image:
    name: quay.io/centos/centos:stream10
dependencies:
  python_interpreter:
    package_system: python3
    python_path: /usr/bin/python3
  ansible_core:
    package_pip: ansible-core
  ansible_runner:
    package_pip: ansible-runner
options:
  tags:
    - custom-ee:latest`;

      const result = await generateExecutionEnvironment(
        {
          baseImage: "quay.io/centos/centos:stream10",
          tag: "custom-ee:latest",
          destinationPath: customPath,
        },
        tempDir,
        validYaml,
      );

      expect(result.success).toBe(true);
      expect(result.filePath).toContain("custom-dir");
      expect(result.filePath).toContain("execution-environment.yml");
    });

    it("should handle YAML with code fences", async () => {
      const yamlWithFences =
        "```yaml\n---\nversion: 3\nimages:\n  base_image:\n    name: test\n```";

      const result = await generateExecutionEnvironment(
        {
          baseImage: "test",
          tag: "test-ee:latest",
        },
        tempDir,
        yamlWithFences,
      );

      expect(result.success).toBe(true);
      const fileContent = readFileSync(result.filePath, "utf8");
      expect(fileContent).not.toContain("```");
    });

    it("should throw error on invalid YAML", async () => {
      const invalidYaml = "version: 3\ninvalid: [unclosed";

      await expect(
        generateExecutionEnvironment(
          {
            baseImage: "test",
            tag: "test-ee:latest",
          },
          tempDir,
          invalidYaml,
        ),
      ).rejects.toThrow();
    });
  });

  describe("formatExecutionEnvResult", () => {
    it("should format result with validation success", () => {
      const result: ExecutionEnvResult = {
        success: true,
        filePath: "/test/path/execution-environment.yml",
        yamlContent: "version: 3\nimages:\n  base_image:\n    name: test",
        message:
          "Execution environment file created successfully at /test/path/execution-environment.yml",
        buildCommand:
          "ansible-builder build --file /test/path/execution-environment.yml --context /test/path/context --tag test-ee:latest",
      };

      const formatted = formatExecutionEnvResult(result);

      expect(formatted).toContain("✅");
      expect(formatted).toContain(
        "Execution environment file created successfully",
      );
      expect(formatted).toContain("✓ The generated file has been validated");
      expect(formatted).toContain("execution-environment.yml");
      expect(formatted).toContain("ansible-builder build");
      expect(formatted).toContain("test-ee:latest");
    });

    it("should format result with validation errors", () => {
      const result: ExecutionEnvResult = {
        success: true,
        filePath: "/test/path/execution-environment.yml",
        yamlContent: "version: 3",
        message: "Execution environment file created successfully",
        buildCommand:
          "ansible-builder build --file /test/path/execution-environment.yml --context /test/path/context --tag test-ee:latest",
        validationErrors: ["/images is required", "/dependencies is required"],
      };

      const formatted = formatExecutionEnvResult(result);

      expect(formatted).toContain("⚠️ **Schema Validation Warnings:**");
      expect(formatted).toContain("/images is required");
      expect(formatted).toContain("/dependencies is required");
      expect(formatted).toContain("may not fully comply with the schema");
    });

    it("should include build command and notes", () => {
      const result: ExecutionEnvResult = {
        success: true,
        filePath: "/test/path/execution-environment.yml",
        yamlContent: "version: 3",
        message: "Execution environment file created successfully",
        buildCommand:
          "ansible-builder build --file /test/path/execution-environment.yml --context /test/path/context --tag test-ee:latest",
      };

      const formatted = formatExecutionEnvResult(result);

      expect(formatted).toContain(
        "🔨 **To build the execution environment image, run:**",
      );
      expect(formatted).toContain("ansible-builder installed");
      expect(formatted).toContain("container runtime");
      expect(formatted).toContain("Additional commands");
    });
  });
});
