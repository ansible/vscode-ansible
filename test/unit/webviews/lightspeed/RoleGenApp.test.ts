import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RoleGenApp from "../../../../webviews/lightspeed/src/RoleGenApp.vue";
import { vscodeApi } from "../../../../webviews/lightspeed/src/utils/vscode";

describe("RoleGenApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main header", () => {
    const wrapper = mount(RoleGenApp);
    expect(wrapper.find("#main-header").text()).toBe(
      "Create a role with Ansible Lightspeed",
    );
  });

  it("shows page 1 of 3 initially", () => {
    const wrapper = mount(RoleGenApp);
    expect(wrapper.find("#page-number").text()).toBe("1 of 3");
  });

  it("registers message handlers on mount", () => {
    mount(RoleGenApp);
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "generateRole",
      expect.any(Function),
    );
    expect(vscodeApi.on).toHaveBeenCalledWith(
      "errorMessage",
      expect.any(Function),
    );
  });

  it("sends feedback event on open", async () => {
    mount(RoleGenApp);
    await flushPromises();
    expect(vscodeApi.post).toHaveBeenCalledWith("feedback", {
      request: expect.objectContaining({
        roleGenerationAction: expect.objectContaining({
          action: expect.any(Number),
          fromPage: undefined,
          toPage: 1,
        }),
      }),
    });
  });

  it("contains learn more link to roles documentation", () => {
    const wrapper = mount(RoleGenApp);
    const link = wrapper.find("a");
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain("Learn more about roles");
    expect(link.attributes("href")).toContain("playbooks_reuse_roles.html");
  });

  describe("page 1 - prompt input", () => {
    it("renders the prompt field", () => {
      const wrapper = mount(RoleGenApp);
      expect(wrapper.findComponent({ name: "PromptField" }).exists()).toBe(
        true,
      );
    });

    it("renders the Analyze button disabled when prompt is empty", () => {
      const wrapper = mount(RoleGenApp);
      const button = wrapper.find("vscode-button");
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe("Analyze");
      expect(button.attributes("disabled")).toBeDefined();
    });

    it("renders the examples box", () => {
      const wrapper = mount(RoleGenApp);
      expect(wrapper.findComponent({ name: "PromptExampleBox" }).exists()).toBe(
        true,
      );
    });
  });

  describe("error handling", () => {
    it("displays error message when received", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const errorHandler = onCalls.find(
        (call) => call[0] === "errorMessage",
      )?.[1];

      errorHandler?.("Generation failed");
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });

  describe("page transitions", () => {
    it("advances to page 2 when generateRole response is received", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
    });

    it("shows role name input and outline review on page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      expect(wrapper.text()).toContain("Role name:");
      expect(wrapper.findComponent({ name: "OutlineReview" }).exists()).toBe(
        true,
      );
      expect(wrapper.findComponent({ name: "StatusBoxPrompt" }).exists()).toBe(
        true,
      );
    });

    it("shows Continue and Back buttons on page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      const buttons = wrapper.findAll("vscode-button");
      expect(buttons.some((b) => b.text() === "Continue")).toBe(true);
      expect(buttons.some((b) => b.text() === "Back")).toBe(true);
    });

    it("shows generated files and collection selector on page 3", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      generateHandler?.({
        name: "my_role",
        files: [
          { path: "tasks/main.yml", content: "- debug: msg=hello" },
          { path: "defaults/main.yml", content: "my_var: value" },
        ],
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("3 of 3");
      expect(
        wrapper.findAllComponents({ name: "GeneratedFileEntry" }).length,
      ).toBe(2);
      expect(
        wrapper.findComponent({ name: "CollectionSelector" }).exists(),
      ).toBe(true);
    });

    it("shows Save files button on page 3", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      const buttons = wrapper.findAll("vscode-button");
      expect(buttons.some((b) => b.text() === "Save files")).toBe(true);
    });

    it("can navigate back from page 2 to page 1", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Back button
      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("1 of 3");
    });

    it("can navigate back from page 3 to page 2", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      // Go to page 2
      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
      });
      await flushPromises();

      // Click Continue to go to page 3
      const continueButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Continue");
      await continueButton?.trigger("click");
      await flushPromises();

      // Click Back to go to page 2
      const backButton = wrapper
        .findAll("vscode-button")
        .find((b) => b.text() === "Back");
      await backButton?.trigger("click");
      await flushPromises();

      expect(wrapper.find("#page-number").text()).toBe("2 of 3");
    });
  });

  describe("warnings handling", () => {
    it("displays warnings from response in error box", async () => {
      const wrapper = mount(RoleGenApp);

      const onCalls = vi.mocked(vscodeApi.on).mock.calls;
      const generateHandler = onCalls.find(
        (call) => call[0] === "generateRole",
      )?.[1];

      generateHandler?.({
        name: "my_role",
        files: [{ path: "tasks/main.yml", content: "- debug: msg=hello" }],
        outline: "1. Debug message",
        warnings: ["Warning 1", "Warning 2"],
      });
      await flushPromises();

      expect(wrapper.findComponent({ name: "ErrorBox" }).exists()).toBe(true);
    });
  });
});
