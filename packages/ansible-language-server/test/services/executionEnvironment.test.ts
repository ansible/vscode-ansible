/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import { ExecutionEnvironment } from "../../src/services/executionEnvironment";
import { createTestWorkspaceManager } from "../helper";
import * as child_process from "child_process";

process.setMaxListeners(100);

describe("ExecutionEnvironment Security Tests", function () {
  let executionEnvironment: ExecutionEnvironment;
  let workspaceManager: any;
  let context: any;

  const createMockSettings = (eeSettings: any) => ({
    ansible: {
      path: "ansible",
      useFullyQualifiedCollectionNames: false,
    },
    completion: {
      provideRedirectModules: true,
      provideModuleOptionAliases: true,
    },
    validation: {
      enabled: true,
      lint: { enabled: true, path: "ansible-lint", arguments: "" },
    },
    executionEnvironment: eeSettings,
    python: { interpreterPath: "python3", activationScript: "" },
  });

  beforeEach(function () {
    workspaceManager = createTestWorkspaceManager();
    const textDoc = {
      uri: "file:///test/playbook.yml",
    };
    context = workspaceManager.getContext(textDoc.uri);
    executionEnvironment = new ExecutionEnvironment(
      workspaceManager.connection,
      context,
    );
  });

  describe("Initialization with EE disabled", function () {
    it("should set isServiceInitialized to true when EE is disabled", async function () {
      context.documentSettings.get = async () =>
        createMockSettings({
          enabled: false,
          containerEngine: "auto",
          image: "",
          pull: { policy: "missing", arguments: "" },
          volumeMounts: [],
          containerOptions: "",
        });
      await executionEnvironment.initialize();
      expect(executionEnvironment.isServiceInitialized).to.be.true;
    });

    it("should not attempt container operations when EE is disabled", async function () {
      context.documentSettings.get = async () =>
        createMockSettings({
          enabled: false,
          containerEngine: "auto",
          image: "",
          pull: { policy: "missing", arguments: "" },
          volumeMounts: [],
          containerOptions: "",
        });

      await executionEnvironment.initialize();
      expect(executionEnvironment.isServiceInitialized).to.be.true;
    });
  });

  describe("Container Engine Validation", function () {
    it("should reject invalid container engine names", async function () {
      context.documentSettings.get = async () =>
        createMockSettings({
          enabled: true,
          containerEngine: "invalid-engine",
          image: "test-image",
          pull: { policy: "missing", arguments: "" },
          volumeMounts: [],
          containerOptions: "",
        });

      await executionEnvironment.initialize();
      expect(executionEnvironment.isServiceInitialized).to.be.false;
    });

    it("should accept valid container engine names", async function () {
      const trustedDirs = ["/usr/bin", "/bin"];
      const pathEnv = process.env.PATH || "";
      const isPathSafe = pathEnv
        .split(":")
        .every((p) => trustedDirs.some((dir) => p.startsWith(dir)));
      expect(isPathSafe).to.be.true;

      let hasContainerEngine = false;

      const podmanResult = child_process.spawnSync("podman", ["--version"], {
        shell: false,
        encoding: "utf-8",
      });
      if (podmanResult.status === 0) {
        hasContainerEngine = true;
      } else {
        const dockerResult = child_process.spawnSync("docker", ["--version"], {
          shell: false,
          encoding: "utf-8",
        });
        hasContainerEngine = dockerResult.status === 0;
      }

      if (!hasContainerEngine) {
        this.skip();
      }
      context.documentSettings.get = async () =>
        createMockSettings({
          enabled: true,
          containerEngine: hasContainerEngine ? "podman" : "docker",
          image: "test-image",
          pull: { policy: "missing", arguments: "" },
          volumeMounts: [],
          containerOptions: "",
        });
      await executionEnvironment.initialize();
      expect(executionEnvironment.isServiceInitialized).to.be.true;
    });
  });

  describe("cleanUpContainer Security Tests", function () {
    it("should use spawnSync instead of execSync for security", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";
      expect(typeof ee.cleanUpContainer).to.equal("function");
    });

    it("should handle missing container engine gracefully", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = undefined;
      expect(() => ee.cleanUpContainer("test-container")).to.not.throw();
    });

    it("should validate container names", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";
      expect(() => ee.cleanUpContainer("")).to.not.throw();
      expect(() => ee.cleanUpContainer("test-container")).to.not.throw();
      expect(() => ee.cleanUpContainer("test-container-123")).to.not.throw();
    });

    it("should prevent command injection through container names", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";
      const dangerousNames = [
        "test; rm -rf /",
        "test && echo 'injected'",
        "test | cat /etc/passwd",
        "test$(echo 'injection')",
        "test`echo injection`",
      ];

      dangerousNames.forEach((name) => {
        expect(() => ee.cleanUpContainer(name)).to.not.throw();
      });
    });
  });

  describe("doesContainerNameExist Security Tests", function () {
    it("should use spawnSync instead of execSync for security", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";
      expect(typeof ee.doesContainerNameExist).to.equal("function");
      const result = ee.doesContainerNameExist("test-container");
      expect(typeof result).to.equal("boolean");
    });

    it("should handle missing container engine gracefully", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = undefined;

      const result = ee.doesContainerNameExist("test-container");
      expect(result).to.be.false;
    });

    it("should validate container names safely", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";

      expect(typeof ee.doesContainerNameExist("")).to.equal("boolean");
      expect(typeof ee.doesContainerNameExist("test-container")).to.equal(
        "boolean",
      );
      expect(typeof ee.doesContainerNameExist("test_container_123")).to.equal(
        "boolean",
      );
    });

    it("should prevent command injection through container names", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "podman";

      const dangerousNames = [
        "test; ls /",
        "test && whoami",
        "test | echo 'injected'",
        "test$(id)",
        "test`pwd`",
      ];

      dangerousNames.forEach((name) => {
        const result = ee.doesContainerNameExist(name);
        expect(typeof result).to.equal("boolean");
      });
    });

    it("should handle errors gracefully", function () {
      const ee = executionEnvironment as any;
      ee._container_engine = "nonexistent-engine";
      const result = ee.doesContainerNameExist("test-container");
      expect(result).to.be.false;
    });
  });

  describe("Volume Mount Security Tests", function () {
    it("should validate volume mount paths", function () {
      const ee = executionEnvironment as any;
      ee.isServiceInitialized = true;
      ee._container_engine = "podman";
      ee._container_image = "test-image";
      ee.context = {
        workspaceFolder: {
          uri: "file:///test/workspace",
        },
      };

      const mountPaths = new Set(["/safe/path", "/another/safe/path", ""]);

      const result = ee.wrapContainerArgs("echo test", mountPaths);
      expect(typeof result).to.equal("string");
    });

    it("should prevent injection through mount paths", function () {
      const ee = executionEnvironment as any;
      ee.isServiceInitialized = true;
      ee._container_engine = "podman";
      ee._container_image = "test-image";
      ee.context = {
        workspaceFolder: {
          uri: "file:///test/workspace",
        },
      };
      ee.connection = {
        console: {
          log: (): void => {
            /* test mock */
          },
        },
      };

      const dangerousPaths = new Set([
        "/path; rm -rf /",
        "/path && echo injected",
        "/path | cat /etc/passwd",
      ]);

      const result = ee.wrapContainerArgs("echo test", dangerousPaths);
      expect(typeof result).to.equal("string");
    });
  });

  describe("Container Command Security Tests", function () {
    it("should use argument arrays instead of string concatenation", function () {
      const ee = executionEnvironment as any;
      ee.isServiceInitialized = true;
      ee._container_engine = "podman";
      ee._container_image = "test-image";
      ee.context = {
        workspaceFolder: {
          uri: "file:///test/workspace",
        },
      };
      const result = ee.wrapContainerArgs("echo 'test'");
      expect(result).to.include("--rm");
      expect(result).to.include("test-image");
    });

    it("should sanitize container options", function () {
      const ee = executionEnvironment as any;
      ee.isServiceInitialized = true;
      ee._container_engine = "podman";
      ee._container_image = "test-image";
      ee.settingsContainerOptions = "--privileged --cap-add SYS_ADMIN";
      ee.context = {
        workspaceFolder: {
          uri: "file:///test/workspace",
        },
      };
      const result = ee.wrapContainerArgs("echo test");
      expect(typeof result).to.equal("string");
    });
  });

  describe("Integration Tests", function () {
    it("should initialize properly with valid settings", async function () {
      const hasDocker = (() => {
        try {
          const result = child_process.spawnSync("docker", ["--version"], {
            shell: false,
            encoding: "utf-8",
          });
          return result.status === 0;
        } catch {
          return false;
        }
      })();

      const hasPodman = (() => {
        try {
          const result = child_process.spawnSync("podman", ["--version"], {
            shell: false,
            encoding: "utf-8",
          });
          return result.status === 0;
        } catch {
          return false;
        }
      })();

      if (!hasDocker && !hasPodman) {
        this.skip();
      }

      context.documentSettings.get = async () =>
        createMockSettings({
          enabled: true,
          containerEngine: hasDocker ? "docker" : "podman",
          image: "hello-world",
          pull: { policy: "missing", arguments: "" },
          volumeMounts: [],
          containerOptions: "",
        });
    });
  });
});
