/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "vitest";
import sinon from "sinon";
import { ExecutionEnvironment } from "@src/services/executionEnvironment.js";

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

describe("@ee", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockContext.documentSettings.get.reset();
    Object.values(mockConnection.console).forEach(
      (fn) => fn.reset && fn.reset(),
    );
    Object.values(mockConnection.window).forEach(
      (fn) => fn.reset && fn.reset(),
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should initialize properties", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
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
        mockConnection as any,
        mockContext as any,
      );
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(true);
    });

    it("should set isServiceInitialized false if setContainerEngine fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
    });

    it("should set isServiceInitialized false if pullContainerImage fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
    });

    it("should not initialize if startPersistentContainer fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(true);
      sandbox.stub(ee as any, "startPersistentContainer").returns(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
    });

    it("should set isServiceInitialized true if all steps succeed", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(true);
      sandbox.stub(ee as any, "startPersistentContainer").returns(true);
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(true);
    });

    it("should handle errors and set isServiceInitialized false", async () => {
      mockContext.documentSettings.get.rejects(new Error("fail"));
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      await ee.initialize();
      expect(ee.isServiceInitialized).toBe(false);
      expect(mockConnection.window.showErrorMessage.called).toBe(true);
    });
  });

  describe("execInContainer", () => {
    it("should return undefined if not initialized", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      const result = ee.execInContainer("echo hello");
      expect(result).toBeUndefined();
    });

    it("should generate a docker exec command when persistent container is running", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      ee.isServiceInitialized = true;
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any)._persistentContainerName = "als_persistent_abc123";
      (ee as any)._isPersistentContainerRunning = true;
      (ee as any)._lastHealthCheckTime = Date.now();
      const result = ee.execInContainer("ansible-lint --version");
      expect(result).toContain("docker exec");
      expect(result).toContain("als_persistent_abc123");
      expect(result).toContain("ansible-lint --version");
      expect(result).not.toContain("docker run");
    });

    it("should return undefined when persistent container is not running", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      ee.isServiceInitialized = true;
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any)._persistentContainerName = "als_persistent_abc123";
      (ee as any)._isPersistentContainerRunning = false;
      (ee as any)._lastHealthCheckTime = 0;
      const result = ee.execInContainer("echo hello");
      expect(result).toBeUndefined();
    });
  });

  describe("dispose", () => {
    it("should clean up persistent container", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      (ee as any)._container_engine = "docker";
      (ee as any)._persistentContainerName = "als_persistent_abc123";
      (ee as any)._isPersistentContainerRunning = true;
      const cleanUpStub = sandbox.stub(ee as any, "cleanUpContainer");
      ee.dispose();
      expect(cleanUpStub.calledWith("als_persistent_abc123")).toBe(true);
      expect((ee as any)._isPersistentContainerRunning).toBe(false);
      expect((ee as any)._persistentContainerName).toBeUndefined();
    });

    it("should be safe to call when no persistent container exists", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      expect(() => ee.dispose()).not.toThrow();
    });
  });

  describe("command cache", () => {
    it("should store and retrieve cached commands", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      ee.setCachedCommand("python3 --version", {
        stdout: "Python 3.11.0",
        stderr: "",
      });
      const cached = ee.getCachedCommand("python3 --version");
      expect(cached).toBeDefined();
      expect(cached?.stdout).toBe("Python 3.11.0");
    });

    it("should return undefined for uncached commands", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      expect(ee.getCachedCommand("nonexistent")).toBeUndefined();
    });

    it("should clear the cache", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      ee.setCachedCommand("key", { stdout: "val", stderr: "" });
      ee.clearCommandCache();
      expect(ee.getCachedCommand("key")).toBeUndefined();
    });
  });

  describe("getBasicContainerAndImageDetails", () => {
    it("should return basic details", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
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
