import { expect } from "chai";
import sinon from "sinon";
import { ExecutionEnvironment } from "../../src/services/executionEnvironment";

// Mocks
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

describe("ExecutionEnvironment", () => {
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
      expect(ee.isServiceInitialized).to.be.false;
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
      expect(ee.isServiceInitialized).to.be.true;
    });

    it("should set isServiceInitialized false if setContainerEngine fails", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(false);
      await ee.initialize();
      expect(ee.isServiceInitialized).to.be.false;
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
      expect(ee.isServiceInitialized).to.be.false;
    });

    it("should set isServiceInitialized true if all steps succeed", async () => {
      mockContext.documentSettings.get.resolves(mockSettings);
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      sandbox.stub(ee as any, "setContainerEngine").returns(true);
      sandbox.stub(ee as any, "pullContainerImage").resolves(true);
      await ee.initialize();
      expect(ee.isServiceInitialized).to.be.true;
    });

    // it("should handle errors and set isServiceInitialized false", async () => {
    //   mockContext.documentSettings.get.rejects(new Error("fail"));
    //   const ee = new ExecutionEnvironment(
    //     mockConnection as any,
    //     mockContext as any,
    //   );
    //   await ee.initialize();
    //   expect(ee.isServiceInitialized).to.be.false;
    //   expect(mockConnection.window.showErrorMessage.called).to.be.true;
    // });
  });

  describe("wrapContainerArgs", () => {
    it("should return undefined if not initialized", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      const result = ee.wrapContainerArgs("echo hello");
      expect(result).to.be.undefined;
    });

    it("should generate a container command string", () => {
      const ee = new ExecutionEnvironment(
        mockConnection as any,
        mockContext as any,
      );
      ee.isServiceInitialized = true;
      (ee as any)._container_engine = "docker";
      (ee as any)._container_image = "test-image";
      (ee as any).settingsVolumeMounts = [];
      (ee as any).settingsContainerOptions = "";
      const result = ee.wrapContainerArgs("echo hello", new Set(["/tmp"]));
      expect(result).to.include("docker run --rm");
      expect(result).to.include("test-image");
      expect(result).to.include("echo hello");
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
      (ee as any)._container_image_id = "imgid";
      (ee as any)._container_volume_mounts = [];
      const details = ee.getBasicContainerAndImageDetails;
      expect(details.containerEngine).to.equal("docker");
      expect(details.containerImage).to.equal("test-image");
      expect(details.containerImageId).to.equal("imgid");
      expect(details.containerVolumeMounts).to.deep.equal([]);
    });
  });

  // You can add more tests for private methods by accessing them via `ee as any`
});
