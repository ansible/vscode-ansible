/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "vitest";
import sinon from "sinon";
import { Connection } from "vscode-languageserver";
import { ExecutionEnvironment } from "@src/services/executionEnvironment.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import { mapHostPathToContainerPath } from "@src/utils/containerPath.js";

const mockConnection = {
  window: {
    showErrorMessage: sinon.stub(),
    createWorkDoneProgress: sinon.stub().resolves({
      begin: sinon.stub(),
      done: sinon.stub(),
    }),
  },
  console: {
    error: sinon.stub(),
    log: sinon.stub(),
    info: sinon.stub(),
  },
};
const mockContext = {
  workspaceFolder: { uri: "file:///mock-folder" },
  clientCapabilities: { window: { workDoneProgress: true } },
  documentSettings: {
    get: sinon.stub(),
  },
};

const mockSettings = {
  executionEnvironment: {
    enabled: true,
    image: "test-image",
    containerEngine: "docker",
    volumeMounts: [],
    containerOptions: "",
    pull: { policy: "always", arguments: "" },
  },
};

describe("container path mapping", () => {
  it("maps Windows paths with spaces to absolute Linux paths", () => {
    expect(
      mapHostPathToContainerPath(
        "C:\\\\Users\\\\Dhruv Dagar\\\\ansible.cfg",
        true,
      ),
    ).toBe("/mnt/c/Users/Dhruv Dagar/ansible.cfg");
  });

  it("maps paths outside the workspace without changing the host source", () => {
    const hostPath = "D:\\\\Ansible Config\\\\ansible.cfg";
    expect(mapHostPathToContainerPath(hostPath, true)).toBe(
      "/mnt/d/Ansible Config/ansible.cfg",
    );
    expect(hostPath).toBe("D:\\\\Ansible Config\\\\ansible.cfg");
  });

  it("leaves Linux and macOS paths unchanged", () => {
    expect(mapHostPathToContainerPath("/tmp/config dir/ansible.cfg", false)).toBe(
      "/tmp/config dir/ansible.cfg",
    );
  });
});

describe("@ee", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockContext.documentSettings.get.reset();
    Object.values(mockConnection.console).forEach((fn) => {
      fn.reset?.();
    });
    Object.values(mockConnection.window).forEach((fn) => {
      fn.reset?.();
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should initialize properties", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      expect(ee.isServiceInitialized).toBe(false);
    });
  });

  describe("initialize", () => {
    it("should set isServiceInitialized true if executionEnvironment is disabled", async () => {
      mockContext.documentSettings.get.resolves({
        executionEnvironment: { enabled: false },
      });
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(true);
    });

    it("should set isServiceInitialized false if setContainerEngine fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
    });

    it("should set isServiceInitialized false if pullContainerImage fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
    });

    it("should set isServiceInitialized true if all steps succeed", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(true);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(true);
    });

    it("should handle errors and set isServiceInitialized false", async () => {
      mockContext.documentSettings.get.rejects(new Error("fail"));
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
      expect(mockConnection.window.showErrorMessage.called).toBe(true);
    });

    it("should reject unsafe containerOptions during initialize", async () => {
      mockContext.documentSettings.get.resolves({
        ...mockSettings,
        executionEnvironment: {
          ...mockSettings.executionEnvironment,
          containerOptions: "; touch /tmp/cve-44191",
        },
      });
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
      expect(mockConnection.window.showErrorMessage.called).toBe(true);
    });
  });

  describe("wrapContainerArgs", () => {
    it("should return undefined if not initialized", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      const result = ee.wrapContainerArgs("echo hello");
      expect(result).toBeUndefined();
    });

    it("should generate a container command string", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      ee.isServiceInitialized = true;
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any).settingsVolumeMounts = [];
      (ee as any).settingsContainerOptions = "";
      const result = ee.wrapContainerArgs("echo hello", new Set(["/tmp"]));
      expect(result).toBeDefined();
      expect(result?.join(" ")).toContain("docker run --rm");
      expect(result).toContain("test-image");
      expect(result).toContain("echo");
      expect(result).toContain("hello");
    });

    it("should pass an explicit Ansible config environment override", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      ee.isServiceInitialized = true;
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any).settingsVolumeMounts = [];
      (ee as any).settingsContainerOptions = "";
      const result = ee.wrapContainerArgs(
        "ansible-config dump",
        new Set(["/tmp/config dir"]),
        { ANSIBLE_CONFIG: "/tmp/config dir/ansible.cfg" },
      );
      expect(result).toContain("-e");
      expect(result).toContain("ANSIBLE_CONFIG=/tmp/config dir/ansible.cfg");
      expect(result).toContain("-v");
      expect(result).toContain("/tmp/config dir:/tmp/config dir");
    });
  });

  describe("getBasicContainerAndImageDetails", () => {
    it("should return basic details", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as unknown as Connection,
        mockContext as unknown as WorkspaceFolderContext,
      );
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any)._container_volume_mounts = [];
      const details = ee.getBasicContainerAndImageDetails;
      expect(details.containerEngine).toBe("docker");
      expect(details.containerImage).toBe("test-image");
      expect(details.containerVolumeMounts).toEqual([]);
    });
  });
});
