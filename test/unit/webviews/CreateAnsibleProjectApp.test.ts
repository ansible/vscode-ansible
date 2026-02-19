import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import CreateAnsibleProjectApp from "../../../webviews/CreateAnsibleProjectApp.vue";

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock("../../../webviews/lightspeed/src/utils/vscode", () => ({
  vscodeApi: {
    postMessage: mockPostMessage,
    post: vi.fn(),
    on: vi.fn(),
    postAndReceive: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@vscode/codicons/dist/codicon.css", () => ({}));

vi.mock(
  "../../../src/features/contentCreator/webviewUtils",
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      // @ts-expect-error - importOriginal returns unknown
      ...actual,
      initializeUI: vi.fn(),
      setupMessageHandler: vi.fn(),
      openFolderExplorer: vi.fn(),
      openFileExplorer: vi.fn(),
      clearLogs: vi.fn(),
      copyLogs: vi.fn(),
      openLogFile: vi.fn(),
      openScaffoldedFolder: vi.fn(),
    };
  },
);

describe("CreateAnsibleProjectApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims whitespace from text fields in payload", async () => {
    const wrapper = mount(CreateAnsibleProjectApp);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vm = wrapper.vm as any;

    vm.namespace = "  mynamespace  ";
    vm.collectionName = "  mycollection  ";
    vm.initPath = "  /home/test/path  ";

    await wrapper.find("#create-button").trigger("click");

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "init-create",
        payload: expect.objectContaining({
          namespaceName: "mynamespace",
          collectionName: "mycollection",
          destinationPath: "/home/test/path",
        }),
      }),
    );
  });

  it("disables create button when namespace or collection is 2 chars or less", () => {
    const wrapper = mount(CreateAnsibleProjectApp);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vm = wrapper.vm as any;

    vm.namespace = "ss";
    vm.collectionName = "ss";

    const button = wrapper.find("#create-button");
    expect(button.attributes("disabled")).toBeDefined();
  });
});
