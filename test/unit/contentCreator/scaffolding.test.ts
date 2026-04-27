import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("vscode", () => ({
  Uri: {
    file: vi.fn((p: string) => ({
      fsPath: p,
      toString: () => `file://${p}`,
    })),
    joinPath: vi.fn(),
  },
}));

vi.mock("@src/extension", () => {
  return {
    lightSpeedManager: {},
  };
});

vi.mock("@src/features/lightspeed/vue/views/fileOperations", () => {
  class MockFileOperations {
    openLogFile = vi.fn();
    openFolderInWorkspaceDevcontainer = vi.fn();
    openDevfile = vi.fn();
  }
  return {
    FileOperations: MockFileOperations,
  };
});

vi.mock("@src/features/lightspeed/vue/views/ansibleCreatorUtils", () => {
  class MockAnsibleCreatorOperations {
    isADEPresent = vi.fn().mockResolvedValue(true);
  }
  return {
    AnsibleCreatorOperations: MockAnsibleCreatorOperations,
  };
});

import { WebviewMessageHandlers } from "@src/features/lightspeed/vue/views/webviewMessageHandlers";

describe("Content Creator Scaffolding", () => {
  let messageHandlers: WebviewMessageHandlers;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "scaffolding-test-"),
    );

    messageHandlers = new WebviewMessageHandlers();
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("scaffoldDevcontainerStructure", () => {
    it("should scaffold root devcontainer.json", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        ["redhat.ansible", "ms-python.python"],
      );

      const rootConfigPath = path.join(tempDir, "devcontainer.json");
      expect(fs.existsSync(rootConfigPath)).toBe(true);

      const rootConfig = await fs.promises.readFile(rootConfigPath, "utf8");
      const parsed = JSON.parse(rootConfig);

      expect(parsed.image).toBe("quay.io/ansible/creator-ee:latest");
      expect(parsed.customizations.vscode.extensions).toEqual([
        "redhat.ansible",
        "ms-python.python",
      ]);
      expect(parsed.name).toBe("ansible-dev-container-codespaces");
    });

    it("should scaffold docker variant in subdirectory", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        ["redhat.ansible"],
      );

      const dockerConfigPath = path.join(
        tempDir,
        "docker",
        "devcontainer.json",
      );
      expect(fs.existsSync(dockerConfigPath)).toBe(true);

      const dockerConfig = await fs.promises.readFile(dockerConfigPath, "utf8");
      const parsed = JSON.parse(dockerConfig);

      expect(parsed.image).toBe("quay.io/ansible/creator-ee:latest");
      expect(parsed.name).toBe("ansible-dev-container-docker");
    });

    it("should scaffold podman variant in subdirectory", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        [],
      );

      const podmanConfigPath = path.join(
        tempDir,
        "podman",
        "devcontainer.json",
      );
      expect(fs.existsSync(podmanConfigPath)).toBe(true);

      const podmanConfig = await fs.promises.readFile(podmanConfigPath, "utf8");
      const parsed = JSON.parse(podmanConfig);

      expect(parsed.image).toBe("quay.io/ansible/creator-ee:latest");
      expect(parsed.name).toBe("ansible-dev-container-podman");
    });

    it("should create all three variant files", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "test-image",
        [],
      );

      expect(fs.existsSync(path.join(tempDir, "devcontainer.json"))).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, "docker", "devcontainer.json")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, "podman", "devcontainer.json")),
      ).toBe(true);
    });

    it("should create subdirectories if they don't exist", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "test-image",
        [],
      );

      expect(fs.existsSync(path.join(tempDir, "docker"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "podman"))).toBe(true);
    });

    it("should replace {{ dev_container_image }} variable", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "custom-image:v1.0",
        [],
      );

      const rootConfig = await fs.promises.readFile(
        path.join(tempDir, "devcontainer.json"),
        "utf8",
      );
      expect(rootConfig).toContain("custom-image:v1.0");
      expect(rootConfig).not.toContain("{{ dev_container_image }}");
    });

    it("should replace {{ recommended_extensions | json }} variable", async () => {
      const extensions = [
        "redhat.ansible",
        "ms-python.python",
        "ms-vscode.docker",
      ];

      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "test-image",
        extensions,
      );

      const rootConfig = await fs.promises.readFile(
        path.join(tempDir, "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(rootConfig);

      expect(parsed.customizations.vscode.extensions).toEqual(extensions);
      expect(rootConfig).not.toContain("{{ recommended_extensions | json }}");
    });

    it("should handle empty recommended_extensions array", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "test-image",
        [],
      );

      const rootConfig = await fs.promises.readFile(
        path.join(tempDir, "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(rootConfig);

      expect(parsed.customizations.vscode.extensions).toEqual([]);
    });

    it("should include container security settings", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        tempDir,
        "test-image",
        [],
      );

      const rootConfig = await fs.promises.readFile(
        path.join(tempDir, "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(rootConfig);

      expect(parsed.containerUser).toBe("root");
      expect(parsed.runArgs).toContain("--hostname=ansible-dev-container");
    });
  });

  describe("createDevfile", () => {
    it("should create devfile.yaml from embedded template", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      const result = messageHandlers.createDevfile(
        destinationPath,
        "my-project",
        "quay.io/ansible/creator-ee:latest",
      );

      expect(result).toBe("passed");
      expect(fs.existsSync(destinationPath)).toBe(true);

      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).toContain("my-project-");
      expect(devfileContent).toContain("quay.io/ansible/creator-ee:latest");
      expect(devfileContent).not.toContain("{{ dev_file_name }}");
      expect(devfileContent).not.toContain("{{ dev_file_image }}");
    });

    it("should append UUID to devfile name", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      messageHandlers.createDevfile(
        destinationPath,
        "test-project",
        "test-image",
      );

      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).toMatch(/name: test-project-[a-f0-9]{8}/);
    });

    it("should create parent directories if they don't exist", () => {
      const destinationPath = path.join(
        tempDir,
        "nested",
        "dir",
        "devfile.yaml",
      );

      const result = messageHandlers.createDevfile(
        destinationPath,
        "test",
        "test-image",
      );

      expect(result).toBe("passed");
      expect(fs.existsSync(path.join(tempDir, "nested", "dir"))).toBe(true);
      expect(fs.existsSync(destinationPath)).toBe(true);
    });

    it("should preserve YAML schema structure", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      messageHandlers.createDevfile(
        destinationPath,
        "my-app",
        "quay.io/ansible/creator-ee:latest",
      );

      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).toContain("schemaVersion: 2.2.2");
      expect(devfileContent).toContain("components:");
      expect(devfileContent).toContain("container:");
      expect(devfileContent).toContain("memoryLimit: 6Gi");
      expect(devfileContent).toContain("tooling-container");
    });

    it("should overwrite existing devfile", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      fs.writeFileSync(destinationPath, "old content", "utf8");

      const result = messageHandlers.createDevfile(
        destinationPath,
        "new-project",
        "new-image:latest",
      );

      expect(result).toBe("passed");
      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).not.toContain("old content");
      expect(devfileContent).toContain("new-image:latest");
    });

    it("should work without any external template files", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      const result = messageHandlers.createDevfile(
        destinationPath,
        "standalone",
        "my-image:v1",
      );

      expect(result).toBe("passed");
      const content = fs.readFileSync(destinationPath, "utf8");
      expect(content).toContain("standalone-");
      expect(content).toContain("my-image:v1");
      expect(content).toContain("KUBEDOCK_ENABLED");
    });
  });
});
