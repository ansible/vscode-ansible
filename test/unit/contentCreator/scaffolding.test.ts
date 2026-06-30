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

vi.mock("@src/settings", () => {
  class MockSettingsManager {
    initialize = vi.fn().mockResolvedValue(undefined);
  }
  return {
    SettingsManager: MockSettingsManager,
  };
});

import * as vscode from "vscode";
import { WebviewMessageHandlers } from "@src/features/lightspeed/vue/views/webviewMessageHandlers";

describe("Content Creator Scaffolding", () => {
  let messageHandlers: WebviewMessageHandlers;
  let mockContext: vscode.ExtensionContext;
  let tempDir: string;
  let templateDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "devcontainer-test-"),
    );
    templateDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "template-test-"),
    );

    mockContext = {
      extensionUri: {
        fsPath: templateDir,
        toString: () => `file://${templateDir}`,
      } as vscode.Uri,
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    vi.mocked(vscode.Uri.joinPath).mockImplementation(
      (base: vscode.Uri, ...pathSegments: string[]) => {
        const joined = path.join(base.fsPath, ...pathSegments);
        return {
          fsPath: joined,
          toString: () => `file://${joined}`,
        } as vscode.Uri;
      },
    );

    messageHandlers = new WebviewMessageHandlers();
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    await fs.promises.rm(templateDir, { recursive: true, force: true });
  });

  describe("scaffoldDevcontainerStructure", () => {
    beforeEach(async () => {
      await fs.promises.writeFile(
        path.join(templateDir, "devcontainer.json.j2"),
        `{
  "name": "Ansible Development Environment",
  "image": "{{ dev_container_image }}",
  "customizations": {
    "vscode": {
      "extensions": {{ recommended_extensions | json }}
    }
  }
}`,
      );

      await fs.promises.mkdir(path.join(templateDir, "docker"), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(templateDir, "docker", "devcontainer.json.j2"),
        `{
  "name": "Docker variant",
  "dockerFile": "Dockerfile",
  "image": "{{ dev_container_image }}"
}`,
      );

      await fs.promises.mkdir(path.join(templateDir, "podman"), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(templateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman variant",
  "image": "{{ dev_container_image }}"
}`,
      );
    });

    it("should scaffold root devcontainer.json from .j2 template", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
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
    });

    it("should scaffold docker variant in subdirectory", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
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
      expect(parsed.dockerFile).toBe("Dockerfile");
      expect(parsed.name).toBe("Docker variant");
    });

    it("should scaffold podman variant in subdirectory", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
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
      expect(parsed.name).toBe("Podman variant");
    });

    it("should remove .j2 extension from output files", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "test-image",
        [],
      );

      expect(fs.existsSync(path.join(tempDir, "devcontainer.json"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "devcontainer.json.j2"))).toBe(
        false,
      );

      expect(
        fs.existsSync(path.join(tempDir, "docker", "devcontainer.json")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, "docker", "devcontainer.json.j2")),
      ).toBe(false);
    });

    it("should create subdirectories if they don't exist", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "test-image",
        [],
      );

      expect(fs.existsSync(path.join(tempDir, "docker"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "podman"))).toBe(true);
    });

    it("should replace {{ dev_container_image }} variable", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
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
        templateDir,
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
        templateDir,
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

    it("should add --pull=newer to podman runArgs when pullNewer is true", async () => {
      await fs.promises.writeFile(
        path.join(templateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman variant",
  "image": "{{ dev_container_image }}",
  "runArgs": ["--cap-add=SYS_ADMIN", "--userns=host"]
}`,
      );

      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        [],
        true,
      );

      const podmanConfig = await fs.promises.readFile(
        path.join(tempDir, "podman", "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(podmanConfig);

      expect(parsed.runArgs).toContain("--pull=newer");
      expect(parsed.runArgs).toContain("--cap-add=SYS_ADMIN");
      expect(parsed.runArgs).toContain("--userns=host");
    });

    it("should not add --pull=newer to podman runArgs when pullNewer is false", async () => {
      await fs.promises.writeFile(
        path.join(templateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman variant",
  "image": "{{ dev_container_image }}",
  "runArgs": ["--cap-add=SYS_ADMIN"]
}`,
      );

      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        [],
        false,
      );

      const podmanConfig = await fs.promises.readFile(
        path.join(tempDir, "podman", "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(podmanConfig);

      expect(parsed.runArgs).not.toContain("--pull=newer");
    });

    it("should not add --pull=newer to non-podman variants", async () => {
      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        ["redhat.ansible"],
        true,
      );

      const rootConfig = await fs.promises.readFile(
        path.join(tempDir, "devcontainer.json"),
        "utf8",
      );
      expect(rootConfig).not.toContain("--pull=newer");

      const dockerConfig = await fs.promises.readFile(
        path.join(tempDir, "docker", "devcontainer.json"),
        "utf8",
      );
      expect(dockerConfig).not.toContain("--pull=newer");
    });

    it("should create runArgs array when pullNewer is true and podman template has no runArgs", async () => {
      await fs.promises.writeFile(
        path.join(templateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman variant",
  "image": "{{ dev_container_image }}"
}`,
      );

      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
        tempDir,
        "quay.io/ansible/creator-ee:latest",
        [],
        true,
      );

      const podmanConfig = await fs.promises.readFile(
        path.join(tempDir, "podman", "devcontainer.json"),
        "utf8",
      );
      const parsed = JSON.parse(podmanConfig);

      expect(parsed.runArgs).toEqual(["--pull=newer"]);
    });

    it("should not create files for missing templates", async () => {
      await fs.promises.rm(path.join(templateDir, "podman"), {
        recursive: true,
        force: true,
      });

      await messageHandlers["scaffoldDevcontainerStructure"](
        templateDir,
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
      ).toBe(false);
    });
  });

  describe("createDevcontainer", () => {
    beforeEach(async () => {
      const devcontainerTemplateDir = path.join(
        templateDir,
        "resources/contentCreator/createDevcontainer/.devcontainer",
      );
      await fs.promises.mkdir(path.join(devcontainerTemplateDir, "docker"), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(devcontainerTemplateDir, "podman"), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "devcontainer.json.j2"),
        `{
  "name": "Root",
  "image": "{{ dev_container_image }}",
  "customizations": { "vscode": { "extensions": {{ recommended_extensions | json }} } }
}`,
      );
      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "docker", "devcontainer.json.j2"),
        `{
  "name": "Docker",
  "image": "{{ dev_container_image }}"
}`,
      );
      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman",
  "image": "{{ dev_container_image }}",
  "runArgs": ["--userns=host"]
}`,
      );
    });

    it("should pass pullNewer through to scaffolding and add --pull=newer", async () => {
      const result = await messageHandlers["createDevcontainer"](
        tempDir,
        ["redhat.ansible"],
        "ghcr.io/ansible/community-ansible-dev-tools:latest",
        mockContext.extensionUri,
        true,
      );

      expect(result).toBe("passed");

      const podmanConfig = JSON.parse(
        await fs.promises.readFile(
          path.join(tempDir, ".devcontainer", "podman", "devcontainer.json"),
          "utf8",
        ),
      );
      expect(podmanConfig.runArgs).toContain("--pull=newer");
    });

    it("should not add --pull=newer when pullNewer is false", async () => {
      const result = await messageHandlers["createDevcontainer"](
        tempDir,
        ["redhat.ansible"],
        "ghcr.io/ansible/community-ansible-dev-tools:latest",
        mockContext.extensionUri,
        false,
      );

      expect(result).toBe("passed");

      const podmanConfig = JSON.parse(
        await fs.promises.readFile(
          path.join(tempDir, ".devcontainer", "podman", "devcontainer.json"),
          "utf8",
        ),
      );
      expect(podmanConfig.runArgs).not.toContain("--pull=newer");
    });
  });

  describe("runDevcontainerCreateProcess", () => {
    let mockWebview: vscode.Webview;

    beforeEach(async () => {
      mockWebview = {
        postMessage: vi.fn().mockResolvedValue(true),
      } as unknown as vscode.Webview;

      const devcontainerTemplateDir = path.join(
        templateDir,
        "resources/contentCreator/createDevcontainer/.devcontainer",
      );
      await fs.promises.mkdir(path.join(devcontainerTemplateDir, "docker"), {
        recursive: true,
      });
      await fs.promises.mkdir(path.join(devcontainerTemplateDir, "podman"), {
        recursive: true,
      });

      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "devcontainer.json.j2"),
        `{
  "name": "Root",
  "image": "{{ dev_container_image }}",
  "customizations": { "vscode": { "extensions": {{ recommended_extensions | json }} } }
}`,
      );
      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "docker", "devcontainer.json.j2"),
        `{
  "name": "Docker",
  "image": "{{ dev_container_image }}"
}`,
      );
      await fs.promises.writeFile(
        path.join(devcontainerTemplateDir, "podman", "devcontainer.json.j2"),
        `{
  "name": "Podman",
  "image": "{{ dev_container_image }}",
  "runArgs": ["--userns=host"]
}`,
      );
    });

    it("should pass pullNewer from payload to generated podman config", async () => {
      await messageHandlers.runDevcontainerCreateProcess(
        {
          destinationPath: tempDir,
          image: "upstream",
          isOverwritten: false,
          pullNewer: true,
        },
        mockWebview,
        mockContext.extensionUri,
      );

      const podmanConfig = JSON.parse(
        await fs.promises.readFile(
          path.join(tempDir, ".devcontainer", "podman", "devcontainer.json"),
          "utf8",
        ),
      );
      expect(podmanConfig.runArgs).toContain("--pull=newer");
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: "execution-log" }),
      );
    });

    it("should not add --pull=newer when pullNewer is false in payload", async () => {
      await messageHandlers.runDevcontainerCreateProcess(
        {
          destinationPath: tempDir,
          image: "upstream",
          isOverwritten: false,
          pullNewer: false,
        },
        mockWebview,
        mockContext.extensionUri,
      );

      const podmanConfig = JSON.parse(
        await fs.promises.readFile(
          path.join(tempDir, ".devcontainer", "podman", "devcontainer.json"),
          "utf8",
        ),
      );
      expect(podmanConfig.runArgs).not.toContain("--pull=newer");
    });
  });

  describe("createDevfile", () => {
    beforeEach(async () => {
      const devfileDir = path.join(
        templateDir,
        "resources/contentCreator/createDevfile",
      );
      await fs.promises.mkdir(devfileDir, { recursive: true });

      const devfileTemplatePath = path.join(devfileDir, "devfile-template.txt");
      await fs.promises.writeFile(
        devfileTemplatePath,
        `---
schemaVersion: 2.2.2
metadata:
  name: {{ dev_file_name }}
components:
  - name: ansible-dev-container
    container:
      image: {{ dev_file_image }}
      memoryLimit: 2Gi
`,
      );
    });

    it("should create devfile.yaml from template", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      const result = messageHandlers.createDevfile(
        destinationPath,
        "my-project",
        "quay.io/ansible/creator-ee:latest",
        mockContext.extensionUri,
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
        mockContext.extensionUri,
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
        mockContext.extensionUri,
      );

      expect(result).toBe("passed");
      expect(fs.existsSync(path.join(tempDir, "nested", "dir"))).toBe(true);
      expect(fs.existsSync(destinationPath)).toBe(true);
    });

    it("should return 'failed' if template file doesn't exist", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      const originalMock = vi.mocked(vscode.Uri.joinPath);
      vi.spyOn(vscode.Uri, "joinPath").mockReturnValueOnce({
        fsPath: "/nonexistent/template.yaml",
        toString: () => "file:///nonexistent/template.yaml",
      } as vscode.Uri);

      const result = messageHandlers.createDevfile(
        destinationPath,
        "test",
        "test-image",
        mockContext.extensionUri,
      );

      expect(result).toBe("failed");
      expect(fs.existsSync(destinationPath)).toBe(false);

      vi.spyOn(vscode.Uri, "joinPath").mockImplementation(originalMock);
    });

    it("should preserve YAML schema structure", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      messageHandlers.createDevfile(
        destinationPath,
        "my-app",
        "quay.io/ansible/creator-ee:latest",
        mockContext.extensionUri,
      );

      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).toContain("schemaVersion: 2.2.2");
      expect(devfileContent).toContain("components:");
      expect(devfileContent).toContain("container:");
      expect(devfileContent).toContain("memoryLimit: 2Gi");
    });

    it("should overwrite existing devfile", () => {
      const destinationPath = path.join(tempDir, "devfile.yaml");

      fs.writeFileSync(destinationPath, "old content", "utf8");

      const result = messageHandlers.createDevfile(
        destinationPath,
        "new-project",
        "new-image:latest",
        mockContext.extensionUri,
      );

      expect(result).toBe("passed");
      const devfileContent = fs.readFileSync(destinationPath, "utf8");
      expect(devfileContent).not.toContain("old content");
      expect(devfileContent).toContain("new-image:latest");
    });
  });
});
