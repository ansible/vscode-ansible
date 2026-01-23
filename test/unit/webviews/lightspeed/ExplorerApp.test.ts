import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ExplorerApp from "../../../../webviews/lightspeed/src/ExplorerApp.vue";
import { vscodeApi } from "../../../../webviews/lightspeed/src/utils/vscode";

// Get the mocked vscodeApi
vi.mock("../../../../webviews/lightspeed/src/utils/vscode", () => ({
  vscodeApi: {
    post: vi.fn(),
    on: vi.fn(),
  },
}));

describe("ExplorerApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the explorer container", () => {
    const wrapper = mount(ExplorerApp);
    expect(wrapper.find("#explorer-container").exists()).toBe(true);
  });

  it("shows loading state initially", () => {
    const wrapper = mount(ExplorerApp);
    expect(wrapper.text()).toContain("Loading...");
  });

  it("requests explorer state on mount", async () => {
    mount(ExplorerApp);
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("getExplorerState", {});
  });

  it("registers message handlers on mount", () => {
    mount(ExplorerApp);
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "userRefreshExplorerState",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "explorerStateUpdate",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "playbookOpenedStateChanged",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "roleOpenedStateChanged",
      expect.any(Function),
    );
  });

  describe("when not authenticated", () => {
    it("shows login prompt after loading completes", async () => {
      const wrapper = mount(ExplorerApp);

      // Simulate explorerStateUpdate message
      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({ isAuthenticated: false, provider: "wca" });
      await flushPromises();

      expect(wrapper.text()).toContain("Experience smarter automation");
      expect(wrapper.find("#lightspeed-explorer-connect").exists()).toBe(true);
    });

    it("calls explorerConnect when Connect is clicked", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({ isAuthenticated: false, provider: "wca" });
      await flushPromises();

      const connectButton = wrapper.find("#lightspeed-explorer-connect");
      await connectButton.trigger("click");

      expect(vscodeApi.post).toHaveBeenCalledWith("explorerConnect", {});
    });
  });

  describe("when authenticated", () => {
    it("shows action buttons after loading completes", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        userContent: "Logged in as: test@example.com",
        hasPlaybookOpened: false,
        hasRoleOpened: false,
      });
      await flushPromises();

      expect(
        wrapper.find("#lightspeed-explorer-playbook-generation-submit").exists(),
      ).toBe(true);
      expect(
        wrapper
          .find("#lightspeed-explorer-playbook-explanation-submit")
          .exists(),
      ).toBe(true);
      expect(
        wrapper.find("#lightspeed-explorer-role-generation-submit").exists(),
      ).toBe(true);
      expect(
        wrapper.find("#lightspeed-explorer-role-explanation-submit").exists(),
      ).toBe(true);
    });

    it("displays user content", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        userContent: "Logged in as: test@example.com",
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Logged in as: test@example.com");
    });

    it("calls explorerGeneratePlaybook when Generate Playbook is clicked", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({ isAuthenticated: true });
      await flushPromises();

      const button = wrapper.find(
        "#lightspeed-explorer-playbook-generation-submit",
      );
      await button.trigger("click");

      expect(vscodeApi.post).toHaveBeenCalledWith(
        "explorerGeneratePlaybook",
        {},
      );
    });

    it("calls explorerExplainPlaybook when Explain Playbook is clicked", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        hasPlaybookOpened: true,
      });
      await flushPromises();

      const button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      await button.trigger("click");

      expect(vscodeApi.post).toHaveBeenCalledWith(
        "explorerExplainPlaybook",
        {},
      );
    });

    it("calls explorerGenerateRole when Generate Role is clicked", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({ isAuthenticated: true });
      await flushPromises();

      const button = wrapper.find(
        "#lightspeed-explorer-role-generation-submit",
      );
      await button.trigger("click");

      expect(vscodeApi.post).toHaveBeenCalledWith("explorerGenerateRole", {});
    });

    it("calls explorerExplainRole when Explain Role is clicked", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];

      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        hasRoleOpened: true,
      });
      await flushPromises();

      const button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      await button.trigger("click");

      expect(vscodeApi.post).toHaveBeenCalledWith("explorerExplainRole", {});
    });
  });

  describe("state change handlers", () => {
    it("updates hasPlaybookOpened when playbookOpenedStateChanged is received", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // First set authenticated state
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];
      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        hasPlaybookOpened: false,
      });
      await flushPromises();

      // Button should be disabled
      let button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      expect(button.attributes("disabled")).toBeDefined();

      // Simulate state change
      const playbookStateHandler = onCalls.find(
        (call) => call[0] === "playbookOpenedStateChanged",
      )?.[1];
      playbookStateHandler?.({ hasPlaybookOpened: true });
      await flushPromises();

      // Button should now be enabled
      button = wrapper.find(
        "#lightspeed-explorer-playbook-explanation-submit",
      );
      const disabledAttr = button.attributes("disabled");
      expect(
        disabledAttr === undefined || disabledAttr === "false",
      ).toBeTruthy();
    });

    it("updates hasRoleOpened when roleOpenedStateChanged is received", async () => {
      const wrapper = mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;

      // First set authenticated state
      const explorerStateUpdateHandler = onCalls.find(
        (call) => call[0] === "explorerStateUpdate",
      )?.[1];
      explorerStateUpdateHandler?.({
        isAuthenticated: true,
        hasRoleOpened: false,
      });
      await flushPromises();

      // Button should be disabled
      let button = wrapper.find(
        "#lightspeed-explorer-role-explanation-submit",
      );
      expect(button.attributes("disabled")).toBeDefined();

      // Simulate state change
      const roleStateHandler = onCalls.find(
        (call) => call[0] === "roleOpenedStateChanged",
      )?.[1];
      roleStateHandler?.({ hasRoleOpened: true });
      await flushPromises();

      // Button should now be enabled
      button = wrapper.find("#lightspeed-explorer-role-explanation-submit");
      const disabledAttr = button.attributes("disabled");
      expect(
        disabledAttr === undefined || disabledAttr === "false",
      ).toBeTruthy();
    });

    it("requests state refresh when userRefreshExplorerState is received", async () => {
      mount(ExplorerApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const refreshHandler = onCalls.find(
        (call) => call[0] === "userRefreshExplorerState",
      )?.[1];

      vi.mocked(vscodeApi.post).mockClear();
      refreshHandler?.({});

      expect(vscodeApi.post).toHaveBeenCalledWith("getExplorerState", {});
    });
  });
});
